import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';
import { getDb } from '../db/client';
import { runNoop } from './handlers/noop';
import {
  backoffMs,
  claimNext,
  complete,
  countsByLaneStatus,
  enqueue,
  failJob,
  failOrRetry,
  listJobs,
  recoverRunningJobs,
} from './queue';
import { JOB_STATUSES, type JobContext, type JobHandler, LANES } from './types';
import { processNext } from './worker';

const T0 = 1_700_000_000_000;

describe('jobs queue (happy path)', () => {
  const dataDir = useTempDataDir();

  it('runs each test against its own migrated app.db in the temp DATA_DIR', () => {
    expect(fs.existsSync(path.join(dataDir(), 'app.db'))).toBe(true);
    expect(listJobs()).toEqual([]);
  });

  it('enqueue -> claimNext -> complete ends succeeded with attempts 1', () => {
    const { id, created } = enqueue({
      lane: 'anthropic',
      type: 'noop',
      payload: { ms: 0 },
      runAfter: T0,
    });
    expect(created).toBe(true);

    const claimed = claimNext('anthropic', T0);
    expect(claimed?.id).toBe(id);
    expect(claimed?.status).toBe('running');
    expect(claimed?.attempts).toBe(1);

    expect(complete(id, T0 + 1)).toBe(true);
    const [job] = listJobs();
    expect(job).toMatchObject({
      id,
      status: 'succeeded',
      attempts: 1,
      finishedAt: T0 + 1,
      lockedAt: null,
    });
  });

  it('claimNext returns undefined once the only job is claimed', () => {
    enqueue({ lane: 'discogs', type: 'noop', runAfter: T0 });
    expect(claimNext('discogs', T0)).toBeDefined();
    expect(claimNext('discogs', T0)).toBeUndefined();
  });

  it('complete on an already-succeeded job returns false (exactly-once completion)', () => {
    const { id } = enqueue({ lane: 'anthropic', type: 'noop', runAfter: T0 });
    claimNext('anthropic', T0);
    expect(complete(id, T0 + 1)).toBe(true);
    expect(complete(id, T0 + 2)).toBe(false);
    expect(listJobs()[0]?.finishedAt).toBe(T0 + 1);
  });

  it('countsByLaneStatus on an empty database returns every lane and status at 0', () => {
    const counts = countsByLaneStatus();
    expect(Object.keys(counts).sort()).toEqual([...LANES].sort());
    for (const lane of LANES) {
      expect(Object.keys(counts[lane]).sort()).toEqual(
        [...JOB_STATUSES].sort(),
      );
      for (const status of JOB_STATUSES) expect(counts[lane][status]).toBe(0);
    }
  });

  it('a later test sees an empty jobs table (no state leaks between tests)', () => {
    expect(listJobs()).toEqual([]);
    expect(countsByLaneStatus().anthropic.succeeded).toBe(0);
  });
});

function rawJob(id: string) {
  return getDb().$client.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as {
    status: string;
    attempts: number;
    run_after: number;
    locked_at: number | null;
    last_error: string | null;
    finished_at: number | null;
  };
}

function rowCount(): number {
  return (
    getDb().$client.prepare('SELECT COUNT(*) AS n FROM jobs').get() as {
      n: number;
    }
  ).n;
}

describe('jobs queue (retry, recovery, dedupe, ordering)', () => {
  useTempDataDir();

  it('enqueue twice with the same dedupeKey stores one row and returns the first id (D-12)', () => {
    const a = enqueue({ lane: 'anthropic', type: 'noop', dedupeKey: 'k' });
    const b = enqueue({ lane: 'anthropic', type: 'noop', dedupeKey: 'k' });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.id).toBe(a.id);
    expect(rowCount()).toBe(1);
  });

  it('maxAttempts 1 fails on the first failure and on boot recovery (RESEARCH Pitfall 3)', () => {
    const a = enqueue({
      lane: 'anthropic',
      type: 'noop',
      runAfter: T0,
      maxAttempts: 1,
    });
    expect(claimNext('anthropic', T0)?.maxAttempts).toBe(1);
    expect(failOrRetry(a.id, new Error('boom'), T0)).toBe('failed');

    enqueue({ lane: 'anthropic', type: 'noop', runAfter: T0, maxAttempts: 1 });
    expect(claimNext('anthropic', T0)?.attempts).toBe(1);
    expect(recoverRunningJobs(T0)).toEqual({ requeued: 0, failed: 1 });
    expect(claimNext('anthropic', T0)).toBeUndefined();
  });

  it('maxAttempts defaults to 3 and rejects values outside 1..10', () => {
    enqueue({ lane: 'anthropic', type: 'noop', runAfter: T0 });
    expect(claimNext('anthropic', T0)?.maxAttempts).toBe(3);
    for (const bad of [0, 11, 1.5]) {
      expect(() =>
        enqueue({ lane: 'anthropic', type: 'noop', maxAttempts: bad }),
      ).toThrow(/maxAttempts/);
    }
  });

  it('jobs with equal run_after are claimed in insertion (ULID) order', () => {
    const ids = [1, 2, 3].map(
      () => enqueue({ lane: 'discogs', type: 'noop', runAfter: T0 }).id,
    );
    const claimed = [1, 2, 3].map(() => claimNext('discogs', T0)?.id);
    expect(claimed).toEqual(ids);
  });

  it('a job whose run_after is in the future is not claimed', () => {
    enqueue({ lane: 'anthropic', type: 'noop', runAfter: T0 + 60_000 });
    expect(claimNext('anthropic', T0)).toBeUndefined();
    expect(claimNext('anthropic', T0 + 60_000)).toBeDefined();
  });

  it('backoffMs doubles per attempt: 2000 after attempt 1, 4000 after attempt 2', () => {
    expect(backoffMs(1)).toBe(2000);
    expect(backoffMs(2)).toBe(4000);
  });

  it('failOrRetry retries after 2 s, then 4 s, then fails on the 3rd attempt and is never claimed again (D-14)', () => {
    const { id } = enqueue({ lane: 'anthropic', type: 'noop', runAfter: T0 });

    expect(claimNext('anthropic', T0)?.attempts).toBe(1);
    expect(failOrRetry(id, new Error('boom 1'), T0)).toBe('queued');
    expect(rawJob(id)).toMatchObject({
      status: 'queued',
      run_after: T0 + 2000,
      locked_at: null,
      last_error: 'boom 1',
      finished_at: null,
    });
    expect(claimNext('anthropic', T0 + 1999)).toBeUndefined();

    const t1 = T0 + 2000;
    expect(claimNext('anthropic', t1)?.attempts).toBe(2);
    expect(failOrRetry(id, new Error('boom 2'), t1)).toBe('queued');
    expect(rawJob(id).run_after).toBe(t1 + 4000);

    const t2 = t1 + 4000;
    expect(claimNext('anthropic', t2)?.attempts).toBe(3);
    expect(failOrRetry(id, new Error('boom 3'), t2)).toBe('failed');
    expect(rawJob(id)).toMatchObject({
      status: 'failed',
      attempts: 3,
      last_error: 'boom 3',
      finished_at: t2,
      locked_at: null,
    });
    expect(claimNext('anthropic', t2 + 1_000_000)).toBeUndefined();
    expect(rawJob(id).status).toBe('failed');
  });

  it('last_error stores at most 1000 characters', () => {
    const { id } = enqueue({ lane: 'anthropic', type: 'noop', runAfter: T0 });
    claimNext('anthropic', T0);
    failOrRetry(id, new Error('x'.repeat(5000)), T0);
    expect(rawJob(id).last_error).toHaveLength(1000);
  });

  it('complete on a running job returns true, and a second complete returns false', () => {
    const { id } = enqueue({ lane: 'discogs', type: 'noop', runAfter: T0 });
    claimNext('discogs', T0);
    expect(complete(id, T0)).toBe(true);
    expect(complete(id, T0)).toBe(false);
  });

  it('recoverRunningJobs requeues running jobs, fails exhausted ones and leaves finished rows alone', () => {
    const ok = enqueue({ lane: 'anthropic', type: 'noop', runAfter: T0 }).id;
    claimNext('anthropic', T0);
    complete(ok, T0);
    const bad = enqueue({ lane: 'anthropic', type: 'noop', runAfter: T0 }).id;
    claimNext('anthropic', T0);
    failJob(bad, new Error('terminal'), T0);
    const live = enqueue({ lane: 'anthropic', type: 'noop', runAfter: T0 }).id;
    claimNext('anthropic', T0);
    const spent = enqueue({ lane: 'discogs', type: 'noop', runAfter: T0 }).id;
    getDb()
      .$client.prepare(
        "UPDATE jobs SET status = 'running', attempts = 3, locked_at = ? WHERE id = ?",
      )
      .run(T0, spent);

    expect(recoverRunningJobs(T0 + 10)).toEqual({ requeued: 1, failed: 1 });
    expect(rawJob(live)).toMatchObject({
      status: 'queued',
      attempts: 1,
      locked_at: null,
    });
    expect(rawJob(spent)).toMatchObject({
      status: 'failed',
      attempts: 3,
      last_error: 'interrupted after final attempt',
      finished_at: T0 + 10,
      locked_at: null,
    });
    expect(rawJob(ok).status).toBe('succeeded');
    expect(rawJob(bad)).toMatchObject({
      status: 'failed',
      last_error: 'terminal',
    });
  });

  it('claim/recover three times leaves the job failed with attempts 3 and never claimable again (at most max_attempts runs)', () => {
    const { id } = enqueue({ lane: 'anthropic', type: 'noop', runAfter: T0 });
    for (let i = 0; i < 3; i++) {
      expect(claimNext('anthropic', T0 + i)?.id).toBe(id);
      recoverRunningJobs(T0 + i);
    }
    expect(rawJob(id)).toMatchObject({ status: 'failed', attempts: 3 });
    expect(claimNext('anthropic', T0 + 1_000_000)).toBeUndefined();
  });
});

describe('processNext (timeouts and unknown types)', () => {
  useTempDataDir();

  it('aborts a handler that runs past timeoutMs, waits for it to stop, then requeues with "timed out after"', async () => {
    const { id } = enqueue({ lane: 'anthropic', type: 'slow', runAfter: T0 });
    let seen: AbortSignal | undefined;
    let stoppedAt = 0;
    const slow: JobHandler = {
      timeoutMs: 50,
      run: (_payload, ctx) => {
        seen = ctx.signal;
        // Honors the signal, but takes 100 ms to wind down (like a child kill).
        return new Promise((_, reject) => {
          ctx.signal.addEventListener('abort', () =>
            setTimeout(() => {
              stoppedAt = Date.now();
              reject(ctx.signal.reason);
            }, 100),
          );
        });
      },
    };
    const result = await processNext('anthropic', {
      now: T0,
      handlers: { slow },
      abortGraceMs: 2000,
    });
    // processNext only returns (freeing the lane) after the handler stopped.
    expect(stoppedAt).toBeGreaterThan(0);
    expect(Date.now()).toBeGreaterThanOrEqual(stoppedAt);
    expect(result).toBe('failed');
    expect(seen?.aborted).toBe(true);
    expect(rawJob(id).last_error).toContain('timed out after');
    expect(rawJob(id).status).toBe('queued');
  });

  it('fails (never requeues) a timed-out handler that ignores its signal past the grace period (WR-03)', async () => {
    const { id } = enqueue({ lane: 'anthropic', type: 'hang', runAfter: T0 });
    const hang: JobHandler = {
      timeoutMs: 50,
      run: () => new Promise(() => {}),
    };
    const started = Date.now();
    const result = await processNext('anthropic', {
      now: T0,
      handlers: { hang },
      abortGraceMs: 150,
    });
    expect(Date.now() - started).toBeGreaterThanOrEqual(190);
    expect(result).toBe('failed');
    expect(rawJob(id).status).toBe('failed');
    expect(rawJob(id).last_error).toMatch(
      /handler did not stop after abort \(job timed out after/,
    );
    expect(claimNext('anthropic', T0 + 1_000_000)).toBeUndefined();
  });

  it('fails a job of unknown type with "unknown job type: X" and no retry', async () => {
    const { id } = enqueue({ lane: 'discogs', type: 'mystery', runAfter: T0 });
    expect(await processNext('discogs', { now: T0, handlers: {} })).toBe(
      'failed',
    );
    expect(rawJob(id)).toMatchObject({
      status: 'failed',
      last_error: 'unknown job type: mystery',
    });
  });
});

describe('noop handler (failTimes, writeFile)', () => {
  const dataDir = useTempDataDir();

  function ctx(attempts: number, id = 'JOB1'): JobContext {
    return {
      job: { id, attempts } as JobContext['job'],
      signal: new AbortController().signal,
      isCurrent: () => true,
    };
  }

  it('failTimes 2 throws on attempts 1 and 2 and succeeds on attempt 3', async () => {
    await expect(runNoop({ failTimes: 2 }, ctx(1))).rejects.toThrow(
      'noop: planned failure on attempt 1 of 2',
    );
    await expect(runNoop({ failTimes: 2 }, ctx(2))).rejects.toThrow(
      'noop: planned failure on attempt 2 of 2',
    );
    await expect(runNoop({ failTimes: 2 }, ctx(3))).resolves.toBeUndefined();
  });

  it('writeFile writes the job id and a newline under DATA_DIR/test-writes', async () => {
    await runNoop({ writeFile: 'test-writes/probe.txt' }, ctx(1, 'JOBX'));
    expect(
      fs.readFileSync(path.join(dataDir(), 'test-writes', 'probe.txt'), 'utf8'),
    ).toBe('JOBX\n');
  });

  it('writeFile outside test-writes/ (app.db, -wal, photos) throws and leaves the file alone (WR-02)', async () => {
    const db = path.join(dataDir(), 'app.db');
    const before = fs.readFileSync(db);
    for (const target of [
      'app.db',
      'app.db-wal',
      'app.db-shm',
      'photos/x.jpg',
      'test-writes',
      'test-writes/../app.db',
      'test-writes-evil/x',
    ]) {
      await expect(
        runNoop({ writeFile: target }, ctx(1)),
        target,
      ).rejects.toThrow('writeFile must be inside test-writes/');
    }
    expect(fs.readFileSync(db).equals(before)).toBe(true);
    expect(fs.existsSync(path.join(dataDir(), 'photos', 'x.jpg'))).toBe(false);
  });

  it('writeFile "../escape.txt" throws and writes nothing outside DATA_DIR', async () => {
    const outside = path.join(dataDir(), '..', 'escape.txt');
    await expect(
      runNoop({ writeFile: '../escape.txt' }, ctx(1)),
    ).rejects.toThrow('path escapes DATA_DIR');
    expect(fs.existsSync(outside)).toBe(false);
  });
});
