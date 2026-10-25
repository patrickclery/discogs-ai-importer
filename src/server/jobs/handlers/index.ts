import 'server-only';
import { enqueueMissingSearches } from '../../discogs/enqueue';
import { discogsGate } from '../../discogs/gate';
import { markInterruptedImports } from '../../imports/recovery';
import { reconcileVisionRuns } from '../../scan/reconcile';
import type { JobHandler, Lane } from '../types';
import { runAddToCollection, runCheckImport } from './add-to-collection';
import { runFetchRelease } from './fetch-release';
import { runNoop } from './noop';
import { runResolvePressing } from './resolve-pressing';
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
  // Discogs lane: one paced GET /releases/{id} for a pasted release (D-15).
  fetch_release: {
    run: (payload, ctx) => runFetchRelease(payload, ctx),
    timeoutMs: 60_000,
  },
  // Discogs lane: at most one paced GET /masters/{id}/versions, then
  // createImport (D-01, D-08).
  resolve_pressing: {
    run: (payload, ctx) => runResolvePressing(payload, ctx),
    timeoutMs: 60_000,
  },
  // Discogs lane: one paced GET of the owner's copies, then at most one add
  // POST (D-07), plus the gate waits between them.
  add_to_collection: {
    run: (payload, ctx) => runAddToCollection(payload, ctx),
    timeoutMs: 90_000,
  },
  // Discogs lane: Change match on a failed import that may have landed
  // (CR-01): one paced GET of the owner's copies, never a POST.
  check_import: {
    run: (payload, ctx) => runCheckImport(payload, ctx),
    timeoutMs: 60_000,
  },
};

/**
 * Run by the lease holder on every lease tick, after job recovery and
 * reaping, so a job failed by recovery is followed by run reconciliation in
 * the same tick. Each hook must be cheap and must never spawn a paid call.
 */
export const maintenance: Array<() => unknown> = [
  () => reconcileVisionRuns(),
  // Crash safety net for the connect backfill (D-08): returns at once when
  // not connected, and never re-picks auth_failed spines (T-03-17).
  () => enqueueMissingSearches({ includeAuthFailed: false }),
  // An import whose job the worker gave up on (failed or cancelled) never
  // stays pending or importing (Pitfall 4). One UPDATE, no request.
  () => markInterruptedImports(),
];

/**
 * Per-lane pause: the epoch ms a lane may claim again, or null. While the
 * Discogs gate is paused after a 429 the whole lane waits, so a backlog of
 * queued searches is not claimed and deferred one by one (RESEARCH
 * Pattern 3). Routes and the worker share the one globalThis gate.
 */
export const laneGates: Partial<Record<Lane, () => number | null>> = {
  discogs: () => discogsGate().pausedUntil(),
};
