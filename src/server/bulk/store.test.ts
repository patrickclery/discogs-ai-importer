import { describe, expect, it } from 'vitest';
import {
  bulkShelf,
  connectDiscogs,
  seedTopCandidate,
  useBulkSecrets,
} from '../../../test/helpers/bulk-seed';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';
import { getDb } from '../db/client';
import {
  type BulkItemDbRow,
  failBulkItem,
  getBulkItem,
  getBulkRun,
  latestBulkItemFor,
  RESOLVE_PRESSING_JOB_TYPE,
  retryBulkItem,
  startBulkRun,
} from './store';

// retryBulkItem and latestBulkItemFor (BULK-11): a failed lookup goes back
// in line on the same item under its pressing:{itemId} dedupe key, so a
// retry never makes a second job.

const START = 1_800_000_000_000;

function db() {
  return getDb().$client;
}

type JobDb = {
  id: string;
  type: string;
  status: string;
  dedupe_key: string | null;
  payload: string;
};

function jobRow(id: string | null): JobDb {
  return db().prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobDb;
}

function item(id: string): BulkItemDbRow {
  const row = getBulkItem(db(), id);
  if (!row) throw new Error(`no bulk item ${id}`);
  return row;
}

function setJobStatus(id: string | null, status: string): void {
  db().prepare('UPDATE jobs SET status = ? WHERE id = ?').run(status, id);
}

/** One spine picked into a run; returns its item id. */
async function oneItem(now = START): Promise<{
  itemId: string;
  spineId: string;
}> {
  const { spineIds } = await bulkShelf();
  connectDiscogs();
  const top = seedTopCandidate(spineIds[0]);
  const res = startBulkRun(db(), {
    items: [{ spineId: spineIds[0], candidateId: top.candidateId }],
    country: 'Canada',
    folderId: 1,
    now,
  });
  if (res.status !== 'ok') throw new Error(`start: ${res.status}`);
  const row = db()
    .prepare('SELECT id FROM bulk_items WHERE run_id = ?')
    .get(res.runId) as { id: string };
  return { itemId: row.id, spineId: spineIds[0] };
}

/** The item's lookup ended failed: its job failed and the item says why. */
function failLookup(itemId: string): string {
  const jobId = item(itemId).job_id;
  if (!jobId) throw new Error('no job');
  setJobStatus(jobId, 'failed');
  failBulkItem(db(), itemId, {
    errorKind: 'unavailable',
    error: 'Discogs answered 502',
  });
  return jobId;
}

function pressingJobs(): JobDb[] {
  return db()
    .prepare('SELECT * FROM jobs WHERE type = ? ORDER BY created_at, id')
    .all(RESOLVE_PRESSING_JOB_TYPE) as JobDb[];
}

describe('retryBulkItem (BULK-11)', () => {
  useTempDataDir();
  useBulkSecrets();

  it('a failed item is queued again under a new job that takes over its dedupe key', async () => {
    const { itemId } = await oneItem();
    const oldJob = failLookup(itemId);
    const job = retryBulkItem(db(), itemId);
    if (!job) throw new Error('retry answered busy');
    expect(job.created).toBe(true);
    expect(job.id).not.toBe(oldJob);
    expect(item(itemId)).toMatchObject({
      status: 'queued',
      error_kind: null,
      error: null,
      job_id: job.id,
    });
    expect(jobRow(job.id)).toMatchObject({
      status: 'queued',
      type: RESOLVE_PRESSING_JOB_TYPE,
      dedupe_key: `pressing:${itemId}`,
    });
    expect(JSON.parse(jobRow(job.id).payload)).toEqual({ itemId });
    expect(jobRow(oldJob).dedupe_key).toBeNull();
  });

  it('a queued or running holder job is reused, never a second job', async () => {
    const { itemId } = await oneItem();
    const holder = item(itemId).job_id;
    expect(retryBulkItem(db(), itemId)).toEqual({
      id: holder,
      created: false,
    });
    setJobStatus(holder, 'running');
    expect(retryBulkItem(db(), itemId)).toEqual({
      id: holder,
      created: false,
    });
    expect(pressingJobs()).toHaveLength(1);
  });

  it('WR-02: a failed item whose job is still running answers busy and changes nothing', async () => {
    const { itemId } = await oneItem();
    const holder = item(itemId).job_id;
    failBulkItem(db(), itemId, {
      errorKind: 'rejected',
      error: 'Discogs answered 400',
    });
    setJobStatus(holder, 'running');
    const before = JSON.stringify(item(itemId));
    expect(retryBulkItem(db(), itemId)).toBeNull();
    expect(JSON.stringify(item(itemId))).toBe(before);
    expect(pressingJobs()).toHaveLength(1);
  });
});

describe('latestBulkItemFor', () => {
  useTempDataDir();
  useBulkSecrets();

  it('returns the spine newest item with its job status', async () => {
    const { itemId, spineId } = await oneItem();
    failLookup(itemId);
    const latest = latestBulkItemFor(db(), spineId);
    expect(latest?.id).toBe(itemId);
    expect(latest?.job_status).toBe('failed');
    expect(latestBulkItemFor(db(), 'no-such-spine')).toBeUndefined();
  });
});

describe('startBulkRun fallback country (G-06-side-1)', () => {
  useTempDataDir();
  useBulkSecrets();

  async function runWith(fallbackCountry?: string | null) {
    const { spineIds } = await bulkShelf();
    const top = seedTopCandidate(spineIds[0]);
    const res = startBulkRun(db(), {
      items: [{ spineId: spineIds[0], candidateId: top.candidateId }],
      country: 'Canada',
      folderId: 1,
      now: START,
      ...(fallbackCountry === undefined ? {} : { fallbackCountry }),
    });
    if (res.status !== 'ok') throw new Error(`start: ${res.status}`);
    return getBulkRun(db(), res.runId);
  }

  it('stores the fallback country it is given', async () => {
    expect((await runWith('US'))?.fallback_country).toBe('US');
  });

  it('stores null when no fallback country is given', async () => {
    expect((await runWith())?.fallback_country).toBeNull();
  });
});
