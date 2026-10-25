import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bulkShelf,
  seedTopCandidate,
  useBulkSecrets,
} from '../../../test/helpers/bulk-seed';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';
import { getDb } from '../db/client';
import { maintenance } from '../jobs/handlers';
import { INTERRUPTED_LOOKUP_REASON, markInterruptedLookups } from './recovery';
import { type BulkItemDbRow, getBulkItem, startBulkRun } from './store';

// markInterruptedLookups (BULK-11, Pitfall 4 for lookups): when the worker
// gives up on a resolve_pressing job (failed or cancelled), its queued item
// must not read Finding pressing forever. One UPDATE, no network call.

function db() {
  return getDb().$client;
}

/** One spine picked into a run; returns its queued item. */
async function oneItem(): Promise<BulkItemDbRow> {
  const { spineIds } = await bulkShelf();
  const top = seedTopCandidate(spineIds[0]);
  const res = startBulkRun(db(), {
    items: [{ spineId: spineIds[0], candidateId: top.candidateId }],
    country: 'Canada',
    folderId: 1,
    now: Date.now() - 60_000,
  });
  if (res.status !== 'ok') throw new Error(`start: ${res.status}`);
  const row = db()
    .prepare('SELECT * FROM bulk_items WHERE run_id = ?')
    .get(res.runId) as BulkItemDbRow;
  return row;
}

function item(id: string): BulkItemDbRow {
  const row = getBulkItem(db(), id);
  if (!row) throw new Error(`no bulk item ${id}`);
  return row;
}

function setJobStatus(id: string | null, status: string): void {
  db().prepare('UPDATE jobs SET status = ? WHERE id = ?').run(status, id);
}

function setItem(id: string, set: Record<string, unknown>): void {
  const cols = Object.keys(set)
    .map((k) => `${k} = @${k}`)
    .join(', ');
  db()
    .prepare(`UPDATE bulk_items SET ${cols} WHERE id = @id`)
    .run({ ...set, id });
}

describe('markInterruptedLookups', () => {
  useTempDataDir();
  useBulkSecrets();
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['failed', 'cancelled'])(
    'a queued item whose job is %s becomes failed with interrupted',
    async (jobStatus) => {
      const { id, job_id, updated_at } = await oneItem();
      setJobStatus(job_id, jobStatus);
      expect(markInterruptedLookups().failed).toBe(1);
      const after = item(id);
      expect(after.status).toBe('failed');
      expect(after.error_kind).toBe('interrupted');
      expect(after.error).toBe(INTERRUPTED_LOOKUP_REASON);
      expect(after.updated_at).toBeGreaterThan(updated_at);
    },
  );

  it('keeps an unavailable error kind and reason an earlier attempt recorded', async () => {
    const { id, job_id } = await oneItem();
    setItem(id, { error_kind: 'unavailable', error: 'Discogs answered 502' });
    setJobStatus(job_id, 'failed');
    expect(markInterruptedLookups().failed).toBe(1);
    const after = item(id);
    expect(after.status).toBe('failed');
    expect(after.error_kind).toBe('unavailable');
    expect(after.error).toBe('Discogs answered 502');
  });

  it.each(['queued', 'running'])(
    'leaves a queued item whose job is %s untouched',
    async (jobStatus) => {
      const { id, job_id } = await oneItem();
      setJobStatus(job_id, jobStatus);
      const before = JSON.stringify(item(id));
      expect(markInterruptedLookups().failed).toBe(0);
      expect(JSON.stringify(item(id))).toBe(before);
    },
  );

  it.each(['resolved', 'skipped', 'failed'])(
    'leaves a %s item untouched even when its job failed',
    async (status) => {
      const { id, job_id } = await oneItem();
      setItem(id, { status });
      setJobStatus(job_id, 'failed');
      const before = JSON.stringify(item(id));
      expect(markInterruptedLookups().failed).toBe(0);
      expect(JSON.stringify(item(id))).toBe(before);
    },
  );

  it('runs as a maintenance hook and makes no network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { id, job_id } = await oneItem();
    setJobStatus(job_id, 'failed');
    for (const hook of maintenance) await hook();
    expect(item(id).status).toBe('failed');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
