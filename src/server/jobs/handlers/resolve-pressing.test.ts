import { describe, expect, it } from 'vitest';
import {
  bulkShelf,
  connectDiscogs,
  fakeDiscogsDeps,
  jobCtx,
  seedTopCandidate,
  useBulkSecrets,
} from '../../../../test/helpers/bulk-seed';
import { useTempDataDir } from '../../../../test/helpers/temp-data-dir';
import {
  type BulkItemDbRow,
  getBulkItem,
  RESOLVE_PRESSING_JOB_TYPE,
  startBulkRun,
} from '../../bulk/store';
import { getDb } from '../../db/client';
import type { JobRow } from '../../db/schema';
import { ADD_TO_COLLECTION_JOB_TYPE } from '../../imports/store';
import { claimNext } from '../queue';
import { runResolvePressing } from './resolve-pressing';

// resolve_pressing (D-01, D-02, D-04, D-08, D-09, D-20, D-21): one job per
// selected spine turns its top match into the preferred-country pressing
// (or a recorded fallback) and hands it to createImport. fetchImpl is
// always a stub and the gate runs on a fake clock.

const START = 1_800_000_000_000;
const LATER = START + 60_000;

function db() {
  return getDb().$client;
}

type JobDb = {
  id: string;
  type: string;
  status: string;
  run_after: number;
  dedupe_key: string | null;
  payload: string;
};

function jobsOfType(type: string): JobDb[] {
  return db()
    .prepare('SELECT * FROM jobs WHERE type = ? ORDER BY run_after, id')
    .all(type) as JobDb[];
}

type ImportDb = {
  id: string;
  spine_id: string;
  candidate_id: string;
  release_id: number;
  status: string;
  job_id: string | null;
};

function importsOf(spineId: string): ImportDb[] {
  return db()
    .prepare('SELECT * FROM imports WHERE spine_id = ? ORDER BY created_at')
    .all(spineId) as ImportDb[];
}

function item(id: string): BulkItemDbRow {
  const row = getBulkItem(db(), id);
  if (!row) throw new Error(`no bulk item ${id}`);
  return row;
}

function itemOfSpine(spineId: string): BulkItemDbRow {
  const row = db()
    .prepare(
      'SELECT * FROM bulk_items WHERE spine_id = ? ORDER BY created_at DESC',
    )
    .get(spineId) as BulkItemDbRow | undefined;
  if (!row) throw new Error(`no bulk item for ${spineId}`);
  return row;
}

/** Starts a run over the given picks; throws unless it starts. */
function start(
  picks: Array<{ spineId: string; candidateId: string }>,
  now = START,
): string {
  const res = startBulkRun(db(), {
    items: picks,
    country: 'Canada',
    folderId: 1,
    now,
  });
  if (res.status !== 'ok') throw new Error(`start: ${res.status}`);
  return res.runId;
}

function claim(): JobRow {
  const job = claimNext('discogs', LATER);
  if (!job) throw new Error('nothing to claim');
  return job;
}

function payloadOf(job: JobRow): { itemId: string } {
  return JSON.parse(job.payload) as { itemId: string };
}

describe('startBulkRun', () => {
  useTempDataDir();
  useBulkSecrets();

  it('writes one run and one queued item with a paced resolve job per pick', async () => {
    const { spineIds } = await bulkShelf();
    const a = seedTopCandidate(spineIds[0]);
    const b = seedTopCandidate(spineIds[1], { releaseId: 5002 });
    const res = startBulkRun(db(), {
      items: [
        { spineId: spineIds[0], candidateId: a.candidateId },
        { spineId: spineIds[1], candidateId: b.candidateId },
      ],
      country: 'Canada',
      folderId: 7,
      now: START,
    });
    expect(res).toMatchObject({ status: 'ok', started: 2, skipped: 0 });
    if (res.status !== 'ok') return;
    const run = db()
      .prepare('SELECT * FROM bulk_runs WHERE id = ?')
      .get(res.runId) as { total: number; country: string; folder_id: number };
    expect(run).toMatchObject({ total: 2, country: 'Canada', folder_id: 7 });
    const items = db()
      .prepare('SELECT * FROM bulk_items WHERE run_id = ? ORDER BY created_at')
      .all(res.runId) as BulkItemDbRow[];
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.status)).toEqual(['queued', 'queued']);
    const jobs = jobsOfType(RESOLVE_PRESSING_JOB_TYPE);
    expect(jobs).toHaveLength(2);
    const byItem = new Map(items.map((i) => [i.id, i]));
    for (const j of jobs) {
      const { itemId } = JSON.parse(j.payload) as { itemId: string };
      expect(j.dedupe_key).toBe(`pressing:${itemId}`);
      expect(byItem.get(itemId)?.job_id).toBe(j.id);
    }
    expect(jobs.map((j) => j.run_after)).toEqual([START, START + 1]);
    const first = jobs[0] && JSON.parse(jobs[0].payload).itemId;
    expect(byItem.get(first)?.spine_id).toBe(spineIds[0]);
  });

  it('answers busy and writes nothing while an item is still queued', async () => {
    const { spineIds } = await bulkShelf();
    const a = seedTopCandidate(spineIds[0]);
    const b = seedTopCandidate(spineIds[1]);
    start([{ spineId: spineIds[0], candidateId: a.candidateId }]);
    const counts = () =>
      JSON.stringify([
        db().prepare('SELECT COUNT(*) AS n FROM bulk_runs').get(),
        db().prepare('SELECT COUNT(*) AS n FROM bulk_items').get(),
        db().prepare('SELECT COUNT(*) AS n FROM jobs').get(),
      ]);
    const before = counts();
    expect(
      startBulkRun(db(), {
        items: [{ spineId: spineIds[1], candidateId: b.candidateId }],
        country: 'Canada',
        folderId: 1,
      }),
    ).toEqual({ status: 'busy' });
    expect(counts()).toBe(before);
  });
});

describe('resolve_pressing without a lookup', () => {
  useTempDataDir();
  useBulkSecrets();

  it('D-02: imports an already-Canadian top match with zero requests', async () => {
    connectDiscogs();
    const { spineIds } = await bulkShelf();
    const top = seedTopCandidate(spineIds[0], {
      releaseId: 6001,
      country: 'Canada',
    });
    start([{ spineId: spineIds[0], candidateId: top.candidateId }]);
    const job = claim();
    const { deps, calls } = fakeDiscogsDeps(() => ({ status: 500, body: '' }));
    await runResolvePressing(payloadOf(job), jobCtx(job), {
      fetch: deps,
    });
    expect(calls.length).toBe(0);
    const imports = importsOf(spineIds[0]);
    expect(imports).toHaveLength(1);
    expect(imports[0]).toMatchObject({
      status: 'pending',
      release_id: 6001,
      candidate_id: top.candidateId,
    });
    const adds = jobsOfType(ADD_TO_COLLECTION_JOB_TYPE);
    expect(adds).toHaveLength(1);
    expect(adds[0]?.run_after).toBe(job.runAfter);
    expect(adds[0]?.id).toBe(imports[0]?.job_id);
    expect(item(payloadOf(job).itemId)).toMatchObject({
      status: 'resolved',
      outcome: 'preferred',
      release_id: 6001,
      country: 'Canada',
      import_id: imports[0]?.id,
    });
  });

  it('D-04: a top match with no master imports as is with fallback_no_master', async () => {
    connectDiscogs();
    const { spineIds } = await bulkShelf();
    const top = seedTopCandidate(spineIds[0], {
      releaseId: 6002,
      country: 'US',
      masterId: null,
    });
    start([{ spineId: spineIds[0], candidateId: top.candidateId }]);
    const job = claim();
    const { deps, calls } = fakeDiscogsDeps(() => ({ status: 500, body: '' }));
    await runResolvePressing(payloadOf(job), jobCtx(job), { fetch: deps });
    expect(calls.length).toBe(0);
    expect(importsOf(spineIds[0]).map((i) => i.release_id)).toEqual([6002]);
    expect(itemOfSpine(spineIds[0])).toMatchObject({
      status: 'resolved',
      outcome: 'fallback_no_master',
      release_id: 6002,
      country: 'US',
    });
  });

  it('a resolved item runs again without writing anything', async () => {
    connectDiscogs();
    const { spineIds } = await bulkShelf();
    const top = seedTopCandidate(spineIds[0], { country: 'Canada' });
    start([{ spineId: spineIds[0], candidateId: top.candidateId }]);
    const job = claim();
    await runResolvePressing(payloadOf(job), jobCtx(job));
    const snapshot = () =>
      JSON.stringify([
        db().prepare('SELECT * FROM bulk_items ORDER BY id').all(),
        db().prepare('SELECT * FROM imports ORDER BY id').all(),
        db().prepare('SELECT * FROM jobs ORDER BY id').all(),
        db().prepare('SELECT * FROM discogs_candidates ORDER BY id').all(),
      ]);
    const before = snapshot();
    await runResolvePressing(payloadOf(job), jobCtx(job));
    expect(snapshot()).toBe(before);
  });
});
