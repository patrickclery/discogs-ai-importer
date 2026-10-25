import 'server-only';
import type Database from 'better-sqlite3';
import { bulkItemPhaseOf, isCurrentBulkItem } from '@/lib/bulk-eligibility';
import {
  type BulkItemDto,
  type BulkItemStatus,
  type BulkRunDto,
  type BulkSkipReason,
  LOOKUP_ERROR_KINDS,
  type LookupErrorKind,
  type PressingOutcome,
} from '@/lib/bulk-types';
import { summarizeRun } from '@/lib/bulk-view';
import { type ImportStatus, importPhaseOf } from '@/lib/import-types';
import type { SpineDto } from '@/lib/scan-types';
import { collectionFolderName } from '../discogs/folders';
import { capCodePoints } from '../discogs/inputs';
import { openBulkItemCount } from './store';

// The bulk half of the /spines read model (D-06, D-09, D-15). One query per
// page, whatever the spine count: each listed spine's latest bulk item with
// its run, its job's status, the duplicate's holder and the spine's latest
// import; and one query over the latest run's items. Raw SQL with @named
// parameters and single-quoted literals (DQS=0). Only the failure kind, and
// for kind other the stored reason cut to 160 code points, reach the
// browser (T-06-11).

/** Owner-facing failure reasons are cut to this many code points. */
const REASON_MAX = 160;

const LATEST_ITEMS_SQL = `
  WITH latest AS (
    SELECT b.*,
      ROW_NUMBER() OVER (
        PARTITION BY b.spine_id ORDER BY b.created_at DESC, b.id DESC
      ) AS rn
    FROM bulk_items b
    WHERE b.spine_id IN (SELECT value FROM json_each(@ids))
  ),
  latest_import AS (
    SELECT i.spine_id, i.id, i.created_at,
      ROW_NUMBER() OVER (
        PARTITION BY i.spine_id ORDER BY i.created_at DESC, i.id DESC
      ) AS rn
    FROM imports i
    WHERE i.spine_id IN (SELECT value FROM json_each(@ids))
  )
  SELECT l.id, l.run_id, l.spine_id, l.status, l.outcome, l.skip_reason,
    l.release_id, l.country, l.import_id, l.error_kind, l.error,
    l.created_at, r.country AS run_country, j.status AS job_status,
    h.id AS holder_id, h.photo_id AS holder_photo_id,
    hp.original_name AS holder_photo_name, hd.idx AS holder_idx,
    li.id AS latest_import_id, li.created_at AS latest_import_created_at
  FROM latest l
  JOIN bulk_runs r ON r.id = l.run_id
  LEFT JOIN jobs j ON j.id = l.job_id
  LEFT JOIN spines h ON h.id = l.dup_spine_id
  LEFT JOIN photos hp ON hp.id = h.photo_id
  LEFT JOIN spine_detections hd ON hd.id = h.current_detection_id
  LEFT JOIN latest_import li ON li.spine_id = l.spine_id AND li.rn = 1
  WHERE l.rn = 1`;

type LatestItemRow = {
  id: string;
  run_id: string;
  spine_id: string;
  status: BulkItemStatus;
  outcome: PressingOutcome | null;
  skip_reason: BulkSkipReason | null;
  release_id: number | null;
  country: string | null;
  import_id: string | null;
  error_kind: string | null;
  error: string | null;
  created_at: number;
  run_country: string;
  job_status: string | null;
  holder_id: string | null;
  holder_photo_id: string | null;
  holder_photo_name: string | null;
  holder_idx: number | null;
  latest_import_id: string | null;
  latest_import_created_at: number | null;
};

/**
 * A recorded kind wins; a queued item read as failed (its job gave up) with
 * none recorded was interrupted; anything else is other.
 */
function failureOf(r: LatestItemRow): NonNullable<BulkItemDto['failure']> {
  const recorded = (LOOKUP_ERROR_KINDS as readonly (string | null)[]).includes(
    r.error_kind,
  )
    ? (r.error_kind as LookupErrorKind)
    : null;
  const kind: LookupErrorKind =
    recorded ??
    (r.error_kind === null && r.status === 'queued' ? 'interrupted' : 'other');
  const text = r.error?.trim();
  return {
    kind,
    reason: kind === 'other' && text ? capCodePoints(text, REASON_MAX) : null,
  };
}

function skipOf(
  r: LatestItemRow,
  photoId: string | undefined,
): BulkItemDto['skip'] {
  if (r.status !== 'skipped' || r.skip_reason === null) return null;
  const held = r.holder_id !== null;
  return {
    reason: r.skip_reason,
    photo: held ? r.holder_photo_name : null,
    spineNumber: held && r.holder_idx !== null ? r.holder_idx + 1 : null,
    samePhoto: held && r.holder_photo_id === photoId,
  };
}

/**
 * Each listed spine's current bulk item, keyed by spine id: its latest item,
 * dropped once a newer import (a manual one) replaced it.
 */
export function bulkForSpines(
  db: Database.Database,
  spines: readonly Pick<SpineDto, 'id' | 'photoId'>[],
): Map<string, BulkItemDto> {
  const out = new Map<string, BulkItemDto>();
  if (spines.length === 0) return out;
  const photoOf = new Map(spines.map((s) => [s.id, s.photoId]));
  const ids = JSON.stringify(spines.map((s) => s.id));
  for (const r of db
    .prepare(LATEST_ITEMS_SQL)
    .all({ ids }) as LatestItemRow[]) {
    const latestImport =
      r.latest_import_id !== null && r.latest_import_created_at !== null
        ? { id: r.latest_import_id, createdAt: r.latest_import_created_at }
        : null;
    if (
      !isCurrentBulkItem(
        { id: r.id, importId: r.import_id, createdAt: r.created_at },
        latestImport,
      )
    ) {
      continue;
    }
    const phase = bulkItemPhaseOf({
      status: r.status,
      jobStatus: r.job_status,
    });
    out.set(r.spine_id, {
      id: r.id,
      runId: r.run_id,
      phase,
      preferredCountry: r.run_country,
      outcome: r.outcome,
      releaseId: r.release_id,
      country: r.country,
      importId: r.import_id,
      skip: skipOf(r, photoOf.get(r.spine_id)),
      failure: phase === 'failed' ? failureOf(r) : null,
      createdAt: r.created_at,
    });
  }
  return out;
}

type RunRow = {
  id: string;
  folder_id: number;
  country: string;
  created_at: number;
};

type RunItemRow = {
  status: BulkItemStatus;
  skip_reason: BulkSkipReason | null;
  country: string | null;
  job_status: string | null;
  import_id: string | null;
  import_status: ImportStatus | null;
  intent_at: number | null;
  import_job_status: string | null;
};

const RUN_ITEMS_SQL = `
  SELECT b.status, b.skip_reason, b.country, j.status AS job_status,
    i.id AS import_id, i.status AS import_status, i.intent_at,
    ij.status AS import_job_status
  FROM bulk_items b
  LEFT JOIN jobs j ON j.id = b.job_id
  LEFT JOIN imports i ON i.id = b.import_id
  LEFT JOIN jobs ij ON ij.id = i.job_id
  WHERE b.run_id = @runId`;

/**
 * The newest bulk run's progress and result counts, or null (D-15). Its
 * busy flag is the start route's refusal rule too (WR-03).
 */
export function latestBulkRun(db: Database.Database): BulkRunDto | null {
  const run = db
    .prepare(
      `SELECT id, folder_id, country, created_at FROM bulk_runs
       ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .get() as RunRow | undefined;
  if (!run) return null;
  const rows = db.prepare(RUN_ITEMS_SQL).all({ runId: run.id }) as RunItemRow[];
  return summarizeRun(
    {
      id: run.id,
      country: run.country,
      folderName: collectionFolderName(run.folder_id),
      createdAt: run.created_at,
      openLookups: openBulkItemCount(db),
    },
    rows.map((r) => ({
      phase: bulkItemPhaseOf({ status: r.status, jobStatus: r.job_status }),
      skipReason: r.skip_reason,
      country: r.country,
      hasImport: r.import_id !== null,
      importPhase:
        r.import_id !== null && r.import_status !== null
          ? importPhaseOf({
              status: r.import_status,
              intentAt: r.intent_at,
              jobStatus: r.import_job_status,
            })
          : null,
    })),
  );
}
