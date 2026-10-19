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

/** True only on the running -> succeeded transition (exactly-once completion). */
export function complete(id: string, now = Date.now()): boolean {
  const info = sql()
    .prepare(
      `UPDATE jobs SET status = 'succeeded', locked_at = NULL, finished_at = ?, updated_at = ?
       WHERE id = ? AND status = 'running'`,
    )
    .run(now, now, id);
  return info.changes === 1;
}

/** Terminal failure. Plan 01-02 adds retry with backoff. */
export function failJob(id: string, error: unknown, now = Date.now()): void {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).slice(0, 1000);
  sql()
    .prepare(
      `UPDATE jobs SET status = 'failed', last_error = ?, finished_at = ?, locked_at = NULL, updated_at = ?
       WHERE id = ?`,
    )
    .run(message, now, now, id);
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
