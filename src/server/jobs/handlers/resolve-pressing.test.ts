import fs from 'node:fs';
import path from 'node:path';
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
  failBulkItem,
  getBulkItem,
  RESOLVE_PRESSING_JOB_TYPE,
  startBulkRun,
} from '../../bulk/store';
import { getDb } from '../../db/client';
import type { JobRow } from '../../db/schema';
import { markAuthInvalid } from '../../discogs/auth';
import { ADD_TO_COLLECTION_JOB_TYPE, createImport } from '../../imports/store';
import { claimNext, complete } from '../queue';
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
  fallback?: string | null,
): string {
  const res = startBulkRun(db(), {
    items: picks,
    country: 'Canada',
    folderId: 1,
    now,
    fallbackCountry: fallback,
  });
  if (res.status !== 'ok') throw new Error(`start: ${res.status}`);
  return res.runId;
}

/** The next discogs-lane job; the shelf is scanned before connecting, so
 * no search_spine job is queued ahead of the bulk jobs. */
function claim(type = RESOLVE_PRESSING_JOB_TYPE): JobRow {
  const job = claimNext('discogs', LATER);
  if (!job) throw new Error('nothing to claim');
  if (job.type !== type) throw new Error(`claimed ${job.type}, not ${type}`);
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
    const { spineIds } = await bulkShelf();
    connectDiscogs();
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

  it('WR-01: the import goes to the folder snapshotted on the run, not the current setting', async () => {
    const { spineIds } = await bulkShelf();
    connectDiscogs();
    const top = seedTopCandidate(spineIds[0], { country: 'Canada' });
    const res = startBulkRun(db(), {
      items: [{ spineId: spineIds[0], candidateId: top.candidateId }],
      country: 'Canada',
      folderId: 7,
      now: START,
    });
    expect(res.status).toBe('ok');
    const job = claim();
    const { deps } = fakeDiscogsDeps(() => ({ status: 500, body: '' }));
    await runResolvePressing(payloadOf(job), jobCtx(job), { fetch: deps });
    const row = db()
      .prepare('SELECT folder_id FROM imports WHERE spine_id = ?')
      .get(spineIds[0]) as { folder_id: number } | undefined;
    expect(row?.folder_id).toBe(7);
  });

  it('D-04: a top match with no master imports as is with fallback_no_master', async () => {
    const { spineIds } = await bulkShelf();
    connectDiscogs();
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
    const { spineIds } = await bulkShelf();
    connectDiscogs();
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

const FIXTURES = path.resolve(__dirname, '../../../../test/fixtures/discogs');

function fixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
}

/** The canada fixture's earliest official DGC CD (Plan 06-01, D-03). */
const CANADIAN_ID = 12009956;

const NO_CANADIAN = {
  pagination: { page: 1, pages: 0, per_page: 100, items: 0 },
  versions: [],
};

/** An official US CD of Nevermind, as a fallback-country answer lists it. */
const US_ID = 5101;

function versionsAnswer(versions: unknown[]) {
  return {
    pagination: { page: 1, pages: 1, per_page: 100, items: versions.length },
    versions,
  };
}

const US_VERSIONS = versionsAnswer([
  {
    id: US_ID,
    title: 'Nevermind',
    label: 'DGC',
    country: 'US',
    major_formats: ['CD'],
    format: 'Album',
    catno: 'DGCD-24425',
    released: '1991',
    thumb: '',
  },
]);

type CandidateDb = {
  id: string;
  source: string;
  release_id: number;
  search_id: string;
  thumb_url: string | null;
  country: string | null;
  title: string;
};

function pressingRows(spineId: string): CandidateDb[] {
  return db()
    .prepare(
      `SELECT * FROM discogs_candidates
       WHERE spine_id = ? AND source = 'pressing'`,
    )
    .all(spineId) as CandidateDb[];
}

function setImport(id: string, set: Record<string, unknown>): void {
  const cols = Object.keys(set)
    .map((k) => `${k} = @${k}`)
    .join(', ');
  db()
    .prepare(`UPDATE imports SET ${cols} WHERE id = @id`)
    .run({ ...set, id });
}

function setJobStatus(id: string | null, status: string): void {
  db().prepare('UPDATE jobs SET status = ? WHERE id = ?').run(status, id);
}

/** A pending import of the spine's top match made outside any bulk run. */
function earlierImport(spineId: string, candidateId: string): ImportDb {
  const res = createImport(db(), { spineId, candidateId });
  if (res.status !== 'ok') throw new Error(`earlierImport: ${res.status}`);
  return importsOf(spineId)[0] as ImportDb;
}

/** Claims the next resolve job and runs it against the canned answer. */
async function resolveNext(
  answer: (url: URL) => { status: number; body: unknown },
) {
  const job = claim();
  const fake = fakeDiscogsDeps(answer);
  await runResolvePressing(payloadOf(job), jobCtx(job), { fetch: fake.deps });
  return { job, calls: fake.calls, itemId: payloadOf(job).itemId };
}

describe('resolve_pressing with a versions lookup', () => {
  useTempDataDir();
  useBulkSecrets();

  it('D-01: one versions request picks the Canadian pressing, stored hidden', async () => {
    const { spineIds } = await bulkShelf();
    connectDiscogs();
    const top = seedTopCandidate(spineIds[0]);
    start([{ spineId: spineIds[0], candidateId: top.candidateId }]);
    const { calls, itemId } = await resolveNext(() => ({
      status: 200,
      body: fixture('master-versions-canada.json'),
    }));
    expect(calls.length).toBe(1);
    const url = calls[0] as URL;
    expect(url.pathname).toBe('/masters/13814/versions');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      country: 'Canada',
      format: 'CD',
      per_page: '100',
      page: '1',
      sort: 'released',
      sort_order: 'asc',
    });
    const pressing = pressingRows(spineIds[0]);
    expect(pressing).toHaveLength(1);
    expect(pressing[0]).toMatchObject({
      release_id: CANADIAN_ID,
      search_id: top.searchId,
      country: 'Canada',
      title: 'Nirvana - Nevermind',
    });
    expect(pressing[0]?.thumb_url).toMatch(/^https:\/\/i\.discogs\.com\//);
    const imports = importsOf(spineIds[0]);
    expect(imports).toHaveLength(1);
    expect(imports[0]).toMatchObject({
      release_id: CANADIAN_ID,
      candidate_id: pressing[0]?.id,
      status: 'pending',
    });
    expect(item(itemId)).toMatchObject({
      status: 'resolved',
      outcome: 'preferred',
      release_id: CANADIAN_ID,
      country: 'Canada',
      import_id: imports[0]?.id,
    });
  });

  it('a later run of the same spine reuses its pressing row', async () => {
    const { spineIds } = await bulkShelf();
    connectDiscogs();
    const top = seedTopCandidate(spineIds[0]);
    const canada = () => ({
      status: 200,
      body: fixture('master-versions-canada.json'),
    });
    start([{ spineId: spineIds[0], candidateId: top.candidateId }]);
    const first = await resolveNext(canada);
    complete(first.job.id);
    const [firstImport] = importsOf(spineIds[0]);
    setImport(firstImport?.id as string, { status: 'failed' });
    setJobStatus(firstImport?.job_id ?? null, 'failed');
    const before = pressingRows(spineIds[0]);
    start(
      [{ spineId: spineIds[0], candidateId: top.candidateId }],
      START + 100,
    );
    const second = await resolveNext(canada);
    expect(second.calls.length).toBe(1);
    const after = pressingRows(spineIds[0]);
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(before[0]?.id);
    expect(item(second.itemId).status).toBe('resolved');
    expect(importsOf(spineIds[0])).toHaveLength(2);
  });

  it('D-04: no Canadian version imports the top match with fallback_no_version', async () => {
    const { spineIds } = await bulkShelf();
    connectDiscogs();
    const top = seedTopCandidate(spineIds[0]);
    start([{ spineId: spineIds[0], candidateId: top.candidateId }]);
    const { calls, itemId } = await resolveNext(() => ({
      status: 200,
      body: NO_CANADIAN,
    }));
    expect(calls.length).toBe(1);
    expect(pressingRows(spineIds[0])).toHaveLength(0);
    expect(importsOf(spineIds[0]).map((i) => i.release_id)).toEqual([5001]);
    expect(item(itemId)).toMatchObject({
      status: 'resolved',
      outcome: 'fallback_no_version',
      release_id: 5001,
      country: 'US',
    });
  });

  it('D-21: an implausible versions answer imports the top match with fallback_unusable_master', async () => {
    const { spineIds } = await bulkShelf();
    connectDiscogs();
    const top = seedTopCandidate(spineIds[0]);
    start([{ spineId: spineIds[0], candidateId: top.candidateId }]);
    const { itemId } = await resolveNext(() => ({
      status: 200,
      body: fixture('master-versions-bogus.json'),
    }));
    expect(pressingRows(spineIds[0])).toHaveLength(0);
    expect(importsOf(spineIds[0]).map((i) => i.release_id)).toEqual([5001]);
    expect(item(itemId)).toMatchObject({
      status: 'resolved',
      outcome: 'fallback_unusable_master',
      release_id: 5001,
    });
  });

  it('D-09: a second spine resolving to the same release is skipped as a duplicate', async () => {
    const { spineIds } = await bulkShelf();
    connectDiscogs();
    const a = seedTopCandidate(spineIds[0], {
      releaseId: 7001,
      country: 'Canada',
    });
    const b = seedTopCandidate(spineIds[1], {
      releaseId: 7001,
      country: 'Canada',
    });
    start([
      { spineId: spineIds[0], candidateId: a.candidateId },
      { spineId: spineIds[1], candidateId: b.candidateId },
    ]);
    const first = await resolveNext(() => ({ status: 500, body: '' }));
    complete(first.job.id);
    // The first spine's add job is next; park it so the second lookup runs.
    const add = claim(ADD_TO_COLLECTION_JOB_TYPE);
    const second = await resolveNext(() => ({ status: 500, body: '' }));
    expect(add.id).toBe(importsOf(spineIds[0])[0]?.job_id);
    expect(item(first.itemId).status).toBe('resolved');
    expect(item(second.itemId)).toMatchObject({
      status: 'skipped',
      skip_reason: 'duplicate',
      dup_spine_id: spineIds[0],
      import_id: null,
    });
    expect(importsOf(spineIds[1])).toHaveLength(0);
  });

  it('D-20: a failed import that may have landed is retried on the same row, with no request', async () => {
    const { spineIds } = await bulkShelf();
    connectDiscogs();
    const top = seedTopCandidate(spineIds[0]);
    const earlier = earlierImport(spineIds[0], top.candidateId);
    setImport(earlier.id, {
      status: 'failed',
      intent_at: 1,
      error_kind: 'unavailable',
      error: 'Discogs did not answer',
    });
    setJobStatus(earlier.job_id, 'failed');
    start([{ spineId: spineIds[0], candidateId: top.candidateId }]);
    const { job, calls, itemId } = await resolveNext(() => ({
      status: 200,
      body: fixture('master-versions-canada.json'),
    }));
    expect(calls.length).toBe(0);
    const imports = importsOf(spineIds[0]);
    expect(imports).toHaveLength(1);
    expect(imports[0]?.id).toBe(earlier.id);
    expect(imports[0]?.status).toBe('pending');
    const addJob = db()
      .prepare('SELECT * FROM jobs WHERE id = ?')
      .get(imports[0]?.job_id) as JobDb;
    expect(addJob.status).toBe('queued');
    expect(addJob.type).toBe(ADD_TO_COLLECTION_JOB_TYPE);
    expect(addJob.run_after).toBe(job.runAfter);
    expect(item(itemId)).toMatchObject({
      status: 'resolved',
      outcome: 'retried_earlier',
      import_id: earlier.id,
      release_id: 5001,
      country: 'US',
    });
  });

  it('D-20: a failed import with no intent gets a new import for the pressing', async () => {
    const { spineIds } = await bulkShelf();
    connectDiscogs();
    const top = seedTopCandidate(spineIds[0]);
    const earlier = earlierImport(spineIds[0], top.candidateId);
    setImport(earlier.id, { status: 'failed', error_kind: 'unavailable' });
    setJobStatus(earlier.job_id, 'failed');
    start([{ spineId: spineIds[0], candidateId: top.candidateId }]);
    const { calls, itemId } = await resolveNext(() => ({
      status: 200,
      body: fixture('master-versions-canada.json'),
    }));
    expect(calls.length).toBe(1);
    const imports = importsOf(spineIds[0]);
    expect(imports).toHaveLength(2);
    expect(imports[1]?.release_id).toBe(CANADIAN_ID);
    expect(item(itemId)).toMatchObject({
      status: 'resolved',
      outcome: 'preferred',
      import_id: imports[1]?.id,
    });
  });

  it('an open import or a not-on-Discogs mark skips the item as changed', async () => {
    const { spineIds } = await bulkShelf();
    connectDiscogs();
    const a = seedTopCandidate(spineIds[0], { country: 'Canada' });
    const b = seedTopCandidate(spineIds[1], { country: 'Canada' });
    const open = earlierImport(spineIds[0], a.candidateId);
    setJobStatus(open.job_id, 'cancelled');
    db()
      .prepare('UPDATE spines SET not_on_discogs = 1 WHERE id = ?')
      .run(spineIds[1]);
    start([
      { spineId: spineIds[0], candidateId: a.candidateId },
      { spineId: spineIds[1], candidateId: b.candidateId },
    ]);
    const first = await resolveNext(() => ({ status: 500, body: '' }));
    const second = await resolveNext(() => ({ status: 500, body: '' }));
    for (const r of [first, second]) {
      expect(item(r.itemId)).toMatchObject({
        status: 'skipped',
        skip_reason: 'changed',
      });
    }
    expect(importsOf(spineIds[0])).toHaveLength(1);
    expect(importsOf(spineIds[1])).toHaveLength(0);
  });

  it('a candidate that is gone skips the item as changed', async () => {
    const { spineIds } = await bulkShelf();
    connectDiscogs();
    const top = seedTopCandidate(spineIds[0]);
    start([{ spineId: spineIds[0], candidateId: top.candidateId }]);
    db()
      .prepare('DELETE FROM discogs_candidates WHERE id = ?')
      .run(top.candidateId);
    const { calls, itemId } = await resolveNext(() => ({
      status: 500,
      body: '',
    }));
    expect(calls.length).toBe(0);
    expect(item(itemId)).toMatchObject({
      status: 'skipped',
      skip_reason: 'changed',
    });
  });

  it('interleaves: lookup 1, add 1, lookup 2', async () => {
    const { spineIds } = await bulkShelf();
    connectDiscogs();
    const a = seedTopCandidate(spineIds[0]);
    const b = seedTopCandidate(spineIds[1], { releaseId: 5002 });
    start([
      { spineId: spineIds[0], candidateId: a.candidateId },
      { spineId: spineIds[1], candidateId: b.candidateId },
    ]);
    const order: string[] = [];
    const first = claimNext('discogs', LATER) as JobRow;
    order.push(first.type);
    const fake = fakeDiscogsDeps(() => ({
      status: 200,
      body: fixture('master-versions-canada.json'),
    }));
    await runResolvePressing(payloadOf(first), jobCtx(first), {
      fetch: fake.deps,
    });
    expect(complete(first.id, LATER, first.attempts)).toBe(true);
    const second = claimNext('discogs', LATER) as JobRow;
    order.push(second.type);
    const third = claimNext('discogs', LATER) as JobRow;
    order.push(third.type);
    expect(order.join(',')).toBe(
      [
        RESOLVE_PRESSING_JOB_TYPE,
        ADD_TO_COLLECTION_JOB_TYPE,
        RESOLVE_PRESSING_JOB_TYPE,
      ].join(','),
    );
    expect(payloadOf(third).itemId).toBe(itemOfSpine(spineIds[1]).id);
  });
});

type Outcome = { error: { name?: string; runAfter?: number } | null };

/** Runs the next resolve job; a rejection is returned, not thrown. */
async function attempt(
  answer: (url: URL) => {
    status: number;
    body: unknown;
    headers?: Record<string, string>;
  },
  opts: {
    current?: () => boolean;
    pausedFor?: number;
    afterAnswer?: () => void;
    /** Run as the job's last attempt (attempts = maxAttempts). */
    lastAttempt?: boolean;
  } = {},
) {
  const claimed = claim();
  const job = opts.lastAttempt
    ? { ...claimed, attempts: claimed.maxAttempts }
    : claimed;
  const fake = fakeDiscogsDeps((url) => {
    const a = answer(url);
    opts.afterAnswer?.();
    return a;
  });
  if (opts.pausedFor) fake.deps.gate?.pause(opts.pausedFor);
  const out: Outcome = { error: null };
  await runResolvePressing(payloadOf(job), jobCtx(job, opts.current), {
    fetch: fake.deps,
  }).catch((e: unknown) => {
    out.error = e as Outcome['error'];
  });
  return {
    ...out,
    job,
    calls: fake.calls,
    clock: fake.clock,
    itemId: payloadOf(job).itemId,
  };
}

describe('resolve_pressing fallback country (G-06-side-1)', () => {
  useTempDataDir();
  useBulkSecrets();

  it('tracer: a Hong Kong top match with no Canadian CD imports its US pressing', async () => {
    const { spineIds } = await bulkShelf();
    connectDiscogs();
    const top = seedTopCandidate(spineIds[0], { country: 'Hong Kong' });
    start(
      [{ spineId: spineIds[0], candidateId: top.candidateId }],
      START,
      'US',
    );
    const { calls, itemId } = await resolveNext((url) =>
      url.searchParams.get('country') === 'US'
        ? { status: 200, body: US_VERSIONS }
        : { status: 200, body: NO_CANADIAN },
    );
    expect(calls.length).toBe(2);
    expect(calls.map((u) => u.pathname)).toEqual([
      '/masters/13814/versions',
      '/masters/13814/versions',
    ]);
    expect(
      calls.map((u) => [
        u.searchParams.get('country'),
        u.searchParams.get('format'),
      ]),
    ).toEqual([
      ['Canada', 'CD'],
      ['US', 'CD'],
    ]);
    const pressing = pressingRows(spineIds[0]);
    expect(pressing).toHaveLength(1);
    expect(pressing[0]).toMatchObject({
      release_id: US_ID,
      country: 'US',
      title: 'Nirvana - Nevermind',
    });
    const imports = importsOf(spineIds[0]);
    expect(imports).toHaveLength(1);
    expect(imports[0]).toMatchObject({
      release_id: US_ID,
      candidate_id: pressing[0]?.id,
    });
    expect(item(itemId)).toMatchObject({
      status: 'resolved',
      outcome: 'fallback_country',
      release_id: US_ID,
      country: 'US',
      import_id: imports[0]?.id,
    });
  });
});

describe('resolve_pressing refusals and Discogs errors', () => {
  useTempDataDir();
  useBulkSecrets();

  /** One US top match with a master: a lookup is needed. */
  async function lookupSpine(connect = true): Promise<string> {
    const { spineIds } = await bulkShelf();
    if (connect) connectDiscogs();
    const top = seedTopCandidate(spineIds[0]);
    start([{ spineId: spineIds[0], candidateId: top.candidateId }]);
    return spineIds[0];
  }

  const canada = () => ({
    status: 200,
    body: fixture('master-versions-canada.json'),
  });

  function tables(): string {
    return JSON.stringify([
      db().prepare('SELECT * FROM bulk_items ORDER BY id').all(),
      db().prepare('SELECT * FROM imports ORDER BY id').all(),
      db().prepare('SELECT * FROM discogs_candidates ORDER BY id').all(),
    ]);
  }

  it('no Discogs sign-in fails the item as auth with no request', async () => {
    await lookupSpine(false);
    const r = await attempt(canada);
    expect(r.error).toBeNull();
    expect(r.calls.length).toBe(0);
    expect(item(r.itemId)).toMatchObject({
      status: 'failed',
      error_kind: 'auth',
    });
  });

  it('a sign-in Discogs refused fails the item as auth with no request', async () => {
    await lookupSpine();
    markAuthInvalid();
    const r = await attempt(canada);
    expect(r.calls.length).toBe(0);
    expect(item(r.itemId)).toMatchObject({
      status: 'failed',
      error_kind: 'auth',
    });
  });

  it('a paused gate defers with no request and leaves the item queued', async () => {
    await lookupSpine();
    const r = await attempt(canada, { pausedFor: 5000 });
    expect(r.error?.name).toBe('JobDeferredError');
    expect(r.calls.length).toBe(0);
    expect(item(r.itemId).status).toBe('queued');
  });

  it('a 429 defers to the resume time without recording an error', async () => {
    await lookupSpine();
    const r = await attempt(() => ({
      status: 429,
      body: '',
      headers: { 'retry-after': '4' },
    }));
    expect(r.error?.name).toBe('JobDeferredError');
    expect(r.error?.runAfter).toBe(r.clock.t + 4000);
    expect(item(r.itemId)).toMatchObject({
      status: 'queued',
      error_kind: null,
      error: null,
    });
  });

  it('a 401 fails the item as auth with no username in the reason', async () => {
    await lookupSpine();
    const r = await attempt(() => ({ status: 401, body: '{"message":"no"}' }));
    expect(r.error).toBeNull();
    const row = item(r.itemId);
    expect(row).toMatchObject({ status: 'failed', error_kind: 'auth' });
    expect(row.error).toBeTruthy();
    expect(row.error).not.toContain('fake-owner');
  });

  it('D-04: a 404 counts as no master and imports the top match', async () => {
    const spineId = await lookupSpine();
    const r = await attempt(() => ({ status: 404, body: '{"message":"no"}' }));
    expect(r.error?.name ?? null).toBeNull();
    expect(r.calls.length).toBe(1);
    expect(
      importsOf(spineId)
        .map((i) => i.release_id)
        .join(','),
    ).toBe('5001');
    expect(item(r.itemId)).toMatchObject({
      status: 'resolved',
      outcome: 'fallback_no_master',
      release_id: 5001,
    });
  });

  it('another 4xx fails the item as rejected', async () => {
    await lookupSpine();
    const r = await attempt(() => ({ status: 422, body: '{"message":"no"}' }));
    expect(r.error).toBeNull();
    const row = item(r.itemId);
    expect(row).toMatchObject({ status: 'failed', error_kind: 'rejected' });
    expect(row.error).toContain('422');
  });

  it('a 5xx is recorded as unavailable and rethrown for the worker', async () => {
    const spineId = await lookupSpine();
    const r = await attempt(() => ({ status: 502, body: '' }));
    expect(r.error?.name).toBe('DiscogsUnavailableError');
    expect(item(r.itemId)).toMatchObject({
      status: 'queued',
      error_kind: 'unavailable',
    });
    expect(importsOf(spineId)).toHaveLength(0);
  });

  it('WR-05: a versions body of the wrong shape fails the item as rejected, with no retry', async () => {
    const spineId = await lookupSpine();
    const r = await attempt(() => ({ status: 200, body: { nope: 1 } }));
    expect(r.error).toBeNull();
    expect(r.calls.length).toBe(1);
    expect(item(r.itemId)).toMatchObject({
      status: 'failed',
      error_kind: 'rejected',
      error: 'Discogs answered an unexpected versions list',
    });
    expect(importsOf(spineId)).toHaveLength(0);
  });

  it('a run that is no longer current throws before the request and writes nothing', async () => {
    await lookupSpine();
    const before = tables();
    const r = await attempt(canada, { current: () => false });
    expect(r.error?.name).toBe('NotCurrentError');
    expect(r.calls.length).toBe(0);
    expect(tables()).toBe(before);
    expect(db().prepare('SELECT COUNT(*) AS n FROM imports').get()).toEqual({
      n: 0,
    });
  });

  it('a run that stops being current during the request writes nothing', async () => {
    await lookupSpine();
    const before = tables();
    let current = true;
    const r = await attempt(canada, {
      current: () => current,
      afterAnswer: () => {
        current = false;
      },
    });
    expect(r.calls.length).toBe(1);
    expect(tables()).toBe(before);
    expect(db().prepare('SELECT COUNT(*) AS n FROM imports').get()).toEqual({
      n: 0,
    });
  });

  it.each(['orphaned', 'superseded', 'dismissed'])(
    'a spine that became %s is skipped as changed with no request',
    async (state) => {
      const spineId = await lookupSpine();
      db()
        .prepare('UPDATE spines SET state = ? WHERE id = ?')
        .run(state, spineId);
      const r = await attempt(canada);
      expect(r.calls.length).toBe(0);
      expect(item(r.itemId)).toMatchObject({
        status: 'skipped',
        skip_reason: 'changed',
      });
    },
  );

  it('failBulkItem cuts the reason to 160 code points', async () => {
    await lookupSpine();
    const itemId = itemOfSpine(
      (
        db().prepare('SELECT spine_id FROM bulk_items').get() as {
          spine_id: string;
        }
      ).spine_id,
    ).id;
    failBulkItem(db(), itemId, { errorKind: 'other', error: '😀'.repeat(300) });
    expect([...(item(itemId).error ?? '')].length).toBe(160);
  });
});

describe('resolve_pressing fallback lookup: when it is sent and how it fails', () => {
  useTempDataDir();
  useBulkSecrets();

  /** A Hong Kong top match (master 13814) in a run with fallback US. */
  async function fallbackSpine(
    over: Parameters<typeof seedTopCandidate>[1] = {},
    fallback: string | null = 'US',
  ): Promise<string> {
    const { spineIds } = await bulkShelf();
    connectDiscogs();
    const top = seedTopCandidate(spineIds[0], {
      country: 'Hong Kong',
      ...over,
    });
    start(
      [{ spineId: spineIds[0], candidateId: top.candidateId }],
      START,
      fallback,
    );
    return spineIds[0];
  }

  /** Canada answers no version; the US request gets `us`. */
  function byCountry(us: {
    status: number;
    body: unknown;
    headers?: Record<string, string>;
  }) {
    return (url: URL) =>
      url.searchParams.get('country') === 'US'
        ? us
        : { status: 200, body: NO_CANADIAN };
  }

  const countries = (calls: URL[]) =>
    calls.map((u) => u.searchParams.get('country'));

  function tables(): string {
    return JSON.stringify([
      db().prepare('SELECT * FROM bulk_items ORDER BY id').all(),
      db().prepare('SELECT * FROM imports ORDER BY id').all(),
      db().prepare('SELECT * FROM discogs_candidates ORDER BY id').all(),
    ]);
  }

  function importedReleases(spineId: string): number[] {
    return importsOf(spineId).map((i) => i.release_id);
  }

  it('a top match already from the fallback country costs one request and is imported as fallback_country', async () => {
    const spineId = await fallbackSpine({ country: 'US' });
    const r = await attempt(byCountry({ status: 200, body: US_VERSIONS }));
    expect(countries(r.calls)).toEqual(['Canada']);
    expect(importedReleases(spineId)).toEqual([5001]);
    expect(item(r.itemId)).toMatchObject({
      status: 'resolved',
      outcome: 'fallback_country',
      release_id: 5001,
      country: 'US',
    });
  });

  it('a run with no fallback country makes one request and keeps fallback_no_version', async () => {
    const spineId = await fallbackSpine({}, null);
    const r = await attempt(byCountry({ status: 200, body: US_VERSIONS }));
    expect(countries(r.calls)).toEqual(['Canada']);
    expect(importedReleases(spineId)).toEqual([5001]);
    expect(item(r.itemId)).toMatchObject({
      status: 'resolved',
      outcome: 'fallback_no_version',
    });
  });

  it('a Canadian version in the first answer never asks for the US one', async () => {
    const spineId = await fallbackSpine();
    const r = await attempt((url) =>
      url.searchParams.get('country') === 'US'
        ? { status: 200, body: US_VERSIONS }
        : { status: 200, body: fixture('master-versions-canada.json') },
    );
    expect(countries(r.calls)).toEqual(['Canada']);
    expect(importedReleases(spineId)).toEqual([CANADIAN_ID]);
    expect(item(r.itemId)).toMatchObject({
      status: 'resolved',
      outcome: 'preferred',
    });
  });

  it('a top match with no master makes no request', async () => {
    const spineId = await fallbackSpine({ masterId: null });
    const r = await attempt(byCountry({ status: 200, body: US_VERSIONS }));
    expect(r.calls.length).toBe(0);
    expect(importedReleases(spineId)).toEqual([5001]);
    expect(item(r.itemId).outcome).toBe('fallback_no_master');
  });

  it('a 404 on the first request sends no second request', async () => {
    const spineId = await fallbackSpine();
    const r = await attempt((url) =>
      url.searchParams.get('country') === 'US'
        ? { status: 200, body: US_VERSIONS }
        : { status: 404, body: '{"message":"no"}' },
    );
    expect(countries(r.calls)).toEqual(['Canada']);
    expect(importedReleases(spineId)).toEqual([5001]);
    expect(item(r.itemId).outcome).toBe('fallback_no_master');
  });

  it('an implausible first answer sends no second request', async () => {
    const spineId = await fallbackSpine();
    const r = await attempt((url) =>
      url.searchParams.get('country') === 'US'
        ? { status: 200, body: US_VERSIONS }
        : { status: 200, body: fixture('master-versions-bogus.json') },
    );
    expect(countries(r.calls)).toEqual(['Canada']);
    expect(importedReleases(spineId)).toEqual([5001]);
    expect(item(r.itemId).outcome).toBe('fallback_unusable_master');
  });

  it('WR-01: a Canadian pick that fails the title guard sends no second request and stays fallback_unusable_master', async () => {
    const spineId = await fallbackSpine();
    const bleach = versionsAnswer([
      {
        id: 7001,
        title: 'Bleach',
        label: 'Sub Pop',
        country: 'Canada',
        major_formats: ['CD'],
        format: 'Album',
        released: '1989',
      },
    ]);
    const r = await attempt((url) =>
      url.searchParams.get('country') === 'US'
        ? { status: 200, body: US_VERSIONS }
        : { status: 200, body: bleach },
    );
    expect(countries(r.calls)).toEqual(['Canada']);
    expect(importedReleases(spineId)).toEqual([5001]);
    expect(item(r.itemId).outcome).toBe('fallback_unusable_master');
  });

  it('no US version in the second answer imports the top match with fallback_no_version', async () => {
    const spineId = await fallbackSpine();
    const r = await attempt(byCountry({ status: 200, body: NO_CANADIAN }));
    expect(countries(r.calls)).toEqual(['Canada', 'US']);
    expect(importedReleases(spineId)).toEqual([5001]);
    expect(item(r.itemId)).toMatchObject({
      status: 'resolved',
      outcome: 'fallback_no_version',
      release_id: 5001,
      country: 'Hong Kong',
    });
  });

  it('an implausible second answer imports the top match with fallback_country_unusable', async () => {
    const spineId = await fallbackSpine();
    const r = await attempt(
      byCountry({ status: 200, body: fixture('master-versions-bogus.json') }),
    );
    expect(countries(r.calls)).toEqual(['Canada', 'US']);
    expect(importedReleases(spineId)).toEqual([5001]);
    expect(item(r.itemId).outcome).toBe('fallback_country_unusable');
  });

  it('a US pick that fails the title guard imports the top match with fallback_country_unusable', async () => {
    const spineId = await fallbackSpine();
    const bleach = versionsAnswer([
      {
        id: US_ID,
        title: 'Bleach',
        label: 'Sub Pop',
        country: 'US',
        major_formats: ['CD'],
        format: 'Album',
        released: '1989',
      },
    ]);
    const r = await attempt(byCountry({ status: 200, body: bleach }));
    expect(countries(r.calls)).toEqual(['Canada', 'US']);
    expect(importedReleases(spineId)).toEqual([5001]);
    expect(pressingRows(spineId)).toHaveLength(0);
    expect(item(r.itemId).outcome).toBe('fallback_country_unusable');
  });

  it('a 429 on the second request defers to the resume time with no recorded error', async () => {
    const spineId = await fallbackSpine();
    const r = await attempt(
      byCountry({ status: 429, body: '', headers: { 'retry-after': '4' } }),
    );
    expect(countries(r.calls)).toEqual(['Canada', 'US']);
    expect(r.error?.name).toBe('JobDeferredError');
    expect(r.error?.runAfter).toBe(r.clock.t + 4000);
    expect(item(r.itemId)).toMatchObject({
      status: 'queued',
      error_kind: null,
      error: null,
    });
    expect(importsOf(spineId)).toHaveLength(0);
  });

  it('a 401 on the second request fails the item as auth with no username', async () => {
    const spineId = await fallbackSpine();
    const r = await attempt(
      byCountry({ status: 401, body: '{"message":"no"}' }),
    );
    expect(countries(r.calls)).toEqual(['Canada', 'US']);
    expect(r.error).toBeNull();
    const row = item(r.itemId);
    expect(row).toMatchObject({ status: 'failed', error_kind: 'auth' });
    expect(row.error).toBeTruthy();
    expect(row.error).not.toContain('fake-owner');
    expect(importsOf(spineId)).toHaveLength(0);
  });

  it('a 404 on the second request counts as no US version', async () => {
    const spineId = await fallbackSpine();
    const r = await attempt(
      byCountry({ status: 404, body: '{"message":"no"}' }),
    );
    expect(countries(r.calls)).toEqual(['Canada', 'US']);
    expect(r.error).toBeNull();
    expect(importedReleases(spineId)).toEqual([5001]);
    expect(item(r.itemId)).toMatchObject({
      status: 'resolved',
      outcome: 'fallback_no_version',
    });
  });

  it('WR-01: another 4xx on the second request imports the top match with fallback_no_version', async () => {
    const spineId = await fallbackSpine();
    const r = await attempt(
      byCountry({ status: 422, body: '{"message":"no"}' }),
    );
    expect(countries(r.calls)).toEqual(['Canada', 'US']);
    expect(r.error).toBeNull();
    expect(importedReleases(spineId)).toEqual([5001]);
    expect(item(r.itemId)).toMatchObject({
      status: 'resolved',
      outcome: 'fallback_no_version',
      error_kind: null,
      error: null,
    });
  });

  it('WR-01: a wrong-shaped second body imports the top match with fallback_no_version', async () => {
    const spineId = await fallbackSpine();
    const r = await attempt(byCountry({ status: 200, body: { nope: 1 } }));
    expect(countries(r.calls)).toEqual(['Canada', 'US']);
    expect(r.error).toBeNull();
    expect(importedReleases(spineId)).toEqual([5001]);
    expect(item(r.itemId)).toMatchObject({
      status: 'resolved',
      outcome: 'fallback_no_version',
    });
  });

  it('WR-01: a 5xx on the second request on the last attempt imports the top match', async () => {
    const spineId = await fallbackSpine();
    const r = await attempt(byCountry({ status: 502, body: '' }), {
      lastAttempt: true,
    });
    expect(countries(r.calls)).toEqual(['Canada', 'US']);
    expect(r.error).toBeNull();
    expect(importedReleases(spineId)).toEqual([5001]);
    expect(item(r.itemId)).toMatchObject({
      status: 'resolved',
      outcome: 'fallback_no_version',
      error_kind: null,
      error: null,
    });
  });

  it('WR-01: a 5xx on the first request on the last attempt is still rethrown', async () => {
    const spineId = await fallbackSpine();
    const r = await attempt(() => ({ status: 502, body: '' }), {
      lastAttempt: true,
    });
    expect(countries(r.calls)).toEqual(['Canada']);
    expect(r.error?.name).toBe('DiscogsUnavailableError');
    expect(item(r.itemId)).toMatchObject({
      status: 'queued',
      error_kind: 'unavailable',
    });
    expect(importsOf(spineId)).toHaveLength(0);
  });

  it('a 5xx on the second request before the last attempt is recorded as unavailable and rethrown', async () => {
    const spineId = await fallbackSpine();
    const r = await attempt(byCountry({ status: 502, body: '' }));
    expect(countries(r.calls)).toEqual(['Canada', 'US']);
    expect(r.error?.name).toBe('DiscogsUnavailableError');
    expect(item(r.itemId)).toMatchObject({
      status: 'queued',
      error_kind: 'unavailable',
    });
    expect(importsOf(spineId)).toHaveLength(0);
  });

  it('a job that stops being current before the second request writes nothing', async () => {
    await fallbackSpine();
    const before = tables();
    let current = true;
    const r = await attempt(byCountry({ status: 200, body: US_VERSIONS }), {
      current: () => current,
      afterAnswer: () => {
        current = false;
      },
    });
    expect(countries(r.calls)).toEqual(['Canada']);
    expect(tables()).toBe(before);
  });

  it('a gate paused between the two requests defers without the second request', async () => {
    const spineId = await fallbackSpine();
    const job = claim();
    const fake = fakeDiscogsDeps((url) => {
      if (url.searchParams.get('country') === 'US') {
        return { status: 200, body: US_VERSIONS };
      }
      fake.deps.gate?.pause(5000);
      return { status: 200, body: NO_CANADIAN };
    });
    const err = await runResolvePressing(payloadOf(job), jobCtx(job), {
      fetch: fake.deps,
    }).then(
      () => null,
      (e: unknown) => e as { name?: string },
    );
    expect(err?.name).toBe('JobDeferredError');
    expect(countries(fake.calls)).toEqual(['Canada']);
    expect(item(payloadOf(job).itemId).status).toBe('queued');
    expect(importsOf(spineId)).toHaveLength(0);
  });
});
