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
  return {
    connected: isConnected(),
    backlog,
    pausedUntil: discogsGate().pausedUntil(),
    failedSpines,
  };
}
