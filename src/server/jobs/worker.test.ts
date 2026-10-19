import { describe, expect, it, vi } from 'vitest';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';
import { getDb } from '../db/client';

// complete() can be made to throw (e.g. SQLITE_BUSY) for the next N calls.
const failures = vi.hoisted(() => ({ complete: 0 }));
vi.mock('./queue', async (importOriginal) => {
  const real = await importOriginal<typeof import('./queue')>();
  return {
    ...real,
    complete: (...args: Parameters<typeof real.complete>) => {
      if (failures.complete > 0) {
        failures.complete--;
        throw Object.assign(new Error('database is locked'), {
          code: 'SQLITE_BUSY',
        });
      }
      return real.complete(...args);
    },
  };
});

import { claimNext, enqueue, recoverRunningJobs } from './queue';
import type { JobHandler } from './types';
import { processNext, reapStrandedJobs, strandedAfterMs } from './worker';

const T0 = 1_700_000_000_000;
const ok: JobHandler = { timeoutMs: 1000, run: async () => {} };

function status(id: string): string {
  return (
    getDb().$client.prepare('SELECT status FROM jobs WHERE id = ?').get(id) as {
      status: string;
    }
  ).status;
}

describe('ctx.isCurrent fence (WR-04)', () => {
  useTempDataDir();

  it('is true for the live claim and false once the job was recovered and re-claimed', async () => {
    enqueue({ lane: 'anthropic', type: 'probe', runAfter: T0 });
    const seen: boolean[] = [];
    const probe: JobHandler = {
      timeoutMs: 1000,
      run: async (_p, ctx) => {
        seen.push(ctx.isCurrent());
        // Another process takes over: recovery requeues, then it re-claims.
        recoverRunningJobs(T0);
        expect(claimNext('anthropic', T0)?.attempts).toBe(2);
        seen.push(ctx.isCurrent());
      },
    };
    await processNext('anthropic', { now: T0, handlers: { probe } });
    expect(seen).toEqual([true, false]);
  });

  it('is false when the worker no longer holds the lease', async () => {
    enqueue({ lane: 'anthropic', type: 'probe', runAfter: T0 });
    let current: boolean | undefined;
    const probe: JobHandler = {
      timeoutMs: 1000,
      run: async (_p, ctx) => {
        current = ctx.isCurrent();
      },
    };
    await processNext('anthropic', {
      now: T0,
      handlers: { probe },
      bootId: 'not-the-holder',
    });
    expect(current).toBe(false);
  });
});

describe('status writes and stranded jobs (WR-05)', () => {
  useTempDataDir();

  it('retries a status write that throws SQLITE_BUSY instead of stranding the job', async () => {
    const { id } = enqueue({ lane: 'anthropic', type: 'ok', runAfter: T0 });
    failures.complete = 2;
    const res = await processNext('anthropic', {
      now: T0,
      handlers: { ok },
    });
    expect(res).toBe('succeeded');
    expect(failures.complete).toBe(0);
    expect(status(id)).toBe('succeeded');
  });

  it('rethrows after the last try, and the reaper later recovers the stranded job', async () => {
    const { id } = enqueue({ lane: 'anthropic', type: 'ok', runAfter: T0 });
    failures.complete = 99;
    await expect(
      processNext('anthropic', { now: T0, handlers: { ok } }),
    ).rejects.toThrow('database is locked');
    failures.complete = 0;
    expect(status(id)).toBe('running');

    // Too recent: a live worker could still be running it.
    expect(reapStrandedJobs(T0 + 1000)).toEqual({ requeued: 0, failed: 0 });
    expect(status(id)).toBe('running');

    expect(reapStrandedJobs(T0 + strandedAfterMs() + 1)).toEqual({
      requeued: 1,
      failed: 0,
    });
    expect(status(id)).toBe('queued');
  }, 15_000);

  it('strandedAfterMs covers the longest handler timeout plus abort grace and lease staleness', () => {
    expect(strandedAfterMs({ a: ok, b: { ...ok, timeoutMs: 60_000 } })).toBe(
      60_000 + 10_000 + 15_000,
    );
  });

  it('recoverRunningJobs honors lockedBefore and excludeIds', () => {
    const a = enqueue({ lane: 'anthropic', type: 'ok', runAfter: T0 }).id;
    const b = enqueue({ lane: 'discogs', type: 'ok', runAfter: T0 }).id;
    const c = enqueue({ lane: 'discogs', type: 'ok', runAfter: T0 }).id;
    claimNext('anthropic', T0); // a, old
    claimNext('discogs', T0); // b, old but in flight
    claimNext('discogs', T0 + 50_000); // c, recent
    expect(
      recoverRunningJobs(T0 + 60_000, {
        lockedBefore: T0 + 10_000,
        excludeIds: [b],
      }),
    ).toEqual({ requeued: 1, failed: 0 });
    expect([status(a), status(b), status(c)]).toEqual([
      'queued',
      'running',
      'running',
    ]);
  });
});
