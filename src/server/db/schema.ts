import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
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

/** One detected item in one run. Rows are never updated after insert. */
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
