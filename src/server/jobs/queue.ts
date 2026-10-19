import 'server-only';
import type { StatusResponse } from '@/lib/status-types';
import { getDb } from '../db/client';
import type { JobRow } from '../db/schema';
import { newId } from '../ids';
import { JOB_STATUSES, LANES, type Lane } from './types';

// better-sqlite3 is built with DQS=0: string literals must be single-quoted.

type RawJob = {
  id: string;
  lane: Lane;
  type: string;
  payload: string;
  status: JobRow['status'];
  attempts: number;
  max_attempts: number;
  run_after: number;
  dedupe_key: string | null;
  locked_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
  finished_at: number | null;
};

function toRow(r: RawJob): JobRow {
  return {
    id: r.id,
    lane: r.lane,
    type: r.type,
    payload: r.payload,
    status: r.status,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    runAfter: r.run_after,
    dedupeKey: r.dedupe_key,
    lockedAt: r.locked_at,
    lastError: r.last_error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    finishedAt: r.finished_at,
  };
}

function sql() {
  return getDb().$client;
}

export function enqueue(input: {
  lane: Lane;
  type: string;
  payload?: unknown;
  dedupeKey?: string;
  runAfter?: number;
}): { id: string; created: boolean } {
  const now = Date.now();
  const id = newId();
  const info = sql()
    .prepare(
      `INSERT INTO jobs (id, lane, type, payload, run_after, dedupe_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(dedupe_key) DO NOTHING`,
    )
    .run(
      id,
      input.lane,
      input.type,
      JSON.stringify(input.payload ?? {}),
      input.runAfter ?? now,
      input.dedupeKey ?? null,
      now,
      now,
    );
  if (info.changes > 0) return { id, created: true };
  const existing = sql()
    .prepare('SELECT id FROM jobs WHERE dedupe_key = ?')
    .get(input.dedupeKey ?? null) as { id: string } | undefined;
  if (!existing) throw new Error('enqueue: insert ignored but no row found');
  return { id: existing.id, created: false };
}

/** Atomically claim the oldest eligible queued job in a lane (one statement). */
export function claimNext(lane: Lane, now = Date.now()): JobRow | undefined {
  const row = sql()
    .prepare(
      `UPDATE jobs SET status = 'running', locked_at = @now, attempts = attempts + 1, updated_at = @now
       WHERE id = (
         SELECT id FROM jobs
         WHERE lane = @lane AND status = 'queued' AND run_after <= @now
         ORDER BY run_after, id
         LIMIT 1
       )
       RETURNING *`,
    )
    .get({ lane, now }) as RawJob | undefined;
  return row ? toRow(row) : undefined;
}

/**
 * True only on the running -> succeeded transition (exactly-once completion).
 * When `attempt` is given, only the claim that produced it may complete.
 */
export function complete(
  id: string,
  now = Date.now(),
  attempt?: number,
): boolean {
  const info = sql()
    .prepare(
      `UPDATE jobs SET status = 'succeeded', locked_at = NULL, finished_at = @now, updated_at = @now
       WHERE id = @id AND status = 'running' AND (@attempt IS NULL OR attempts = @attempt)`,
    )
    .run({ now, id, attempt: attempt ?? null });
  return info.changes === 1;
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(
    0,
    1000,
  );
}

/**
 * Terminal failure with no retry (e.g. unknown job type). When `attempt` is
 * given, only the running claim that produced it may write; returns whether
 * the row changed.
 */
export function failJob(
  id: string,
  error: unknown,
  now = Date.now(),
  attempt?: number,
): boolean {
  const info = sql()
    .prepare(
      `UPDATE jobs SET status = 'failed', last_error = @error, finished_at = @now, locked_at = NULL, updated_at = @now
       WHERE id = @id AND (@attempt IS NULL OR (status = 'running' AND attempts = @attempt))`,
    )
    .run({ error: errorText(error), now, id, attempt: attempt ?? null });
  return info.changes === 1;
}

/** Delay before the next try after `attempts` runs: 2 s, 4 s, 8 s ... (D-14). */
export function backoffMs(attempts: number): number {
  return 1000 * 2 ** attempts;
}

/**
 * Record a failed run of a running job: back to queued with exponential
 * backoff, or failed once attempts reached max_attempts (D-14).
 *
 * When `attempt` is given, only the claim that produced that attempt number
 * may write; a job recovered and re-claimed elsewhere returns 'stale'.
 */
export function failOrRetry(
  id: string,
  error: unknown,
  now = Date.now(),
  attempt?: number,
): 'queued' | 'failed' | 'stale' {
  const db = sql();
  const run = db.transaction((): 'queued' | 'failed' | 'stale' => {
    const row = db
      .prepare(
        `SELECT attempts, max_attempts FROM jobs WHERE id = ? AND status = 'running'`,
      )
      .get(id) as { attempts: number; max_attempts: number } | undefined;
    if (!row || (attempt !== undefined && row.attempts !== attempt)) {
      return 'stale';
    }
    const failed = row.attempts >= row.max_attempts;
    db.prepare(
      `UPDATE jobs SET
         status = CASE WHEN @failed = 1 THEN 'failed' ELSE 'queued' END,
         run_after = CASE WHEN @failed = 1 THEN run_after ELSE @runAfter END,
         finished_at = CASE WHEN @failed = 1 THEN @now ELSE NULL END,
         last_error = @error, locked_at = NULL, updated_at = @now
       WHERE id = @id`,
    ).run({
      failed: failed ? 1 : 0,
      runAfter: now + backoffMs(row.attempts),
      now,
      error: errorText(error),
      id,
    });
    return failed ? 'failed' : 'queued';
  });
  return run.immediate();
}

/**
 * Boot recovery (D-14), run only by the process that just took the worker
 * lease. Interrupted jobs go back to queued; a job interrupted on its final
 * attempt fails instead, so a crash loop never exceeds max_attempts runs.
 */
export function recoverRunningJobs(now = Date.now()): {
  requeued: number;
  failed: number;
} {
  const db = sql();
  const run = db.transaction(() => {
    const failed = db
      .prepare(
        `UPDATE jobs SET status = 'failed', last_error = 'interrupted after final attempt',
           finished_at = ?, locked_at = NULL, updated_at = ?
         WHERE status = 'running' AND attempts >= max_attempts`,
      )
      .run(now, now).changes;
    const requeued = db
      .prepare(
        `UPDATE jobs SET status = 'queued', locked_at = NULL, updated_at = ?
         WHERE status = 'running'`,
      )
      .run(now).changes;
    return { requeued, failed };
  });
  return run.immediate();
}

export function countsByLaneStatus(): StatusResponse['jobs'] {
  const out = {} as StatusResponse['jobs'];
  for (const lane of LANES) {
    out[lane] = {} as StatusResponse['jobs'][Lane];
    for (const status of JOB_STATUSES) out[lane][status] = 0;
  }
  const rows = sql()
    .prepare(
      'SELECT lane, status, COUNT(*) AS n FROM jobs GROUP BY lane, status',
    )
    .all() as { lane: Lane; status: JobRow['status']; n: number }[];
  for (const r of rows) {
    if (out[r.lane] && r.status in out[r.lane]) out[r.lane][r.status] = r.n;
  }
  return out;
}

export function listJobs(limit = 200): JobRow[] {
  const rows = sql()
    .prepare('SELECT * FROM jobs ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(limit) as RawJob[];
  return rows.map(toRow);
}
