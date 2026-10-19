import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';
import { getDb } from '../db/client';
import {
  acquireLease,
  heartbeatLease,
  holdsLease,
  isPidAlive,
  LEASE_HEARTBEAT_MS,
  LEASE_STALE_MS,
  readLease,
  releaseLease,
  tryAcquireLease,
} from './lease';
import { claimNext, enqueue, listJobs } from './queue';
import {
  getWorkerInfo,
  startWorker,
  stopWorker,
  strandedAfterMs,
} from './worker';

const T0 = 1_700_000_000_000;
const ALIVE_OTHER = process.ppid;

function deadPid(): number {
  const child = spawnSync(process.execPath, ['-e', '']);
  if (!child.pid) throw new Error('could not spawn a short-lived child');
  return child.pid;
}

const g = globalThis as unknown as { __appWorkerStarts?: number };

describe('worker lease', () => {
  useTempDataDir();

  it('exposes 5 s heartbeat and 15 s staleness', () => {
    expect(LEASE_HEARTBEAT_MS).toBe(5000);
    expect(LEASE_STALE_MS).toBe(15000);
  });

  it('isPidAlive is true for this process and false for an exited child', () => {
    expect(isPidAlive(process.pid)).toBe(true);
    expect(isPidAlive(deadPid())).toBe(false);
  });

  it('a second holder cannot acquire while the first heartbeat is fresh', () => {
    expect(tryAcquireLease({ bootId: 'a', pid: process.pid, now: T0 })).toBe(
      true,
    );
    expect(
      tryAcquireLease({ bootId: 'b', pid: ALIVE_OTHER, now: T0 + 1000 }),
    ).toBe(false);
    expect(readLease()).toEqual({
      bootId: 'a',
      pid: process.pid,
      heartbeatAt: T0,
    });
  });

  it('a stale lease (heartbeat + 16 s) is taken over and the old holder loses it', () => {
    tryAcquireLease({ bootId: 'a', pid: process.pid, now: T0 });
    expect(
      tryAcquireLease({ bootId: 'b', pid: ALIVE_OTHER, now: T0 + 16_000 }),
    ).toBe(true);
    expect(heartbeatLease({ bootId: 'a', now: T0 + 16_001 })).toBe(false);
    expect(heartbeatLease({ bootId: 'b', now: T0 + 16_001 })).toBe(true);
    expect(readLease()?.bootId).toBe('b');
  });

  it('a lease held by an exited process is taken over immediately', () => {
    tryAcquireLease({ bootId: 'dead', pid: deadPid(), now: T0 });
    expect(
      tryAcquireLease({ bootId: 'b', pid: process.pid, now: T0 + 1 }),
    ).toBe(true);
    expect(readLease()?.bootId).toBe('b');
  });

  it('acquireLease reports fromLiveHolder only for a stale lease whose pid is alive (WR-04)', () => {
    expect(acquireLease({ bootId: 'a', pid: ALIVE_OTHER, now: T0 })).toEqual({
      acquired: true,
      fromLiveHolder: false,
    });
    expect(
      acquireLease({ bootId: 'a', pid: ALIVE_OTHER, now: T0 + 1 }),
    ).toEqual({ acquired: true, fromLiveHolder: false });
    expect(
      acquireLease({ bootId: 'b', pid: process.pid, now: T0 + 16_000 }),
    ).toEqual({ acquired: true, fromLiveHolder: true });
    expect(holdsLease('b')).toBe(true);
    expect(holdsLease('a')).toBe(false);

    tryAcquireLease({ bootId: 'dead', pid: deadPid(), now: T0 + 40_000 });
    expect(
      acquireLease({ bootId: 'c', pid: process.pid, now: T0 + 40_001 }),
    ).toEqual({ acquired: true, fromLiveHolder: false });
  });

  it('releaseLease only deletes the row for the current holder', () => {
    tryAcquireLease({ bootId: 'a', pid: process.pid, now: T0 });
    tryAcquireLease({ bootId: 'b', pid: ALIVE_OTHER, now: T0 + 16_000 });
    releaseLease('a');
    expect(readLease()?.bootId).toBe('b');
    releaseLease('b');
    expect(readLease()).toBeNull();
  });

  it('invariant: 500 random acquire/heartbeat/release steps across three holders never leave two believing they hold the lease', () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const holders = ['h1', 'h2', 'h3'];
    // A holder believes it holds the lease while its last successful
    // acquire/heartbeat is younger than LEASE_STALE_MS.
    const lastOk = new Map<string, number>();
    let now = T0;
    for (let step = 0; step < 500; step++) {
      now += Math.floor(rand() * 8000);
      const who = holders[Math.floor(rand() * 3)];
      const op = rand();
      if (op < 0.45) {
        if (tryAcquireLease({ bootId: who, pid: process.pid, now })) {
          lastOk.set(who, now);
        }
      } else if (op < 0.85) {
        if (heartbeatLease({ bootId: who, now })) lastOk.set(who, now);
        else lastOk.delete(who);
      } else {
        releaseLease(who);
        lastOk.delete(who);
      }
      const believers = holders.filter((h) => {
        const t = lastOk.get(h);
        return t !== undefined && now - t < LEASE_STALE_MS;
      });
      expect(believers.length).toBeLessThanOrEqual(1);
      if (believers.length === 1)
        expect(readLease()?.bootId).toBe(believers[0]);
    }
  });
});

describe('lease-gated worker', () => {
  useTempDataDir();
  afterEach(() => {
    stopWorker();
    delete g.__appWorkerStarts;
  });

  it('startWorker() twice returns the same object and starts stays 1 (D-13)', () => {
    const first = startWorker();
    const second = startWorker();
    expect(second).toBe(first);
    expect(second.starts).toBe(1);
  });

  it('with a fresh foreign lease the worker waits, reports null and runs nothing', async () => {
    tryAcquireLease({ bootId: 'foreign', pid: ALIVE_OTHER, now: Date.now() });
    const { id } = enqueue({ lane: 'anthropic', type: 'noop' });
    const w = startWorker();
    expect(w.state).toBe('waiting');
    expect(getWorkerInfo()).toBeNull();
    await new Promise((r) => setTimeout(r, 300));
    expect(listJobs().find((j) => j.id === id)?.status).toBe('queued');

    stopWorker();
    expect(getWorkerInfo()).toBeNull();
    expect(readLease()?.bootId).toBe('foreign');
    await new Promise((r) => setTimeout(r, 300));
    expect(listJobs().find((j) => j.id === id)?.status).toBe('queued');
  });

  it('with no lease the worker acquires synchronously, recovers once and reports its bootId', () => {
    const spent = enqueue({ lane: 'discogs', type: 'noop' }).id;
    getDb()
      .$client.prepare(
        "UPDATE jobs SET status = 'running', attempts = 3 WHERE id = ?",
      )
      .run(spent);

    const w = startWorker();
    expect(w.state).toBe('running');
    expect(getWorkerInfo()?.bootId).toBe(w.bootId);
    expect(readLease()).toMatchObject({ bootId: w.bootId, pid: process.pid });
    expect(listJobs().find((j) => j.id === spent)).toMatchObject({
      status: 'failed',
      lastError: 'interrupted after final attempt',
    });

    // A second start must not recover again.
    const again = enqueue({ lane: 'discogs', type: 'noop', runAfter: 0 }).id;
    expect(claimNext('discogs')?.id).toBe(again);
    expect(startWorker()).toBe(w);
    expect(listJobs().find((j) => j.id === again)?.status).toBe('running');
  });

  it('taking the lease from a live holder requeues only jobs it cannot still be running (WR-04)', () => {
    const db = getDb().$client;
    const now = Date.now();
    const oldId = enqueue({ lane: 'anthropic', type: 'noop', runAfter: 0 }).id;
    const recentId = enqueue({ lane: 'discogs', type: 'noop', runAfter: 0 }).id;
    const oldLock = now - strandedAfterMs() - 1000;
    const recentLock = now - 1000;
    db.prepare(
      "UPDATE jobs SET status = 'running', attempts = 1, locked_at = ? WHERE id = ?",
    ).run(oldLock, oldId);
    db.prepare(
      "UPDATE jobs SET status = 'running', attempts = 1, locked_at = ? WHERE id = ?",
    ).run(recentLock, recentId);
    // A live process (our parent) whose heartbeat went stale.
    tryAcquireLease({ bootId: 'stalled', pid: ALIVE_OTHER, now: now - 20_000 });

    const w = startWorker();
    expect(w.state).toBe('running');
    const byId = (id: string) => listJobs().find((j) => j.id === id);
    // The stalled holder may still be running this one: left alone.
    expect(byId(recentId)).toMatchObject({
      status: 'running',
      attempts: 1,
      lockedAt: recentLock,
    });
    // Claimed long before any handler could still run: recovered.
    expect(byId(oldId)?.lockedAt).not.toBe(oldLock);
  });

  it('taking the lease from a dead holder recovers every running job at once', () => {
    const db = getDb().$client;
    const id = enqueue({ lane: 'discogs', type: 'mystery', runAfter: 0 }).id;
    const lock = Date.now() - 1000;
    db.prepare(
      "UPDATE jobs SET status = 'running', attempts = 1, locked_at = ? WHERE id = ?",
    ).run(lock, id);
    tryAcquireLease({ bootId: 'dead', pid: deadPid(), now: Date.now() });
    startWorker();
    expect(listJobs().find((j) => j.id === id)?.lockedAt).not.toBe(lock);
  });

  it('stopWorker releases the lease and leaves nothing running', () => {
    const w = startWorker();
    expect(readLease()?.bootId).toBe(w.bootId);
    stopWorker();
    expect(readLease()).toBeNull();
    expect(getWorkerInfo()).toBeNull();
  });
});
