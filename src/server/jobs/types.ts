import 'server-only';
import type { JobRow } from '../db/schema';

export const LANES = ['anthropic', 'discogs'] as const;
export type Lane = (typeof LANES)[number];

export const JOB_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export type JobContext = { job: JobRow; signal: AbortSignal };

/**
 * Job handler contract.
 *
 * Handlers MUST be idempotent: execution is at-least-once (a job running when
 * the process dies is re-run after restart), while completion is exactly-once
 * (only the running -> succeeded transition counts). See RESEARCH Pitfall 5.
 *
 * Handlers MUST honor ctx.signal (pass it to runProcess). After a timeout the
 * worker waits ABORT_GRACE_MS for the handler to stop; one that keeps running
 * is failed for good instead of retried (WR-03).
 */
export type JobHandler = {
  run(payload: unknown, ctx: JobContext): Promise<void>;
  timeoutMs: number;
};
