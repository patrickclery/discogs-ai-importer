import 'server-only';
import { z } from 'zod';
import type { JobContext } from '../types';

const NoopPayload = z.object({
  ms: z.number().int().min(0).max(120000).optional(),
});

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error('aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error('aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function runNoop(
  payload: unknown,
  ctx: JobContext,
): Promise<void> {
  const { ms = 0 } = NoopPayload.parse(payload);
  await sleep(ms, ctx.signal);
}
