import 'server-only';
import type Database from 'better-sqlite3';
import type { StatusResponse } from '@/lib/status-types';
import { getDiscogsAuth } from './auth';
import { discogsGate } from './gate';

// The Discogs part of GET /api/status (D-07, RESEARCH Pitfall 8). Counts,
// a timestamp and a connected flag only: no username, token or query text
// (T-03-28). Raw SQL with @named parameters and single-quoted literals.

const BACKLOG_SQL = `
  SELECT COUNT(*) AS n FROM jobs
  WHERE lane = @lane AND status IN ('queued', 'running')`;

// The latest auto or again search per active or orphaned spine; it counts
// as failed when it finished failed or auth_failed, or is still queued
// while its job has failed. A newer successful retry therefore stops the
// spine counting, unlike the forever-growing jobs.failed total.
const FAILED_SPINES_SQL = `
  WITH latest AS (
    SELECT s.status, s.job_id,
      ROW_NUMBER() OVER (
        PARTITION BY s.spine_id ORDER BY s.created_at DESC, s.id DESC
      ) AS rn
    FROM discogs_searches s
    JOIN spines sp ON sp.id = s.spine_id
    WHERE s.kind IN ('auto', 'again') AND sp.state IN ('active', 'orphaned')
  )
  SELECT COUNT(*) AS n
  FROM latest l
  LEFT JOIN jobs j ON j.id = l.job_id
  WHERE l.rn = 1
    AND (l.status IN ('failed', 'auth_failed')
      OR (l.status = 'queued' AND j.status = @failedJob))`;

// The imports part of the backlog (Plan 04-09): add_to_collection jobs still
// waiting or running. Bulk pressing lookups count as left too, so the header
// covers a whole bulk run (BULK-11).
const IMPORTS_LEFT_SQL = `
  SELECT COUNT(*) AS n FROM jobs
  WHERE lane = @lane AND type IN ('add_to_collection', 'resolve_pressing')
    AND status IN ('queued', 'running')`;

// Active or orphaned spines not marked not on Discogs (the marked line wins
// on the card) that read Failed, mirroring reviewStatusOf (WR-04):
// - an imported spine (latest import imported or holding an instance) never
//   counts;
// - else the spine's current bulk item comes first (isCurrentBulkItem: no
//   import came after it, or the latest import is its own): a failed lookup,
//   or a queued one whose job is no longer queued or running
//   (bulkItemPhaseOf), counts; a lookup still finding does not;
// - else the latest import counts when it ended failed, or is still pending
//   or importing while its job failed, was cancelled or is missing
//   (importPhaseOf, the card's own rule).
const IMPORTS_FAILED_SQL = `
  WITH latest_import AS (
    SELECT i.id, i.spine_id, i.status, i.job_id, i.instance_id, i.created_at,
      ROW_NUMBER() OVER (
        PARTITION BY i.spine_id ORDER BY i.created_at DESC, i.id DESC
      ) AS rn
    FROM imports i
  ),
  latest_item AS (
    SELECT b.id, b.spine_id, b.status, b.job_id, b.import_id, b.created_at,
      ROW_NUMBER() OVER (
        PARTITION BY b.spine_id ORDER BY b.created_at DESC, b.id DESC
      ) AS rn
    FROM bulk_items b
  ),
  per_spine AS (
    SELECT li.status AS import_status, li.instance_id,
      li.id AS import_id, ij.status AS import_job_status,
      CASE
        WHEN bi.id IS NULL THEN NULL
        WHEN li.id IS NOT NULL
          AND (bi.import_id IS NULL OR bi.import_id <> li.id)
          AND bi.created_at <= li.created_at THEN NULL
        WHEN bi.status = 'failed' THEN 'failed'
        WHEN bi.status <> 'queued' THEN NULL
        WHEN bj.status IN ('queued', 'running') THEN 'finding'
        ELSE 'failed'
      END AS lookup
    FROM spines sp
    LEFT JOIN latest_import li ON li.spine_id = sp.id AND li.rn = 1
    LEFT JOIN jobs ij ON ij.id = li.job_id
    LEFT JOIN latest_item bi ON bi.spine_id = sp.id AND bi.rn = 1
    LEFT JOIN jobs bj ON bj.id = bi.job_id
    WHERE sp.state IN ('active', 'orphaned') AND sp.not_on_discogs = 0
  )
  SELECT COUNT(*) AS n
  FROM per_spine
  WHERE instance_id IS NULL
    AND (import_status IS NULL OR import_status <> 'imported')
    AND (lookup = 'failed'
      OR (lookup IS NULL
        AND (import_status = 'failed'
          OR (import_status IN ('pending', 'importing')
            AND (import_job_status IS NULL
              OR import_job_status IN ('failed', 'cancelled'))))))`;

/** A secrets file that cannot be read means not connected, never a 500. */
function isConnected(): boolean {
  try {
    return getDiscogsAuth() !== null;
  } catch {
    return false;
  }
}

export function discogsStatus(
  db: Database.Database,
): StatusResponse['discogs'] {
  const backlog = (
    db.prepare(BACKLOG_SQL).get({ lane: 'discogs' }) as {
      n: number;
    }
  ).n;
  const failedSpines = (
    db.prepare(FAILED_SPINES_SQL).get({ failedJob: 'failed' }) as { n: number }
  ).n;
  const importsLeft = (
    db.prepare(IMPORTS_LEFT_SQL).get({ lane: 'discogs' }) as { n: number }
  ).n;
  const importsFailed = (db.prepare(IMPORTS_FAILED_SQL).get() as { n: number })
    .n;
  return {
    connected: isConnected(),
    backlog,
    pausedUntil: discogsGate().pausedUntil(),
    failedSpines,
    imports: { left: importsLeft, failed: importsFailed },
  };
}
