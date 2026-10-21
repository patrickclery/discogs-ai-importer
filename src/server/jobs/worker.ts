import 'server-only';
import type { StatusResponse } from '@/lib/status-types';
import { newId } from '../ids';
import {
  handlers as defaultHandlers,
  laneGates,
  maintenance,
} from './handlers';
import {
  acquireLease,
  heartbeatLease,
  holdsLease,
  LEASE_HEARTBEAT_MS,
  LEASE_STALE_MS,
  releaseLease,
} from './lease';
import {
  claimNext,
  complete,
  deferJob,
  failJob,
  failOrRetry,
  isClaimCurrent,
  recoverRunningJobs,
} from './queue';
import { type JobHandler, LANES, type Lane } from './types';

export const LANE_CONCURRENCY: Record<Lane, number> = {
  anthropic: 1,
  discogs: 1,
};

const IDLE_SLEEP_MS = 500;
/** Longest single sleep while a lane gate is paused; re-checked after. */
const LANE_GATE_SLEEP_MS = 1000;
const DEFERRED_REASON = 'deferred: Discogs asked the app to slow down';
const ERROR_SLEEP_MS = 1000;
/**
 * How long an aborted handler gets to actually stop (WR-03). runProcess kills
 * a child within 3 s of an abort, so a handler that passes ctx.signal on
 * settles well inside this. The lane stays busy meanwhile, so lane
 * concurrency holds and the job is never requeued while it still runs.
 */
export const ABORT_GRACE_MS = 10_000;

/** Tries for a job status write (complete/fail) before giving up (WR-05). */
const STATUS_WRITE_TRIES = 5;
const STATUS_WRITE_RETRY_MS = 250;

/**
 * A `running` job claimed longer ago than this cannot still be executing on
 * a live, lease-holding worker: its handler timed out, had its abort grace
 * and was given a full lease staleness window. The holder's reaper recovers
 * such jobs (WR-05) instead of waiting for the next restart.
 */
export function strandedAfterMs(
  handlers: Record<string, JobHandler> = defaultHandlers,
): number {
  const longest = Math.max(
    0,
    ...Object.values(handlers).map((h) => h.timeoutMs),
  );
  return longest + ABORT_GRACE_MS + LEASE_STALE_MS;
}

export type WorkerState = {
  bootId: string;
  startedAt: number;
  starts: number;
  pid: number;
  /** 'running' only while this process holds the worker lease. */
  state: 'waiting' | 'running';
};

type InternalWorker = WorkerState & {
  stopped: boolean;
  laneGen: number;
  timer?: NodeJS.Timeout;
};

// One worker per process, shared across module graphs and dev HMR.
const g = globalThis as unknown as {
  __appWorker?: InternalWorker;
  __appWorkerStarts?: number;
  __appWorkerInflightJobs?: Map<AbortController, string>;
};

/** Abort reason used when the worker stops or loses its lease. */
export class WorkerStoppedError extends Error {
  constructor(reason = 'worker stopped') {
    super(reason);
    this.name = 'WorkerStoppedError';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms).unref());

/** Waits for p up to ms; true when it settled (either way) in time. */
function settlesWithin(p: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    timer.unref();
    p.then(
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      () => {
        clearTimeout(timer);
        resolve(true);
      },
    );
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** In-flight job controllers and their job ids (abort on stop, reaper skip). */
function inflight(): Map<AbortController, string> {
  g.__appWorkerInflightJobs ??= new Map();
  return g.__appWorkerInflightJobs;
}

/**
 * Runs a status write, retrying transient failures such as SQLITE_BUSY so a
 * job is not stranded in `running` (WR-05). Rethrows the last error; the
 * reaper then recovers the job.
 */
async function writeStatus<T>(write: () => T): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return write();
    } catch (err) {
      if (i >= STATUS_WRITE_TRIES) throw err;
      console.warn(`[worker] status write failed (try ${i}), retrying:`, err);
      await sleep(STATUS_WRITE_RETRY_MS * i);
    }
  }
}

/** Holder-only sweep for jobs stranded in `running` (WR-05). */
export function reapStrandedJobs(now = Date.now()): {
  requeued: number;
  failed: number;
} {
  return recoverRunningJobs(now, {
    lockedBefore: now - strandedAfterMs(),
    excludeIds: inflight().values(),
  });
}

export async function processNext(
  lane: Lane,
  opts: {
    now?: number;
    handlers?: Record<string, JobHandler>;
    abortGraceMs?: number;
    /** The running worker's boot id; isCurrent() also checks the lease. */
    bootId?: string;
  } = {},
): Promise<'idle' | 'succeeded' | 'failed' | 'deferred'> {
  const job = claimNext(lane, opts.now);
  if (!job) return 'idle';
  const handler = (opts.handlers ?? defaultHandlers)[job.type];
  if (!handler) {
    await writeStatus(() =>
      failJob(
        job.id,
        new Error(`unknown job type: ${job.type}`),
        opts.now,
        job.attempts,
      ),
    );
    return 'failed';
  }
  const controller = new AbortController();
  const timer = setTimeout(
    () =>
      controller.abort(
        new Error(`job timed out after ${handler.timeoutMs / 1000} s`),
      ),
    handler.timeoutMs,
  );
  timer.unref();
  // A handler that ignores its signal must still release the lane.
  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener(
      'abort',
      () => reject(controller.signal.reason),
      { once: true },
    );
  });
  aborted.catch(() => {});
  const lanes = inflight();
  lanes.set(controller, job.id);
  const run = Promise.resolve().then(() =>
    handler.run(JSON.parse(job.payload), {
      job,
      signal: controller.signal,
      isCurrent: () =>
        !controller.signal.aborted &&
        isClaimCurrent(job.id, job.attempts) &&
        (opts.bootId === undefined || holdsLease(opts.bootId)),
    }),
  );
  run.catch(() => {});
  try {
    try {
      await Promise.race([run, aborted]);
    } catch (err) {
      // Compare by name: HMR can leave two copies of the class alive.
      const reason = controller.signal.reason as Error | undefined;
      const stopped = reason?.name === 'WorkerStoppedError';
      if (controller.signal.aborted) {
        // Hold the lane until the handler really stops (WR-03). One that
        // ignores its signal is failed for good rather than requeued, so the
        // same job never runs twice at once.
        const grace = opts.abortGraceMs ?? ABORT_GRACE_MS;
        if (!(await settlesWithin(run, grace))) {
          console.error(
            `[worker] job ${job.id} (${job.type}) did not stop within ${grace} ms of its abort`,
          );
          if (!stopped) {
            const error = new Error(
              `handler did not stop after abort (${errorMessage(err)})`,
            );
            await writeStatus(() =>
              failJob(job.id, error, opts.now, job.attempts),
            );
          }
          return 'failed';
        }
      }
      // D-06: a deferral (Discogs 429) goes back to queued at its runAfter
      // without spending an attempt. Compared by name, like stopped above.
      const deferred = err as { name?: unknown; runAfter?: unknown } | null;
      if (
        !controller.signal.aborted &&
        deferred?.name === 'JobDeferredError' &&
        typeof deferred.runAfter === 'number' &&
        Number.isFinite(deferred.runAfter)
      ) {
        const runAfter = deferred.runAfter;
        await writeStatus(() =>
          deferJob(job.id, runAfter, DEFERRED_REASON, opts.now, job.attempts),
        );
        return 'deferred';
      }
      // A stopped worker leaves the job running; lease recovery requeues it.
      if (!stopped) {
        await writeStatus(() =>
          failOrRetry(job.id, err, opts.now, job.attempts),
        );
      }
      return 'failed';
    }
    await writeStatus(() => complete(job.id, opts.now, job.attempts));
    return 'succeeded';
  } finally {
    clearTimeout(timer);
    lanes.delete(controller);
  }
}

/** Ms until the lane's gate opens, or 0 when it has no gate or no pause. */
export function laneWaitMs(
  lane: Lane,
  now: number,
  gates: Partial<Record<Lane, () => number | null>> = laneGates,
): number {
  const until = gates[lane]?.() ?? null;
  return until !== null && until > now ? until - now : 0;
}

async function runLane(
  lane: Lane,
  bootId: string,
  isStopped: () => boolean,
): Promise<void> {
  while (!isStopped()) {
    // While the lane is paused (a Discogs 429), claim nothing. The deferred
    // job's run_after stays the durable record across restarts.
    let wait = 0;
    try {
      wait = laneWaitMs(lane, Date.now());
    } catch (err) {
      console.error(`[worker] ${lane} lane gate error:`, err);
    }
    if (wait > 0) {
      await sleep(Math.min(wait, LANE_GATE_SLEEP_MS));
      continue;
    }
    let result: Awaited<ReturnType<typeof processNext>>;
    try {
      result = await processNext(lane, { bootId });
    } catch (err) {
      // SQLITE_BUSY and friends must never end the loop.
      console.error(`[worker] ${lane} lane error:`, err);
      await sleep(ERROR_SLEEP_MS);
      continue;
    }
    if (result === 'idle') await sleep(IDLE_SLEEP_MS);
  }
}

/** Holder-only maintenance hooks (run reconciliation); each one isolated. */
function runMaintenance(): void {
  for (const hook of maintenance) {
    try {
      hook();
    } catch (err) {
      console.error('[worker] maintenance hook error:', err);
    }
  }
}

function abortInflight(reason: string): void {
  for (const c of inflight().keys()) c.abort(new WorkerStoppedError(reason));
}

function startLanes(w: InternalWorker): void {
  const gen = ++w.laneGen;
  const isStopped = () => w.stopped || w.laneGen !== gen;
  for (const lane of LANES) {
    for (let i = 0; i < LANE_CONCURRENCY[lane]; i++) {
      void runLane(lane, w.bootId, isStopped);
    }
  }
}

/** Acquire (waiting) or renew (running) the lease; runs every 5 s. */
function tick(w: InternalWorker): void {
  if (w.stopped) return;
  try {
    if (w.state === 'waiting') {
      const lease = acquireLease({ bootId: w.bootId, pid: w.pid });
      if (!lease.acquired) return;
      // D-14: only the process that just took the lease resets running jobs.
      // Taken from a holder that is still alive (WR-04)? It may be mid-job
      // and only notices the loss on its next tick, so requeue only jobs it
      // cannot still be running; the per-tick reaper picks up the rest.
      const recovered = lease.fromLiveHolder
        ? reapStrandedJobs()
        : recoverRunningJobs();
      if (recovered.requeued || recovered.failed) {
        console.log(
          `[worker] recovered ${recovered.requeued} job(s), failed ${recovered.failed} exhausted job(s)`,
        );
      }
      runMaintenance();
      w.state = 'running';
      startLanes(w);
    } else if (!heartbeatLease({ bootId: w.bootId })) {
      console.warn('[worker] lease lost; stopping lanes');
      w.state = 'waiting';
      w.laneGen++;
      abortInflight('worker lease lost');
    } else {
      const reaped = reapStrandedJobs();
      if (reaped.requeued || reaped.failed) {
        console.warn(
          `[worker] reaped ${reaped.requeued} stranded job(s), failed ${reaped.failed} exhausted job(s)`,
        );
      }
      runMaintenance();
    }
  } catch (err) {
    console.error('[worker] lease tick error:', err);
  }
}

export function startWorker(): WorkerState {
  if (g.__appWorker) return g.__appWorker;
  g.__appWorkerStarts = (g.__appWorkerStarts ?? 0) + 1;
  const w: InternalWorker = {
    bootId: newId(),
    startedAt: Date.now(),
    starts: g.__appWorkerStarts,
    pid: process.pid,
    state: 'waiting',
    stopped: false,
    laneGen: 0,
  };
  g.__appWorker = w;
  tick(w);
  w.timer = setInterval(() => tick(w), LEASE_HEARTBEAT_MS);
  w.timer.unref();
  return w;
}

/** Stop lanes and timers, abort in-flight handlers, release the lease. */
export function stopWorker(): void {
  const w = g.__appWorker;
  if (!w) return;
  delete g.__appWorker;
  w.stopped = true;
  w.laneGen++;
  if (w.timer) clearInterval(w.timer);
  abortInflight('worker stopped');
  const wasRunning = w.state === 'running';
  w.state = 'waiting';
  if (wasRunning) {
    try {
      releaseLease(w.bootId);
    } catch (err) {
      console.error('[worker] release lease error:', err);
    }
  }
}

export function getWorkerInfo(): StatusResponse['worker'] {
  const w = g.__appWorker;
  if (w?.state !== 'running') return null;
  return {
    bootId: w.bootId,
    startedAt: w.startedAt,
    starts: w.starts,
    pid: w.pid,
  };
}
