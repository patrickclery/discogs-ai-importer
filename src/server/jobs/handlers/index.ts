import 'server-only';
import { discogsGate } from '../../discogs/gate';
import { reconcileVisionRuns } from '../../scan/reconcile';
import type { JobHandler, Lane } from '../types';
import { runNoop } from './noop';
import { runScanPhoto } from './scan-photo';
import { runSearchSpine } from './search-spine';

export const handlers: Record<string, JobHandler> = {
  noop: { run: runNoop, timeoutMs: 120000 },
  // Longer than VISION_CALL_TIMEOUT_MS so the CLI's own timeout fires first.
  scan_photo: {
    run: (payload, ctx) => runScanPhoto(payload, ctx),
    timeoutMs: 720_000,
  },
  // Discogs lane: up to 3 paced requests (one per cascade stage).
  search_spine: {
    run: (payload, ctx) => runSearchSpine(payload, ctx),
    timeoutMs: 90_000,
  },
};

/**
 * Run by the lease holder on every lease tick, after job recovery and
 * reaping, so a job failed by recovery is followed by run reconciliation in
 * the same tick. Each hook must be cheap and must never spawn a paid call.
 */
export const maintenance: Array<() => unknown> = [() => reconcileVisionRuns()];

/**
 * Per-lane pause: the epoch ms a lane may claim again, or null. While the
 * Discogs gate is paused after a 429 the whole lane waits, so a backlog of
 * queued searches is not claimed and deferred one by one (RESEARCH
 * Pattern 3). Routes and the worker share the one globalThis gate.
 */
export const laneGates: Partial<Record<Lane, () => number | null>> = {
  discogs: () => discogsGate().pausedUntil(),
};
