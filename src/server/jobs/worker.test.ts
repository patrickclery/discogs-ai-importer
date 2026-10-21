import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

import { clearAuthInvalid, saveDiscogsAuth } from '../discogs/auth';
import { resetDiscogsGateForTests } from '../discogs/gate';
import { createSearch, setSearchJob } from '../discogs/store';
import { SECRET_ENV_NAMES, saveSecrets } from '../secrets';
import { runSearchSpine } from './handlers/search-spine';
import { claimNext, enqueue, recoverRunningJobs } from './queue';
import { JobDeferredError, type JobHandler } from './types';
import {
  laneWaitMs,
  processNext,
  reapStrandedJobs,
  strandedAfterMs,
} from './worker';

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

function job(id: string) {
  return getDb()
    .$client.prepare(
      'SELECT status, attempts, run_after, last_error, locked_at FROM jobs WHERE id = ?',
    )
    .get(id) as {
    status: string;
    attempts: number;
    run_after: number;
    last_error: string | null;
    locked_at: number | null;
  };
}

describe('429 deferral and the lane gate (D-06, RESEARCH Pattern 3)', () => {
  useTempDataDir();

  it('a handler throwing JobDeferredError ends deferred: queued at runAfter, attempts unchanged, no failOrRetry', async () => {
    const { id } = enqueue({ lane: 'discogs', type: 'slow', runAfter: T0 });
    const slow: JobHandler = {
      timeoutMs: 1000,
      run: async () => {
        throw new JobDeferredError(T0 + 60_000);
      },
    };
    for (let i = 0; i < 4; i += 1) {
      const now = i === 0 ? T0 : T0 + 60_000;
      const res = await processNext('discogs', { now, handlers: { slow } });
      expect(res).toBe('deferred');
      expect(job(id)).toMatchObject({
        status: 'queued',
        attempts: 0,
        run_after: T0 + 60_000,
        locked_at: null,
      });
      expect(job(id).last_error).toMatch(/^deferred/);
    }
    expect(await processNext('discogs', { now: T0 + 59_999 })).toBe('idle');
  });

  it('a JobDeferredError from another class copy (HMR) is matched by name', async () => {
    const { id } = enqueue({ lane: 'discogs', type: 'copy', runAfter: T0 });
    const copy: JobHandler = {
      timeoutMs: 1000,
      run: async () => {
        throw Object.assign(new Error('slow down'), {
          name: 'JobDeferredError',
          runAfter: T0 + 5000,
        });
      },
    };
    expect(await processNext('discogs', { now: T0, handlers: { copy } })).toBe(
      'deferred',
    );
    expect(job(id)).toMatchObject({ status: 'queued', run_after: T0 + 5000 });
  });

  it('a 5xx-style plain error still goes through failOrRetry: 2 s, then 4 s, then failed at attempt 3', async () => {
    const { id } = enqueue({ lane: 'discogs', type: 'down', runAfter: T0 });
    const down: JobHandler = {
      timeoutMs: 1000,
      run: async () => {
        throw new Error('Discogs GET /database/search answered 502');
      },
    };
    expect(await processNext('discogs', { now: T0, handlers: { down } })).toBe(
      'failed',
    );
    expect(job(id)).toMatchObject({
      status: 'queued',
      attempts: 1,
      run_after: T0 + 2000,
    });
    const t1 = T0 + 2000;
    await processNext('discogs', { now: t1, handlers: { down } });
    expect(job(id)).toMatchObject({
      status: 'queued',
      attempts: 2,
      run_after: t1 + 4000,
    });
    await processNext('discogs', { now: t1 + 4000, handlers: { down } });
    expect(job(id)).toMatchObject({ status: 'failed', attempts: 3 });
  });

  it('laneWaitMs is the time left on a lane gate, and 0 with no gate, no pause or a past pause', () => {
    const gates = { discogs: () => T0 + 500 };
    expect(laneWaitMs('discogs', T0, gates)).toBe(500);
    expect(laneWaitMs('discogs', T0 + 499, gates)).toBe(1);
    expect(laneWaitMs('discogs', T0 + 500, gates)).toBe(0);
    expect(laneWaitMs('discogs', T0 + 501, gates)).toBe(0);
    expect(laneWaitMs('anthropic', T0, gates)).toBe(0);
    expect(laneWaitMs('discogs', T0, { discogs: () => null })).toBe(0);
    expect(laneWaitMs('discogs', T0, {})).toBe(0);
  });

  it('the discogs lane gate reads the shared pacing gate pause', async () => {
    const { laneGates } = await import('./handlers');
    const { resetDiscogsGateForTests } = await import('../discogs/gate');
    const gate = resetDiscogsGateForTests();
    expect(laneGates.discogs?.()).toBeNull();
    gate.pause(10_000);
    const until = laneGates.discogs?.() ?? 0;
    expect(until).toBeGreaterThan(Date.now());
    expect(laneWaitMs('discogs', Date.now(), laneGates)).toBeGreaterThan(9000);
    resetDiscogsGateForTests();
  });
});

// Nyquist gap audit (WR-02, D-06): a 429 from a route (Test connection,
// Connect, paste-code) pauses the shared gate while a search_spine job is
// between cascade stages. The job must defer, never time out on the pause
// and spend an attempt.
describe('a rate-limit pause during a running search (WR-02)', () => {
  useTempDataDir();
  let dir = '';
  const names = [
    'SECRETS_FILE',
    'DISCOGS_API_BASE',
    ...Object.values(SECRET_ENV_NAMES),
  ];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const n of names) {
      saved[n] = process.env[n];
      delete process.env[n];
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-worker-wr02-'));
    process.env.SECRETS_FILE = path.join(dir, 'secrets.json');
    saveSecrets({
      discogsConsumerKey: 'CANARYDISCOGSKEY-0123456789wxyz',
      discogsConsumerSecret: 'CANARYDISCOGSSECRET-0123456789abcd',
    });
    saveDiscogsAuth({
      token: 'CANARYTOKEN-0123456789efgh',
      tokenSecret: 'CANARYTOKENSECRET-0123456789ijkl',
      username: 'fake-owner',
    });
  });
  afterEach(() => {
    clearAuthInvalid();
    for (const n of names) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('WR-02: a pause longer than the job timeout defers the job instead of failing an attempt', async () => {
    const db = getDb().$client;
    const now = Date.now();
    db.prepare(
      `INSERT INTO photos (id, sha256, original_name, mime, bytes,
         original_path, created_at, updated_at)
       VALUES ('photo-1', 'abc', 'shelf.jpg', 'image/jpeg', 1, 'photos/x.jpg',
         ?, ?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO spines (id, photo_id, state, created_at, updated_at)
       VALUES ('spine-1', 'photo-1', 'active', ?, ?)`,
    ).run(now, now);
    const searchId = createSearch(db, {
      spineId: 'spine-1',
      kind: 'auto',
      inputs: {
        artist: 'Nova Lane',
        title: 'Blue Hour',
        catno: 'TR-200',
        rawText: 'Nova Lane - Blue Hour TR-200',
      },
      inputHash: 'hash-1',
    });
    const job = enqueue({
      lane: 'discogs',
      type: 'search_spine',
      payload: { searchId },
      dedupeKey: 'search:auto:spine-1:hash-1',
    });
    setSearchJob(db, searchId, job.id);

    // Real clock: the gate's sleep is the one the job's timeout aborts.
    const gate = resetDiscogsGateForTests();
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      // A route's 429 pauses the shared gate for 120 s mid-cascade.
      gate.pause(120_000);
      return new Response(
        JSON.stringify({
          pagination: { items: 0, page: 1, pages: 0, per_page: 10 },
          results: [],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const search: JobHandler = {
      timeoutMs: 300,
      run: (payload, ctx) =>
        runSearchSpine(payload, ctx, { fetch: { fetchImpl, gate } }),
    };

    const res = await processNext('discogs', {
      handlers: { search_spine: search },
      abortGraceMs: 1000,
    });
    expect(calls).toBe(1);
    expect(res).toBe('deferred');
    const row = db
      .prepare('SELECT status, attempts FROM jobs WHERE id = ?')
      .get(job.id) as { status: string; attempts: number };
    expect(row.status).toBe('queued');
  });
});
