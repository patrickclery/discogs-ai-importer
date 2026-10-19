import 'server-only';
import type { StatusResponse } from '@/lib/status-types';
import { newId } from '../ids';
import { handlers as defaultHandlers } from './handlers';
import { claimNext, complete, failJob, failOrRetry } from './queue';
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
  stop: () => void;
};

// One worker per process, shared across module graphs and dev HMR.
const g = globalThis as unknown as {
  __appWorker?: WorkerState;
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    if (!(controller.signal.reason instanceof WorkerStoppedError)) {
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

export function startWorker(): WorkerState {
  if (g.__appWorker) return g.__appWorker;
  g.__appWorkerStarts = (g.__appWorkerStarts ?? 0) + 1;
  let stopped = false;
  const state: WorkerState = {
    bootId: newId(),
    startedAt: Date.now(),
    starts: g.__appWorkerStarts,
    pid: process.pid,
    stop: () => {
      stopped = true;
    },
  };
  g.__appWorker = state;
  for (const lane of LANES) {
    for (let i = 0; i < LANE_CONCURRENCY[lane]; i++) {
      void runLane(lane, () => stopped);
    }
  }
  return state;
}

export function getWorkerInfo(): StatusResponse['worker'] {
  const w = g.__appWorker;
  if (!w) return null;
  return {
    bootId: w.bootId,
    startedAt: w.startedAt,
    starts: w.starts,
    pid: w.pid,
  };
}
