import 'server-only';
import type { StatusResponse } from '@/lib/status-types';
import { newId } from '../ids';
import { handlers as defaultHandlers } from './handlers';
import {
  heartbeatLease,
  LEASE_HEARTBEAT_MS,
  releaseLease,
  tryAcquireLease,
} from './lease';
import {
  claimNext,
  complete,
  failJob,
  failOrRetry,
  recoverRunningJobs,
} from './queue';
import { type JobHandler, LANES, type Lane } from './types';

export const LANE_CONCURRENCY: Record<Lane, number> = {
  anthropic: 1,
  discogs: 1,
};

const IDLE_SLEEP_MS = 500;
const ERROR_SLEEP_MS = 1000;

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
  __appWorkerInflight?: Set<AbortController>;
};

/** Abort reason used when the worker stops or loses its lease. */
export class WorkerStoppedError extends Error {
  constructor(reason = 'worker stopped') {
    super(reason);
    this.name = 'WorkerStoppedError';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms).unref());

/** In-flight job controllers, so a stop can abort running handlers. */
function inflight(): Set<AbortController> {
  g.__appWorkerInflight ??= new Set();
  return g.__appWorkerInflight;
}

export async function processNext(
  lane: Lane,
  opts: { now?: number; handlers?: Record<string, JobHandler> } = {},
): Promise<'idle' | 'succeeded' | 'failed'> {
  const job = claimNext(lane, opts.now);
  if (!job) return 'idle';
  const handler = (opts.handlers ?? defaultHandlers)[job.type];
  if (!handler) {
    failJob(job.id, new Error(`unknown job type: ${job.type}`), opts.now);
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
  lanes.add(controller);
  try {
    const run = Promise.resolve().then(() =>
      handler.run(JSON.parse(job.payload), {
        job,
        signal: controller.signal,
      }),
    );
    run.catch(() => {});
    await Promise.race([run, aborted]);
    complete(job.id, opts.now, job.attempts);
    return 'succeeded';
  } catch (err) {
    // A stopped worker leaves the job running; lease recovery requeues it.
    // Compare by name: HMR can leave two copies of the class alive.
    const reason = controller.signal.reason as Error | undefined;
    if (reason?.name !== 'WorkerStoppedError') {
      failOrRetry(job.id, err, opts.now, job.attempts);
    }
    return 'failed';
  } finally {
    clearTimeout(timer);
    lanes.delete(controller);
  }
}

async function runLane(lane: Lane, isStopped: () => boolean): Promise<void> {
  while (!isStopped()) {
    let result: Awaited<ReturnType<typeof processNext>>;
    try {
      result = await processNext(lane);
    } catch (err) {
      // SQLITE_BUSY and friends must never end the loop.
      console.error(`[worker] ${lane} lane error:`, err);
      await sleep(ERROR_SLEEP_MS);
      continue;
    }
    if (result === 'idle') await sleep(IDLE_SLEEP_MS);
  }
}

function abortInflight(reason: string): void {
  for (const c of inflight()) c.abort(new WorkerStoppedError(reason));
}

function startLanes(w: InternalWorker): void {
  const gen = ++w.laneGen;
  const isStopped = () => w.stopped || w.laneGen !== gen;
  for (const lane of LANES) {
    for (let i = 0; i < LANE_CONCURRENCY[lane]; i++) {
      void runLane(lane, isStopped);
    }
  }
}

/** Acquire (waiting) or renew (running) the lease; runs every 5 s. */
function tick(w: InternalWorker): void {
  if (w.stopped) return;
  try {
    if (w.state === 'waiting') {
      if (!tryAcquireLease({ bootId: w.bootId, pid: w.pid })) return;
      // D-14: only the process that just took the lease resets running jobs.
      const recovered = recoverRunningJobs();
      if (recovered.requeued || recovered.failed) {
        console.log(
          `[worker] recovered ${recovered.requeued} job(s), failed ${recovered.failed} exhausted job(s)`,
        );
      }
      w.state = 'running';
      startLanes(w);
    } else if (!heartbeatLease({ bootId: w.bootId })) {
      console.warn('[worker] lease lost; stopping lanes');
      w.state = 'waiting';
      w.laneGen++;
      abortInflight('worker lease lost');
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
