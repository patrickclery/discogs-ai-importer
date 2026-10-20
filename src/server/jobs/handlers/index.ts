import 'server-only';
import { reconcileVisionRuns } from '../../scan/reconcile';
import type { JobHandler } from '../types';
import { runNoop } from './noop';
import { runScanPhoto } from './scan-photo';

export const handlers: Record<string, JobHandler> = {
  noop: { run: runNoop, timeoutMs: 120000 },
  // Longer than VISION_CALL_TIMEOUT_MS so the CLI's own timeout fires first.
  scan_photo: {
    run: (payload, ctx) => runScanPhoto(payload, ctx),
    timeoutMs: 720_000,
  },
};

/**
 * Run by the lease holder on every lease tick, after job recovery and
 * reaping, so a job failed by recovery is followed by run reconciliation in
 * the same tick. Each hook must be cheap and must never spawn a paid call.
 */
export const maintenance: Array<() => unknown> = [() => reconcileVisionRuns()];
