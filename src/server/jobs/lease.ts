import 'server-only';
import { getDb } from '../db/client';

// One worker per DATA_DIR across processes (RESEARCH Pitfall 6). The lease is
// row id 1 of worker_lease; only its holder runs lanes and recovers jobs.

export const LEASE_HEARTBEAT_MS = 5000;
export const LEASE_STALE_MS = 15000;

export type LeaseInfo = { bootId: string; pid: number; heartbeatAt: number };

type RawLease = {
  boot_id: string;
  pid: number;
  heartbeat_at: number;
  acquired_at: number;
};

function sql() {
  return getDb().$client;
}

/** Signal-0 probe: EPERM means the process exists but is not ours. */
export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export type LeaseAcquisition = {
  acquired: boolean;
  /**
   * True when the lease was taken from another boot whose pid is still
   * alive (stale heartbeat: event-loop stall, suspend, long busy waits).
   * That holder may still be executing jobs, so the new holder must not
   * requeue them right away (WR-04).
   */
  fromLiveHolder: boolean;
};

/**
 * Take the lease when there is none, it is already ours, its heartbeat is
 * older than LEASE_STALE_MS, or its holder's pid is gone. One immediate
 * transaction, so two processes cannot both win.
 */
export function acquireLease(opts: {
  bootId: string;
  pid: number;
  now?: number;
}): LeaseAcquisition {
  const now = opts.now ?? Date.now();
  const db = sql();
  const run = db.transaction((): LeaseAcquisition => {
    const row = db.prepare('SELECT * FROM worker_lease WHERE id = 1').get() as
      | RawLease
      | undefined;
    const ours = row?.boot_id === opts.bootId;
    const alive = row !== undefined && !ours && isPidAlive(row.pid);
    const free =
      !row || ours || row.heartbeat_at < now - LEASE_STALE_MS || !alive;
    if (!free) return { acquired: false, fromLiveHolder: false };
    db.prepare(
      `INSERT INTO worker_lease (id, boot_id, pid, heartbeat_at, acquired_at)
       VALUES (1, @bootId, @pid, @now, @now)
       ON CONFLICT(id) DO UPDATE SET boot_id = excluded.boot_id, pid = excluded.pid,
         heartbeat_at = excluded.heartbeat_at, acquired_at = excluded.acquired_at`,
    ).run({ bootId: opts.bootId, pid: opts.pid, now });
    return { acquired: true, fromLiveHolder: alive };
  });
  return run.immediate();
}

/** acquireLease, reduced to whether the lease is now ours. */
export function tryAcquireLease(opts: {
  bootId: string;
  pid: number;
  now?: number;
}): boolean {
  return acquireLease(opts).acquired;
}

/** True while bootId holds the lease (a pre-side-effect fence, WR-04). */
export function holdsLease(bootId: string): boolean {
  return (
    sql()
      .prepare('SELECT 1 FROM worker_lease WHERE id = 1 AND boot_id = ?')
      .get(bootId) !== undefined
  );
}

/** Renew our heartbeat; false means another process took the lease. */
export function heartbeatLease(opts: {
  bootId: string;
  now?: number;
}): boolean {
  const info = sql()
    .prepare(
      'UPDATE worker_lease SET heartbeat_at = ? WHERE id = 1 AND boot_id = ?',
    )
    .run(opts.now ?? Date.now(), opts.bootId);
  return info.changes === 1;
}

export function releaseLease(bootId: string): void {
  sql()
    .prepare('DELETE FROM worker_lease WHERE id = 1 AND boot_id = ?')
    .run(bootId);
}

export function readLease(): LeaseInfo | null {
  const row = sql().prepare('SELECT * FROM worker_lease WHERE id = 1').get() as
    | RawLease
    | undefined;
  return row
    ? { bootId: row.boot_id, pid: row.pid, heartbeatAt: row.heartbeat_at }
    : null;
}
