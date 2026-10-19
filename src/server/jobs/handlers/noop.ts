import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { resolveData } from '../../storage/paths';
import type { JobContext } from '../types';

export const NoopPayload = z.object({
  ms: z.number().int().min(0).max(120000).optional(),
  failTimes: z.number().int().min(0).max(5).optional(),
  writeFile: z.string().min(1).max(200).optional(),
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

/**
 * Test handler: planned failures, an abortable sleep, then an idempotent
 * file write inside DATA_DIR (overwrite, so a re-run is harmless).
 */
export async function runNoop(
  payload: unknown,
  ctx: JobContext,
): Promise<void> {
  const { ms = 0, failTimes = 0, writeFile } = NoopPayload.parse(payload);
  const attempt = ctx.job.attempts;
  if (attempt <= failTimes) {
    throw new Error(
      `noop: planned failure on attempt ${attempt} of ${failTimes}`,
    );
  }
  await sleep(ms, ctx.signal);
  if (writeFile !== undefined) {
    const abs = resolveData(writeFile);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, `${ctx.job.id}\n`);
  }
}
