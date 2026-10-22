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
// waiting or running.
const IMPORTS_LEFT_SQL = `
  SELECT COUNT(*) AS n FROM jobs
  WHERE lane = @lane AND type = @type AND status IN ('queued', 'running')`;

// The latest import per active or orphaned spine not marked not on Discogs
// (the marked line wins on the card); it counts as failed when it ended
// failed, or is still pending or importing while its job failed, was
// cancelled or is missing (importPhaseOf, the card's own rule).
const IMPORTS_FAILED_SQL = `
  WITH latest AS (
    SELECT i.status, i.job_id,
      ROW_NUMBER() OVER (
        PARTITION BY i.spine_id ORDER BY i.created_at DESC, i.id DESC
      ) AS rn
    FROM imports i
    JOIN spines sp ON sp.id = i.spine_id
    WHERE sp.state IN ('active', 'orphaned') AND sp.not_on_discogs = 0
  )
  SELECT COUNT(*) AS n
  FROM latest l
  LEFT JOIN jobs j ON j.id = l.job_id
  WHERE l.rn = 1
    AND (l.status = 'failed'
      OR (l.status IN ('pending', 'importing')
        AND (j.id IS NULL OR j.status IN ('failed', 'cancelled'))))`;

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
    db
      .prepare(IMPORTS_LEFT_SQL)
      .get({ lane: 'discogs', type: 'add_to_collection' }) as { n: number }
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
