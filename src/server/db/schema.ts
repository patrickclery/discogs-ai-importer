import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import {
  BULK_ITEM_STATUSES,
  BULK_SKIP_REASONS,
  PRESSING_OUTCOMES,
} from '@/lib/bulk-types';
import {
  CANDIDATE_SOURCES,
  SEARCH_KINDS,
  SEARCH_STAGES,
  SEARCH_STATUSES,
} from '@/lib/discogs-types';
import { IMPORT_STATUSES } from '@/lib/import-types';
import { PHOTO_STATUSES, SPINE_STATES } from '@/lib/scan-types';
import { SPINE_FIELDS } from '@/lib/vision-contract';

/** Durable job queue (D-12). Timestamps are epoch milliseconds. */
export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    lane: text('lane', { enum: ['anthropic', 'discogs'] }).notNull(),
    type: text('type').notNull(),
    payload: text('payload').notNull().default('{}'),
    status: text('status', {
      enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'],
    })
      .notNull()
      .default('queued'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    runAfter: integer('run_after').notNull(),
    dedupeKey: text('dedupe_key').unique(),
    lockedAt: integer('locked_at'),
    lastError: text('last_error'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    finishedAt: integer('finished_at'),
  },
  (t) => [index('jobs_claim_idx').on(t.lane, t.status, t.runAfter)],
);

/** Non-secret settings (D-08); value holds JSON. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** Cross-process worker guard, used by Plan 01-02. */
export const workerLease = sqliteTable('worker_lease', {
  id: integer('id').primaryKey(),
  bootId: text('boot_id').notNull(),
  pid: integer('pid').notNull(),
  heartbeatAt: integer('heartbeat_at').notNull(),
  acquiredAt: integer('acquired_at').notNull(),
});

export type JobRow = typeof jobs.$inferSelect;

// ---------------------------------------------------------------------------
// Phase 2: shelf scan (D-10, D-13; RESEARCH Pattern 6). Paths are relative to
// DATA_DIR and resolved only through resolveData().

/** One uploaded file, content-addressed by the sha256 of its original bytes. */
export const photos = sqliteTable('photos', {
  id: text('id').primaryKey(),
  sha256: text('sha256').notNull().unique(),
  originalName: text('original_name').notNull(),
  mime: text('mime').notNull(),
  bytes: integer('bytes').notNull(),
  originalPath: text('original_path').notNull(),
  thumbPath: text('thumb_path'),
  /** Newest vision run for this photo (no FK: the run references the photo). */
  latestRunId: text('latest_run_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** One vision call (or attempt at one) for a photo; run_no counts from 1. */
export const visionRuns = sqliteTable(
  'vision_runs',
  {
    id: text('id').primaryKey(),
    photoId: text('photo_id')
      .notNull()
      .references(() => photos.id),
    runNo: integer('run_no').notNull(),
    status: text('status', { enum: PHOTO_STATUSES })
      .notNull()
      .default('queued'),
    errorKind: text('error_kind'),
    errorReason: text('error_reason'),
    jobId: text('job_id'),
    /** Stamped by the scan job when the run starts (Plan 02-04). */
    model: text('model'),
    effort: text('effort'),
    promptVersion: integer('prompt_version').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    maxEdge: integer('max_edge'),
    maxTokens: integer('max_tokens'),
    sourceW: integer('source_w'),
    sourceH: integer('source_h'),
    visionW: integer('vision_w'),
    visionH: integer('vision_h'),
    visionPath: text('vision_path'),
    rawPath: text('raw_path'),
    reportedW: integer('reported_w'),
    reportedH: integer('reported_h'),
    spineCountEstimate: integer('spine_count_estimate'),
    detectedCount: integer('detected_count'),
    cdCount: integer('cd_count'),
    /** JSON array of DENSITY_FLAGS values. */
    densityFlags: text('density_flags').notNull().default('[]'),
    durationMs: integer('duration_ms'),
    costUsd: real('cost_usd'),
    usageJson: text('usage_json'),
    spawnedAt: integer('spawned_at'),
    finishedAt: integer('finished_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('vision_runs_photo_run_idx').on(t.photoId, t.runNo),
    index('vision_runs_status_idx').on(t.status),
  ],
);

/** One detected item in one run. Never changed once its run is stored. */
export const spineDetections = sqliteTable(
  'spine_detections',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => visionRuns.id),
    idx: integer('idx').notNull(),
    position: integer('position'),
    mediaKind: text('media_kind').notNull(),
    /** Box corners in the run's vision-image pixel space. */
    x1: integer('x1'),
    y1: integer('y1'),
    x2: integer('x2'),
    y2: integer('y2'),
    textOrientation: text('text_orientation'),
    legibility: text('legibility'),
    /** The AI read: { field: { value, confidence } } as returned. */
    fieldsJson: text('fields_json').notNull().default('{}'),
    cropPath: text('crop_path'),
    cropW: integer('crop_w'),
    cropH: integer('crop_h'),
    /**
     * The spine this detection was linked to when its run was stored (new or
     * matched). Never moved afterwards: a re-attach (orphans.ts) leaves it on
     * the superseded target. The spine a detection belongs to now is the one
     * whose spines.current_detection_id names it; resolve through that, not
     * through this column (IN-04).
     */
    spineId: text('spine_id'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('spine_detections_run_idx').on(t.runId),
    index('spine_detections_spine_idx').on(t.spineId),
  ],
);

/** Stable spine identity across re-scans (D-13). */
export const spines = sqliteTable(
  'spines',
  {
    id: text('id').primaryKey(),
    photoId: text('photo_id')
      .notNull()
      .references(() => photos.id),
    currentDetectionId: text('current_detection_id'),
    createdRunId: text('created_run_id'),
    state: text('state', { enum: SPINE_STATES }).notNull().default('active'),
    /** The owner marked it as not on Discogs (REV-05, D-14). */
    notOnDiscogs: integer('not_on_discogs', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('spines_photo_state_idx').on(t.photoId, t.state)],
);

/** Per-spine field values: AI read and the owner's value side by side (D-10). */
export const spineFields = sqliteTable(
  'spine_fields',
  {
    spineId: text('spine_id')
      .notNull()
      .references(() => spines.id),
    field: text('field', { enum: SPINE_FIELDS }).notNull(),
    aiValue: text('ai_value'),
    value: text('value'),
    confidence: real('confidence').notNull().default(0),
    editBaseAiValue: text('edit_base_ai_value'),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.spineId, t.field] })],
);

export type PhotoRow = typeof photos.$inferSelect;
export type VisionRunRow = typeof visionRuns.$inferSelect;
export type SpineDetectionRow = typeof spineDetections.$inferSelect;
export type SpineRow = typeof spines.$inferSelect;
export type SpineFieldRow = typeof spineFields.$inferSelect;

// ---------------------------------------------------------------------------
// Phase 3: Discogs match (D-08, D-10, D-16). One row per search attempt, and
// one candidate table for auto and manual candidates.

/** One Discogs search (or release lookup) for one spine. */
export const discogsSearches = sqliteTable(
  'discogs_searches',
  {
    id: text('id').primaryKey(),
    spineId: text('spine_id')
      .notNull()
      .references(() => spines.id),
    kind: text('kind', { enum: SEARCH_KINDS }).notNull(),
    /** sha256 of the normalized inputs; null for manual and release kinds. */
    inputHash: text('input_hash'),
    inputsJson: text('inputs_json').notNull().default('{}'),
    queryText: text('query_text'),
    releaseId: integer('release_id'),
    status: text('status', { enum: SEARCH_STATUSES })
      .notNull()
      .default('queued'),
    stage: text('stage', { enum: SEARCH_STAGES }),
    resultCount: integer('result_count'),
    totalCount: integer('total_count'),
    resultsJson: text('results_json'),
    errorKind: text('error_kind'),
    error: text('error'),
    jobId: text('job_id'),
    createdAt: integer('created_at').notNull(),
    finishedAt: integer('finished_at'),
  },
  (t) => [index('discogs_searches_spine_idx').on(t.spineId, t.createdAt)],
);

/** A candidate Discogs release for a spine; rank keeps Discogs order. */
export const discogsCandidates = sqliteTable(
  'discogs_candidates',
  {
    id: text('id').primaryKey(),
    spineId: text('spine_id')
      .notNull()
      .references(() => spines.id),
    searchId: text('search_id')
      .notNull()
      .references(() => discogsSearches.id),
    source: text('source', { enum: CANDIDATE_SOURCES }).notNull(),
    releaseId: integer('release_id').notNull(),
    rank: integer('rank').notNull(),
    /** Discogs' combined "Artist - Title", shown verbatim. */
    title: text('title').notNull(),
    artist: text('artist'),
    year: integer('year'),
    country: text('country'),
    labelsJson: text('labels_json').notNull().default('[]'),
    catno: text('catno'),
    formatsJson: text('formats_json').notNull().default('[]'),
    thumbUrl: text('thumb_url'),
    masterId: integer('master_id'),
    stage: text('stage', { enum: SEARCH_STAGES }),
    catnoMatch: integer('catno_match', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('discogs_candidates_spine_source_release_idx').on(
      t.spineId,
      t.source,
      t.releaseId,
    ),
    index('discogs_candidates_spine_idx').on(t.spineId),
  ],
);

export type DiscogsSearchRow = typeof discogsSearches.$inferSelect;
export type DiscogsCandidateRow = typeof discogsCandidates.$inferSelect;

// ---------------------------------------------------------------------------
// Phase 4: import (D-07, D-08). One row per confirmed release per spine. A
// failed row stays as history; at most one non-failed row per spine.

/** One confirmed release being added to (or added to) the Discogs collection. */
export const imports = sqliteTable(
  'imports',
  {
    id: text('id').primaryKey(),
    spineId: text('spine_id')
      .notNull()
      .references(() => spines.id),
    /** The confirmed candidate (D-01); no FK: a re-search replaces it. */
    candidateId: text('candidate_id'),
    releaseId: integer('release_id').notNull(),
    /** The folder this import used (D-03); at least 1. */
    folderId: integer('folder_id').notNull(),
    status: text('status', { enum: IMPORT_STATUSES })
      .notNull()
      .default('pending'),
    /** The owner chose "Add another copy" (D-05). */
    allowDuplicate: integer('allow_duplicate', { mode: 'boolean' })
      .notNull()
      .default(false),
    /** Reconciled after an ambiguous POST (D-07). */
    adopted: integer('adopted', { mode: 'boolean' }).notNull().default(false),
    /** "Link existing copy" (D-05). */
    linked: integer('linked', { mode: 'boolean' }).notNull().default(false),
    instanceId: integer('instance_id'),
    /** Set just before a POST (epoch ms). */
    intentAt: integer('intent_at'),
    /** JSON array of the instance ids seen right before the POST. */
    snapshotJson: text('snapshot_json'),
    /** JSON ExistingInstance[] for already_in_collection, ascending. */
    existingJson: text('existing_json'),
    /** JSON ImportCandidateSnapshot of the confirmed candidate. */
    candidateJson: text('candidate_json'),
    postCount: integer('post_count').notNull().default(0),
    errorKind: text('error_kind'),
    error: text('error'),
    jobId: text('job_id'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    importedAt: integer('imported_at'),
  },
  (t) => [
    uniqueIndex('imports_spine_open_idx')
      .on(t.spineId)
      .where(sql`${t.status} <> 'failed'`),
    uniqueIndex('imports_instance_idx')
      .on(t.instanceId)
      .where(sql`${t.instanceId} IS NOT NULL`),
    index('imports_release_idx').on(t.releaseId),
  ],
);

export type ImportRow = typeof imports.$inferSelect;

// ---------------------------------------------------------------------------
// Phase 6: bulk import (D-08, D-09, D-14). One run per "Import N to Discogs",
// one item per selected spine. An item hands its chosen release to the
// Phase 4 import pipeline; it never adds an import status of its own.

/** One bulk import the owner started. */
export const bulkRuns = sqliteTable('bulk_runs', {
  id: text('id').primaryKey(),
  /** The collection folder at start (D-03 of Phase 4). */
  folderId: integer('folder_id').notNull(),
  /** The preferred country at start, in the exact Discogs spelling (D-14). */
  country: text('country').notNull(),
  /** Items started. */
  total: integer('total').notNull(),
  createdAt: integer('created_at').notNull(),
});

/** One selected spine of a bulk run and its resolve_pressing job. */
export const bulkItems = sqliteTable(
  'bulk_items',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => bulkRuns.id),
    spineId: text('spine_id')
      .notNull()
      .references(() => spines.id),
    /** The candidate the owner saw; no FK: a re-search replaces it. */
    candidateId: text('candidate_id').notNull(),
    status: text('status', { enum: BULK_ITEM_STATUSES })
      .notNull()
      .default('queued'),
    outcome: text('outcome', { enum: PRESSING_OUTCOMES }),
    skipReason: text('skip_reason', { enum: BULK_SKIP_REASONS }),
    /** For a duplicate skip: the spine that holds the release (D-09). */
    dupSpineId: text('dup_spine_id'),
    /** The release the item imports, once chosen. */
    releaseId: integer('release_id'),
    country: text('country'),
    importId: text('import_id'),
    errorKind: text('error_kind'),
    error: text('error'),
    jobId: text('job_id'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('bulk_items_spine_open_idx')
      .on(t.spineId)
      .where(sql`${t.status} = 'queued'`),
    index('bulk_items_run_idx').on(t.runId),
    index('bulk_items_spine_idx').on(t.spineId, t.createdAt),
  ],
);

export type BulkRunRow = typeof bulkRuns.$inferSelect;
export type BulkItemRow = typeof bulkItems.$inferSelect;
