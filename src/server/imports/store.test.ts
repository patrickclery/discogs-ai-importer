import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  bulkShelf,
  connectDiscogs,
  jobCtx,
  seedTopCandidate,
  useBulkSecrets,
} from '../../../test/helpers/bulk-seed';
import { orphanScenario } from '../../../test/helpers/scan-runs';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';
import {
  type BulkItemDbRow,
  failBulkItem,
  getBulkItem,
  RESOLVE_PRESSING_JOB_TYPE,
  startBulkRun,
} from '../bulk/store';
import { getDb } from '../db/client';
import { getCollectionFolderId } from '../discogs/folders';
import { createSearch, finishSearch } from '../discogs/store';
import { newId } from '../ids';
import { runResolvePressing } from '../jobs/handlers/resolve-pressing';
import { cancelQueuedJob, claimNext } from '../jobs/queue';
import { SECRET_ENV_NAMES, saveSecrets } from '../secrets';
import {
  ADD_TO_COLLECTION_JOB_TYPE,
  addAnotherCopy,
  CHECK_IMPORT_JOB_TYPE,
  cancelImport,
  createImport,
  enqueueImport,
  linkExisting,
  retrySpine,
} from './store';

// The import store's owner-facing rules (D-02, D-07, D-13, IMP-01):
// Change match (cancelImport, cancelQueuedJob), Retry (retryImport,
// retrySpine), the retry_first refusal, the createImport and enqueueImport
// base rules, and the one-enqueue-site scan.

function useTempSecrets(): void {
  let dir = '';
  const names = ['SECRETS_FILE', ...Object.values(SECRET_ENV_NAMES)];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const n of names) {
      saved[n] = process.env[n];
      delete process.env[n];
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-import-store-'));
    process.env.SECRETS_FILE = path.join(dir, 'secrets.json');
    saveSecrets({
      discogsConsumerKey: 'CANARYDISCOGSKEY-0123456789wxyz',
      discogsConsumerSecret: 'CANARYDISCOGSSECRET-0123456789abcd',
    });
  });
  afterEach(() => {
    for (const n of names) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

function db() {
  return getDb().$client;
}

/** Fake-clock start of a bulk run (after any real Date.now()). */
const BULK_START = 1_800_000_000_000;

/** One stored candidate of the spine for releaseId; returns its id. */
function seedCandidate(spineId: string, releaseId = 1031): string {
  const existing = db()
    .prepare(
      `SELECT id FROM discogs_candidates
       WHERE spine_id = ? AND source = 'manual' AND release_id = ?`,
    )
    .get(spineId, releaseId) as { id: string } | undefined;
  if (existing) return existing.id;
  const searchId = createSearch(db(), {
    spineId,
    kind: 'manual',
    inputs: { artist: null, title: null, catno: null, rawText: 'x' },
    inputHash: null,
  });
  const id = newId();
  db()
    .prepare(
      `INSERT INTO discogs_candidates (id, spine_id, search_id, source,
         release_id, rank, title, labels_json, formats_json, thumb_url,
         catno_match, created_at)
       VALUES (@id, @spineId, @searchId, 'manual', @releaseId, 0, @title,
         '["Label A"]', '[{"name":"CD","qty":"1","descriptions":["Album"]}]',
         NULL, 0, @now)`,
    )
    .run({
      id,
      spineId,
      searchId,
      releaseId,
      title: `Artist - Title ${releaseId}`,
      now: Date.now(),
    });
  return id;
}

/** A confirmed import of a fresh candidate; its job is queued. */
function confirm(
  spineId: string,
  releaseId = 1031,
): { importId: string; jobId: string } {
  const res = createImport(db(), {
    spineId,
    candidateId: seedCandidate(spineId, releaseId),
  });
  if (res.status !== 'ok') throw new Error(`confirm: ${res.status}`);
  return { importId: res.importId, jobId: res.jobId };
}

type ImportRowLite = {
  id: string;
  status: string;
  intent_at: number | null;
  error_kind: string | null;
  error: string | null;
  snapshot_json: string | null;
  allow_duplicate: number;
  existing_json: string | null;
  job_id: string | null;
  release_id: number;
  folder_id: number;
};

function importRow(id: string): ImportRowLite | undefined {
  return db().prepare('SELECT * FROM imports WHERE id = ?').get(id) as
    | ImportRowLite
    | undefined;
}

function setImport(id: string, set: Record<string, unknown>): void {
  const cols = Object.keys(set)
    .map((k) => `${k} = @${k}`)
    .join(', ');
  db()
    .prepare(`UPDATE imports SET ${cols} WHERE id = @id`)
    .run({ ...set, id });
}

type JobLite = {
  id: string;
  status: string;
  dedupe_key: string | null;
  finished_at: number | null;
  locked_at: number | null;
  type: string;
};

function job(id: string): JobLite {
  return db().prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobLite;
}

function setJob(id: string, status: string): void {
  db()
    .prepare('UPDATE jobs SET status = @status WHERE id = @id')
    .run({ status, id });
}

function count(
  table: 'imports' | 'jobs' | 'discogs_searches',
  where = '1 = 1',
): number {
  return (
    db().prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get() as {
      n: number;
    }
  ).n;
}

/** Every imports and jobs row, to prove a refusal changed nothing. */
function snapshot(): string {
  return JSON.stringify([
    db().prepare('SELECT * FROM imports ORDER BY id').all(),
    db().prepare('SELECT * FROM jobs ORDER BY id').all(),
  ]);
}

describe('cancelQueuedJob', () => {
  useTempDataDir();
  useTempSecrets();

  it('cancels a queued job, sets finished_at and frees its dedupe key', async () => {
    const { spineIds } = await orphanScenario();
    const { jobId } = confirm(spineIds[0]);
    expect(cancelQueuedJob(jobId, 5_000)).toBe(true);
    expect(job(jobId)).toMatchObject({
      status: 'cancelled',
      finished_at: 5_000,
      locked_at: null,
      dedupe_key: null,
    });
  });

  it.each(['running', 'succeeded', 'failed', 'cancelled'])(
    'leaves a %s job untouched and returns false',
    async (status) => {
      const { spineIds } = await orphanScenario();
      const { jobId } = confirm(spineIds[0]);
      setJob(jobId, status);
      const before = job(jobId);
      expect(cancelQueuedJob(jobId)).toBe(false);
      expect(job(jobId)).toEqual(before);
    },
  );
});

describe('cancelImport (Change match, D-02)', () => {
  useTempDataDir();
  useTempSecrets();

  it('a waiting import whose job is still queued is deleted and its job cancelled', async () => {
    const { spineIds } = await orphanScenario();
    const { importId, jobId } = confirm(spineIds[0]);
    expect(cancelImport(db(), spineIds[0]).status).toBe('ok');
    expect(importRow(importId)).toBeUndefined();
    expect(job(jobId)).toMatchObject({ status: 'cancelled', dedupe_key: null });
  });

  it('frees the spine: a new confirm of the same release makes a new import and job', async () => {
    const { spineIds } = await orphanScenario();
    const first = confirm(spineIds[0]);
    expect(cancelImport(db(), spineIds[0]).status).toBe('ok');
    const second = confirm(spineIds[0]);
    expect(second.importId).not.toBe(first.importId);
    expect(second.jobId).not.toBe(first.jobId);
    expect(job(second.jobId)).toMatchObject({
      status: 'queued',
      dedupe_key: `import:${spineIds[0]}:1031`,
    });
  });

  it('an already_in_collection import with no intent is deleted', async () => {
    const { spineIds } = await orphanScenario();
    const { importId, jobId } = confirm(spineIds[0]);
    setJob(jobId, 'succeeded');
    setImport(importId, {
      status: 'already_in_collection',
      existing_json: '[]',
    });
    expect(cancelImport(db(), spineIds[0])).toEqual({ status: 'ok' });
    expect(importRow(importId)).toBeUndefined();
  });

  it.each([
    ['no intent', null, 'unavailable'],
    ['an intent refused with not_found', 1_000, 'not_found'],
    ['an intent refused with rejected', 1_000, 'rejected'],
  ])('a failed import with %s is deleted', async (_label, intentAt, kind) => {
    const { spineIds } = await orphanScenario();
    const { importId, jobId } = confirm(spineIds[0]);
    setJob(jobId, 'succeeded');
    setImport(importId, {
      status: 'failed',
      intent_at: intentAt,
      error_kind: kind,
    });
    expect(cancelImport(db(), spineIds[0])).toEqual({ status: 'ok' });
    expect(importRow(importId)).toBeUndefined();
  });

  it('a pending import whose job is running answers started and changes nothing', async () => {
    const { spineIds } = await orphanScenario();
    const { jobId } = confirm(spineIds[0]);
    setJob(jobId, 'running');
    const before = snapshot();
    expect(cancelImport(db(), spineIds[0])).toEqual({ status: 'started' });
    expect(snapshot()).toBe(before);
  });

  it.each(['pending', 'importing'])(
    'a %s import with an intent answers started and changes nothing',
    async (status) => {
      const { spineIds } = await orphanScenario();
      const { importId } = confirm(spineIds[0]);
      setImport(importId, { status, intent_at: 1_000 });
      const before = snapshot();
      expect(cancelImport(db(), spineIds[0])).toEqual({ status: 'started' });
      expect(snapshot()).toBe(before);
    },
  );

  it.each(['unavailable', 'interrupted', 'auth', 'other', 'removed'])(
    'a failed import with an intent and %s answers checking: a check_import job, never an add (CR-01)',
    async (kind) => {
      const { spineIds } = await orphanScenario();
      const { importId, jobId } = confirm(spineIds[0]);
      setJob(jobId, 'failed');
      setImport(importId, {
        status: 'failed',
        intent_at: 1_000,
        error_kind: kind,
        snapshot_json: '[5]',
      });
      const res = cancelImport(db(), spineIds[0]);
      expect(res.status).toBe('checking');
      if (res.status !== 'checking') return;
      expect(job(res.jobId)).toMatchObject({
        status: 'queued',
        dedupe_key: `import-check:${importId}`,
      });
      expect(
        db().prepare('SELECT type FROM jobs WHERE id = ?').get(res.jobId),
      ).toEqual({ type: CHECK_IMPORT_JOB_TYPE });
      expect(
        count('jobs', `type = 'add_to_collection' AND status = 'queued'`),
      ).toBe(0);
      // The intent and snapshot stay: the check adopts a copy that landed.
      expect(importRow(importId)).toMatchObject({
        status: 'pending',
        intent_at: 1_000,
        snapshot_json: '[5]',
        error_kind: null,
        error: null,
        job_id: res.jobId,
      });
      // A second click while the check is queued reuses it.
      expect(cancelImport(db(), spineIds[0])).toEqual({ status: 'started' });
      expect(count('jobs', `type = 'check_import'`)).toBe(1);
    },
  );

  it('an imported import answers started and changes nothing', async () => {
    const { spineIds } = await orphanScenario();
    const { importId, jobId } = confirm(spineIds[0]);
    setJob(jobId, 'succeeded');
    setImport(importId, {
      status: 'imported',
      intent_at: 1_000,
      instance_id: 9001,
    });
    const before = snapshot();
    expect(cancelImport(db(), spineIds[0])).toEqual({ status: 'started' });
    expect(snapshot()).toBe(before);
  });

  it('answers not_found for a spine with no import and for an unknown spine', async () => {
    const { spineIds } = await orphanScenario();
    expect(cancelImport(db(), spineIds[0])).toEqual({ status: 'not_found' });
    expect(cancelImport(db(), 'no-such-spine')).toEqual({
      status: 'not_found',
    });
    expect(count('imports')).toBe(0);
  });

  it('only the latest import counts: an older failed one is kept', async () => {
    const { spineIds } = await orphanScenario();
    const old = confirm(spineIds[0]);
    setJob(old.jobId, 'succeeded');
    setImport(old.importId, { status: 'failed', error_kind: 'unavailable' });
    const latest = confirm(spineIds[0], 2042);
    expect(cancelImport(db(), spineIds[0])).toEqual({ status: 'ok' });
    expect(importRow(latest.importId)).toBeUndefined();
    expect(importRow(old.importId)?.status).toBe('failed');
  });
});

/** An auto search of the spine that ended failed (Retry search, D-06). */
function failedSearch(spineId: string): string {
  const searchId = createSearch(db(), {
    spineId,
    kind: 'auto',
    inputs: { artist: 'A', title: 'T', catno: null, rawText: null },
    inputHash: `h-${newId()}`,
  });
  finishSearch(db(), searchId, { status: 'failed', error: 'HTTP 500' });
  return searchId;
}

function againSearches(spineId: string): number {
  return count(
    'discogs_searches',
    `spine_id = '${spineId}' AND kind = 'again'`,
  );
}

/** A confirmed import that ended failed after its job finished. */
function failedImport(
  spineId: string,
  opts: { intentAt?: number | null; kind?: string; releaseId?: number } = {},
): { importId: string; jobId: string } {
  const made = confirm(spineId, opts.releaseId);
  setJob(made.jobId, 'failed');
  setImport(made.importId, {
    status: 'failed',
    intent_at: opts.intentAt ?? null,
    error_kind: opts.kind ?? 'unavailable',
    error: 'Discogs answered 502',
  });
  return made;
}

describe('createImport base rules (IMP-01, moved from Plan 04-01)', () => {
  useTempDataDir();
  useTempSecrets();

  it('reads the release id and snapshot from the candidate row', async () => {
    const { spineIds } = await orphanScenario();
    const { importId } = confirm(spineIds[0], 2042);
    const row = importRow(importId);
    expect(row?.release_id).toBe(2042);
    expect(row?.status).toBe('pending');
    const snap = db()
      .prepare('SELECT candidate_json FROM imports WHERE id = ?')
      .get(importId) as { candidate_json: string };
    expect(JSON.parse(snap.candidate_json)).toMatchObject({
      title: 'Artist - Title 2042',
      labels: ['Label A'],
      formats: [{ name: 'CD', qty: '1', descriptions: ['Album'] }],
    });
  });

  it("an unknown candidate or another spine's candidate gives no_candidate and writes nothing", async () => {
    const { spineIds } = await orphanScenario();
    const other = seedCandidate(spineIds[1]);
    for (const candidateId of ['no-such-candidate', other]) {
      expect(createImport(db(), { spineId: spineIds[0], candidateId })).toEqual(
        { status: 'no_candidate' },
      );
    }
    expect(count('imports')).toBe(0);
    expect(count('jobs', `type = 'add_to_collection'`)).toBe(0);
  });

  it('a superseded spine gives not_importable; an unknown spine not_found', async () => {
    const { supersededId } = await orphanScenario();
    const candidateId = seedCandidate(supersededId);
    expect(createImport(db(), { spineId: supersededId, candidateId })).toEqual({
      status: 'not_importable',
    });
    expect(
      createImport(db(), { spineId: 'no-such-spine', candidateId }),
    ).toEqual({ status: 'not_found' });
    expect(count('imports')).toBe(0);
  });

  it('a spine marked not on Discogs gives not_on_discogs', async () => {
    const { spineIds } = await orphanScenario();
    const candidateId = seedCandidate(spineIds[0]);
    db()
      .prepare('UPDATE spines SET not_on_discogs = 1 WHERE id = ?')
      .run(spineIds[0]);
    expect(createImport(db(), { spineId: spineIds[0], candidateId })).toEqual({
      status: 'not_on_discogs',
    });
    expect(count('imports')).toBe(0);
  });

  it('a second confirm on the same spine gives already_confirmed with one row and one job', async () => {
    const { spineIds } = await orphanScenario();
    confirm(spineIds[0]);
    expect(
      createImport(db(), {
        spineId: spineIds[0],
        candidateId: seedCandidate(spineIds[0], 2042),
      }),
    ).toEqual({ status: 'already_confirmed' });
    expect(count('imports')).toBe(1);
    expect(count('jobs', `type = 'add_to_collection'`)).toBe(1);
  });

  it('records the collection folder setting (1 with no setting)', async () => {
    const { spineIds } = await orphanScenario();
    const { importId } = confirm(spineIds[0]);
    expect(getCollectionFolderId()).toBe(1);
    expect(importRow(importId)?.folder_id).toBe(getCollectionFolderId());
  });
});

describe('enqueueImport (Pitfall 3, moved from Plan 04-01)', () => {
  useTempDataDir();
  useTempSecrets();

  it('returns the same job while it is queued', async () => {
    const { spineIds } = await orphanScenario();
    const { importId, jobId } = confirm(spineIds[0]);
    expect(enqueueImport(db(), importId)).toEqual({
      id: jobId,
      created: false,
    });
    expect(count('jobs', `type = 'add_to_collection'`)).toBe(1);
  });

  it('after the first job finished, frees its key and creates a new job', async () => {
    const { spineIds } = await orphanScenario();
    const { importId, jobId } = confirm(spineIds[0]);
    setJob(jobId, 'failed');
    const next = enqueueImport(db(), importId);
    expect(next.created).toBe(true);
    expect(next.id).not.toBe(jobId);
    expect(job(jobId).dedupe_key).toBeNull();
    expect(job(next.id)).toMatchObject({
      status: 'queued',
      dedupe_key: `import:${spineIds[0]}:1031`,
    });
    expect(importRow(importId)?.job_id).toBe(next.id);
  });
});

/** The spine's photo name, #n and crop URL as the duplicate answer gives them. */
function shownAs(spineId: string): {
  photo: string;
  spineNumber: number;
  cropUrl: string | null;
} {
  const r = db()
    .prepare(
      `SELECT p.original_name AS photo, d.idx, d.crop_path FROM spines s
       JOIN photos p ON p.id = s.photo_id
       JOIN spine_detections d ON d.id = s.current_detection_id
       WHERE s.id = ?`,
    )
    .get(spineId) as { photo: string; idx: number; crop_path: string | null };
  return {
    photo: r.photo,
    spineNumber: r.idx + 1,
    cropUrl: r.crop_path ? `/api/files/${r.crop_path}` : null,
  };
}

describe('createImport local duplicate (D-04, IMP-03)', () => {
  useTempDataDir();
  useTempSecrets();

  it.each([
    ['pending', false],
    ['importing', false],
    ['imported', true],
    ['already_in_collection', false],
  ] as const)(
    'another listed spine holding the release %s gives duplicate with its photo, #n, crop and done %s',
    async (status, done) => {
      const { spineIds } = await orphanScenario();
      const other = confirm(spineIds[1]);
      setImport(other.importId, { status });
      db()
        .prepare(
          `UPDATE spine_detections SET crop_path = 'crops/other.jpg'
           WHERE id = (SELECT current_detection_id FROM spines WHERE id = ?)`,
        )
        .run(spineIds[1]);
      const candidateId = seedCandidate(spineIds[0]);
      const before = snapshot();
      const res = createImport(db(), { spineId: spineIds[0], candidateId });
      const shown = shownAs(spineIds[1]);
      expect(shown.photo).toBe('shelf.jpg');
      expect(shown.cropUrl).toBe('/api/files/crops/other.jpg');
      expect(res).toEqual({
        status: 'duplicate',
        spineId: spineIds[1],
        ...shown,
        done,
      });
      expect(snapshot()).toBe(before);
    },
  );

  it('an orphaned spine still listed counts as the other spine', async () => {
    const { spineIds, orphanId } = await orphanScenario();
    confirm(orphanId);
    const res = createImport(db(), {
      spineId: spineIds[0],
      candidateId: seedCandidate(spineIds[0]),
    });
    expect(res.status).toBe('duplicate');
  });

  it('the oldest holder is the one named', async () => {
    const { spineIds } = await orphanScenario();
    const first = confirm(spineIds[2]);
    setImport(first.importId, { created_at: 1_000 });
    const second = createImport(db(), {
      spineId: spineIds[1],
      candidateId: seedCandidate(spineIds[1]),
      allowDuplicate: true,
    });
    if (second.status !== 'ok') throw new Error(second.status);
    setImport(second.importId, { created_at: 2_000 });
    const res = createImport(db(), {
      spineId: spineIds[0],
      candidateId: seedCandidate(spineIds[0]),
    });
    expect(res).toMatchObject({
      status: 'duplicate',
      spineNumber: shownAs(spineIds[2]).spineNumber,
    });
  });

  it('allowDuplicate creates the import and leaves allow_duplicate 0', async () => {
    const { spineIds } = await orphanScenario();
    confirm(spineIds[1]);
    const res = createImport(db(), {
      spineId: spineIds[0],
      candidateId: seedCandidate(spineIds[0]),
      allowDuplicate: true,
    });
    expect(res.status).toBe('ok');
    if (res.status !== 'ok') return;
    expect(importRow(res.importId)).toMatchObject({
      status: 'pending',
      release_id: 1031,
      allow_duplicate: 0,
    });
    expect(count('jobs', `type = 'add_to_collection'`)).toBe(2);
  });

  it('allowDuplicate false still answers duplicate', async () => {
    const { spineIds } = await orphanScenario();
    confirm(spineIds[1]);
    const res = createImport(db(), {
      spineId: spineIds[0],
      candidateId: seedCandidate(spineIds[0]),
      allowDuplicate: false,
    });
    expect(res.status).toBe('duplicate');
  });

  it('another release on another spine is no duplicate', async () => {
    const { spineIds } = await orphanScenario();
    confirm(spineIds[1], 2042);
    const res = createImport(db(), {
      spineId: spineIds[0],
      candidateId: seedCandidate(spineIds[0]),
    });
    expect(res.status).toBe('ok');
  });

  it.each(['superseded', 'dismissed'])(
    'the other spine %s gives no duplicate',
    async (state) => {
      const { spineIds } = await orphanScenario();
      confirm(spineIds[1]);
      db()
        .prepare('UPDATE spines SET state = ? WHERE id = ?')
        .run(state, spineIds[1]);
      const res = createImport(db(), {
        spineId: spineIds[0],
        candidateId: seedCandidate(spineIds[0]),
      });
      expect(res.status).toBe('ok');
    },
  );

  it("the other spine's failed import gives no duplicate", async () => {
    const { spineIds } = await orphanScenario();
    failedImport(spineIds[1]);
    const res = createImport(db(), {
      spineId: spineIds[0],
      candidateId: seedCandidate(spineIds[0]),
    });
    expect(res.status).toBe('ok');
  });
});

describe('createImport retry_first (D-07)', () => {
  useTempDataDir();
  useTempSecrets();

  it.each(['unavailable', 'interrupted', 'auth', 'other'])(
    'refuses a new confirm over a failed import with an intent and %s',
    async (kind) => {
      const { spineIds } = await orphanScenario();
      failedImport(spineIds[0], { intentAt: 1_000, kind });
      const candidateId = seedCandidate(spineIds[0], 2042);
      const before = snapshot();
      expect(
        createImport(db(), { spineId: spineIds[0], candidateId }).status,
      ).toBe('retry_first');
      expect(snapshot()).toBe(before);
    },
  );

  it.each([
    ['no intent', null, 'unavailable'],
    ['an intent refused with not_found', 1_000, 'not_found'],
    ['an intent refused with rejected', 1_000, 'rejected'],
  ])(
    'allows a new import over a failed one with %s',
    async (_label, intentAt, kind) => {
      const { spineIds } = await orphanScenario();
      const old = failedImport(spineIds[0], { intentAt, kind });
      const res = createImport(db(), {
        spineId: spineIds[0],
        candidateId: seedCandidate(spineIds[0], 2042),
      });
      expect(res.status).toBe('ok');
      expect(count('imports')).toBe(2);
      expect(importRow(old.importId)?.status).toBe('failed');
    },
  );
});

describe('retrySpine (REV-04, D-13)', () => {
  useTempDataDir();
  useTempSecrets();

  it('a failed import goes back to pending on the same row, keeping its intent', async () => {
    const { spineIds } = await orphanScenario();
    const { importId, jobId } = failedImport(spineIds[0], {
      intentAt: 1_000,
      kind: 'unavailable',
    });
    setImport(importId, {
      snapshot_json: '[9001,9002]',
      allow_duplicate: 1,
      existing_json: '[]',
    });
    const res = retrySpine(db(), spineIds[0]);
    expect(res.status === 'ok' && res.kind).toBe('import');
    if (res.status !== 'ok' || res.kind !== 'import') return;
    expect(res.importId).toBe(importId);
    expect(res.jobId).not.toBe(jobId);
    expect(importRow(importId)).toMatchObject({
      status: 'pending',
      error: null,
      error_kind: null,
      intent_at: 1_000,
      snapshot_json: '[9001,9002]',
      allow_duplicate: 1,
      existing_json: '[]',
      job_id: res.jobId,
    });
    expect(job(jobId).dedupe_key).toBeNull();
    expect(job(res.jobId)).toMatchObject({
      status: 'queued',
      type: ADD_TO_COLLECTION_JOB_TYPE,
      dedupe_key: `import:${spineIds[0]}:1031`,
    });
    expect(count('imports')).toBe(1);
  });

  it('a spine marked not on Discogs with a failed import has nothing to retry and enqueues nothing (WR-02)', async () => {
    const { spineIds } = await orphanScenario();
    const { importId } = failedImport(spineIds[0], {
      intentAt: null,
      kind: 'unavailable',
    });
    db()
      .prepare('UPDATE spines SET not_on_discogs = 1 WHERE id = ?')
      .run(spineIds[0]);
    const before = snapshot();
    expect(retrySpine(db(), spineIds[0])).toEqual({
      status: 'nothing_to_retry',
    });
    expect(snapshot()).toBe(before);
    expect(importRow(importId)?.status).toBe('failed');
  });

  it('a pending import whose job failed reads failed and is retried', async () => {
    const { spineIds } = await orphanScenario();
    const { importId, jobId } = confirm(spineIds[0]);
    setJob(jobId, 'failed');
    const res = retrySpine(db(), spineIds[0]);
    expect(res.status === 'ok' && res.kind).toBe('import');
    expect(importRow(importId)?.status).toBe('pending');
    expect(job(importRow(importId)?.job_id ?? '').status).toBe('queued');
  });

  it('retries the import only when both the import and the search failed', async () => {
    const { spineIds } = await orphanScenario();
    failedImport(spineIds[0]);
    failedSearch(spineIds[0]);
    const res = retrySpine(db(), spineIds[0]);
    expect(res.status === 'ok' && res.kind).toBe('import');
    expect(againSearches(spineIds[0])).toBe(0);
  });

  it('re-runs a failed search with the current fields when no import failed', async () => {
    const { spineIds } = await orphanScenario();
    failedSearch(spineIds[0]);
    const res = retrySpine(db(), spineIds[0]);
    expect(res.status === 'ok' && res.kind).toBe('search');
    if (res.status !== 'ok' || res.kind !== 'search') return;
    const row = db()
      .prepare(
        `SELECT s.kind, s.status, j.type, j.status AS job_status
         FROM discogs_searches s JOIN jobs j ON j.id = s.job_id
         WHERE s.id = ?`,
      )
      .get(res.searchId);
    expect(row).toEqual({
      kind: 'again',
      status: 'queued',
      type: 'search_spine',
      job_status: 'queued',
    });
    expect(count('imports')).toBe(0);
  });

  it('nothing failed: nothing_to_retry and nothing is enqueued', async () => {
    const { spineIds } = await orphanScenario();
    const before = snapshot();
    expect(retrySpine(db(), spineIds[0])).toEqual({
      status: 'nothing_to_retry',
    });
    expect(snapshot()).toBe(before);
    const imported = confirm(spineIds[1]);
    setJob(imported.jobId, 'succeeded');
    setImport(imported.importId, { status: 'imported', instance_id: 9001 });
    failedSearch(spineIds[1]);
    const mid = snapshot();
    expect(retrySpine(db(), spineIds[1])).toEqual({
      status: 'nothing_to_retry',
    });
    expect(snapshot()).toBe(mid);
    expect(againSearches(spineIds[1])).toBe(0);
  });

  it('a second retry while the job is queued returns the same job', async () => {
    const { spineIds } = await orphanScenario();
    failedImport(spineIds[0]);
    const first = retrySpine(db(), spineIds[0]);
    const jobs = count('jobs');
    const second = retrySpine(db(), spineIds[0]);
    expect(second).toEqual(first);
    expect(count('jobs')).toBe(jobs);
  });

  it('busy while the import job is running, and nothing changes', async () => {
    const { spineIds } = await orphanScenario();
    const { jobId } = confirm(spineIds[0]);
    setJob(jobId, 'running');
    const before = snapshot();
    expect(retrySpine(db(), spineIds[0])).toEqual({ status: 'busy' });
    expect(snapshot()).toBe(before);
  });

  it('not_found for an unknown spine', () => {
    expect(retrySpine(db(), 'no-such-spine')).toEqual({
      status: 'not_found',
    });
  });
});

describe('retrySpine on a bulk lookup (BULK-11)', () => {
  useTempDataDir();
  useBulkSecrets();

  /** One spine picked into a run; returns its item id and spine id. */
  async function lookup(
    over: { country?: string; now?: number } = {},
  ): Promise<{ itemId: string; spineId: string }> {
    const { spineIds } = await bulkShelf();
    connectDiscogs();
    const top = seedTopCandidate(spineIds[0], {
      country: over.country ?? 'US',
    });
    const res = startBulkRun(db(), {
      items: [{ spineId: spineIds[0], candidateId: top.candidateId }],
      country: 'Canada',
      folderId: 1,
      now: over.now ?? BULK_START,
    });
    if (res.status !== 'ok') throw new Error(`start: ${res.status}`);
    const row = db()
      .prepare('SELECT id FROM bulk_items WHERE run_id = ?')
      .get(res.runId) as { id: string };
    return { itemId: row.id, spineId: spineIds[0] };
  }

  function bulkItem(id: string): BulkItemDbRow {
    const row = getBulkItem(db(), id);
    if (!row) throw new Error(`no bulk item ${id}`);
    return row;
  }

  /** The lookup ended failed: its job failed and the item says why. */
  function failLookup(itemId: string): string {
    const jobId = bulkItem(itemId).job_id ?? '';
    setJob(jobId, 'failed');
    failBulkItem(db(), itemId, {
      errorKind: 'unavailable',
      error: 'Discogs answered 502',
    });
    return jobId;
  }

  function queuedLookups(): number {
    return count(
      'jobs',
      `type = '${RESOLVE_PRESSING_JOB_TYPE}' AND status = 'queued'`,
    );
  }

  it('a failed lookup is queued again on the same item under a new job', async () => {
    const { itemId, spineId } = await lookup();
    const oldJob = failLookup(itemId);
    const res = retrySpine(db(), spineId);
    expect(res).toMatchObject({ status: 'ok', kind: 'lookup', itemId });
    const jobId = (res as { jobId?: string }).jobId ?? '';
    expect(jobId).not.toBe(oldJob);
    expect(bulkItem(itemId)).toMatchObject({
      status: 'queued',
      error_kind: null,
      error: null,
      job_id: jobId,
    });
    expect(job(jobId)).toMatchObject({
      status: 'queued',
      type: RESOLVE_PRESSING_JOB_TYPE,
      dedupe_key: `pressing:${itemId}`,
    });
    expect(job(oldJob).dedupe_key).toBeNull();
    expect(count('imports')).toBe(0);
  });

  it('a queued item whose job failed (an interrupted read) is requeued the same way', async () => {
    const { itemId, spineId } = await lookup();
    const oldJob = bulkItem(itemId).job_id ?? '';
    setJob(oldJob, 'failed');
    const res = retrySpine(db(), spineId);
    expect(res).toMatchObject({ status: 'ok', kind: 'lookup', itemId });
    expect(bulkItem(itemId).job_id).not.toBe(oldJob);
    expect(job(bulkItem(itemId).job_id ?? '').status).toBe('queued');
  });

  it('busy while the lookup job is queued or running, and nothing changes', async () => {
    const { itemId, spineId } = await lookup();
    const before = snapshot();
    expect(retrySpine(db(), spineId)).toEqual({ status: 'busy' });
    setJob(bulkItem(itemId).job_id ?? '', 'running');
    const running = snapshot();
    expect(retrySpine(db(), spineId)).toEqual({ status: 'busy' });
    expect(snapshot()).toBe(running);
    expect(running).not.toBe(before);
  });

  it('two retries in a row on a failed lookup make exactly one queued job', async () => {
    const { itemId, spineId } = await lookup();
    failLookup(itemId);
    const first = retrySpine(db(), spineId);
    expect(first.status === 'ok' ? first.kind : first.status).toBe('lookup');
    expect(retrySpine(db(), spineId).status).toBe('busy');
    expect(queuedLookups()).toBe(1);
  });

  it('an item a newer import replaced is ignored and the import rules apply', async () => {
    const { itemId, spineId } = await lookup({ now: 1_000 });
    failLookup(itemId);
    const { importId } = failedImport(spineId);
    const res = retrySpine(db(), spineId);
    expect(res).toMatchObject({ status: 'ok', kind: 'import', importId });
    expect(bulkItem(itemId).status).toBe('failed');
    expect(queuedLookups()).toBe(0);
  });

  it('after the retry, the job resolves the item and creates the import', async () => {
    const { itemId, spineId } = await lookup({ country: 'Canada' });
    failLookup(itemId);
    const res = retrySpine(db(), spineId);
    expect(res).toMatchObject({ kind: 'lookup' });
    const claimed = claimNext('discogs', BULK_START + 60_000);
    expect(claimed?.type).toBe(RESOLVE_PRESSING_JOB_TYPE);
    if (!claimed) return;
    await runResolvePressing(JSON.parse(claimed.payload), jobCtx(claimed));
    expect(bulkItem(itemId)).toMatchObject({
      status: 'resolved',
      outcome: 'preferred',
    });
    const imports = db()
      .prepare('SELECT id, status FROM imports WHERE spine_id = ?')
      .all(spineId) as { id: string; status: string }[];
    expect(imports).toHaveLength(1);
    expect(bulkItem(itemId).import_id).toBe(imports[0]?.id);
  });
});

/**
 * A confirmed import held already_in_collection by its finished job (D-05),
 * with the copies Discogs listed, ascending by instance id.
 */
function heldImport(
  spineId: string,
  existing: { instanceId: number; folderId: number }[],
  releaseId = 1031,
): { importId: string; jobId: string } {
  const made = confirm(spineId, releaseId);
  setJob(made.jobId, 'succeeded');
  setImport(made.importId, {
    status: 'already_in_collection',
    existing_json: JSON.stringify(
      existing.map((e) => ({ ...e, dateAdded: '2015-11-30T10:54:13-08:00' })),
    ),
  });
  return made;
}

/** Another spine's imported import recording that copy. */
function recordedCopy(spineId: string, instanceId: number): void {
  const made = confirm(spineId, 2042);
  setJob(made.jobId, 'succeeded');
  setImport(made.importId, { status: 'imported', instance_id: instanceId });
}

type LinkedRow = ImportRowLite & {
  instance_id: number | null;
  linked: number;
  imported_at: number | null;
};

describe('linkExisting (Link existing copy, D-05)', () => {
  useTempDataDir();
  useTempSecrets();

  it("links the first copy no import records, with that copy's folder", async () => {
    const { spineIds } = await orphanScenario();
    recordedCopy(spineIds[1], 7001);
    const { importId } = heldImport(spineIds[0], [
      { instanceId: 7001, folderId: 1 },
      { instanceId: 7002, folderId: 3 },
    ]);
    const jobs = count('jobs');
    const res = linkExisting(db(), spineIds[0]);
    expect(res).toEqual({ status: 'ok', importId, instanceId: 7002 });
    const row = importRow(importId) as LinkedRow;
    expect(row).toMatchObject({
      status: 'imported',
      instance_id: 7002,
      folder_id: 3,
      linked: 1,
      error: null,
      error_kind: null,
    });
    expect(row.imported_at).toBeGreaterThan(0);
    // No new job: linking writes nothing to Discogs.
    expect(count('jobs')).toBe(jobs);
  });

  it('with no copy recorded, links the lowest instance id', async () => {
    const { spineIds } = await orphanScenario();
    const { importId } = heldImport(spineIds[0], [
      { instanceId: 7001, folderId: 1 },
      { instanceId: 7002, folderId: 3 },
    ]);
    expect(linkExisting(db(), spineIds[0])).toEqual({
      status: 'ok',
      importId,
      instanceId: 7001,
    });
    expect(importRow(importId)?.folder_id).toBe(1);
  });

  it('every listed copy already recorded gives no_existing and changes nothing', async () => {
    const { spineIds } = await orphanScenario();
    recordedCopy(spineIds[1], 7001);
    heldImport(spineIds[0], [{ instanceId: 7001, folderId: 1 }]);
    const before = snapshot();
    expect(linkExisting(db(), spineIds[0]).status).toBe('no_existing');
    expect(snapshot()).toBe(before);
  });

  it('an empty or unreadable copy list gives no_existing', async () => {
    const { spineIds } = await orphanScenario();
    const { importId } = heldImport(spineIds[0], []);
    expect(linkExisting(db(), spineIds[0])).toEqual({ status: 'no_existing' });
    setImport(importId, { existing_json: 'not json' });
    expect(linkExisting(db(), spineIds[0])).toEqual({ status: 'no_existing' });
    setImport(importId, { existing_json: null });
    expect(linkExisting(db(), spineIds[0])).toEqual({ status: 'no_existing' });
  });

  it.each(['pending', 'importing', 'imported', 'failed'])(
    'a %s import gives not_held and changes nothing',
    async (status) => {
      const { spineIds } = await orphanScenario();
      const { importId } = heldImport(spineIds[0], [
        { instanceId: 7001, folderId: 1 },
      ]);
      setImport(importId, { status });
      const before = snapshot();
      expect(linkExisting(db(), spineIds[0])).toEqual({ status: 'not_held' });
      expect(snapshot()).toBe(before);
    },
  );

  it('no import, or an unknown spine, gives not_found', async () => {
    const { spineIds } = await orphanScenario();
    expect(linkExisting(db(), spineIds[0])).toEqual({ status: 'not_found' });
    expect(linkExisting(db(), 'no-such-spine')).toEqual({
      status: 'not_found',
    });
  });
});

describe('addAnotherCopy (Add another copy, D-05 remote)', () => {
  useTempDataDir();
  useTempSecrets();

  it('a held import goes back to pending with allow_duplicate 1 and one queued job', async () => {
    const { spineIds } = await orphanScenario();
    const { importId, jobId } = heldImport(spineIds[0], [
      { instanceId: 7001, folderId: 1 },
    ]);
    setImport(importId, { error: 'old', error_kind: 'other' });
    const res = addAnotherCopy(db(), spineIds[0]);
    expect(res.status === 'ok' && res.importId).toBe(importId);
    if (res.status !== 'ok') return;
    expect(res.jobId).not.toBe(jobId);
    expect(importRow(importId)).toMatchObject({
      status: 'pending',
      allow_duplicate: 1,
      error: null,
      error_kind: null,
      job_id: res.jobId,
    });
    expect(job(res.jobId)).toMatchObject({
      status: 'queued',
      type: ADD_TO_COLLECTION_JOB_TYPE,
      dedupe_key: `import:${spineIds[0]}:1031`,
    });
    expect(
      count('jobs', `type = 'add_to_collection' AND status = 'queued'`),
    ).toBe(1);
    expect(count('imports')).toBe(1);
  });

  it('the held copies join the snapshot, kept with any earlier one, so the add never holds or adopts them again (WR-04)', async () => {
    const { spineIds } = await orphanScenario();
    const { importId } = heldImport(spineIds[0], [
      { instanceId: 7003, folderId: 1 },
      { instanceId: 7001, folderId: 1 },
    ]);
    setImport(importId, { intent_at: 1_000, snapshot_json: '[6001]' });
    expect(addAnotherCopy(db(), spineIds[0]).status).toBe('ok');
    expect(importRow(importId)?.snapshot_json).toBe('[6001,7001,7003]');
  });

  it('a second call while the job is queued returns the same job', async () => {
    const { spineIds } = await orphanScenario();
    heldImport(spineIds[0], [{ instanceId: 7001, folderId: 1 }]);
    const first = addAnotherCopy(db(), spineIds[0]);
    const jobs = count('jobs');
    const second = addAnotherCopy(db(), spineIds[0]);
    expect(second).toEqual(first);
    expect(count('jobs')).toBe(jobs);
  });

  it('once its job is running, a second call gives not_held', async () => {
    const { spineIds } = await orphanScenario();
    heldImport(spineIds[0], [{ instanceId: 7001, folderId: 1 }]);
    const first = addAnotherCopy(db(), spineIds[0]);
    if (first.status !== 'ok') throw new Error(first.status);
    setJob(first.jobId, 'running');
    const before = snapshot();
    expect(addAnotherCopy(db(), spineIds[0])).toEqual({ status: 'not_held' });
    expect(snapshot()).toBe(before);
  });

  it.each(['pending', 'importing', 'imported', 'failed'])(
    'a %s import the owner did not hold gives not_held and changes nothing',
    async (status) => {
      const { spineIds } = await orphanScenario();
      const { importId } = confirm(spineIds[0]);
      setImport(importId, { status });
      const before = snapshot();
      expect(addAnotherCopy(db(), spineIds[0])).toEqual({ status: 'not_held' });
      expect(snapshot()).toBe(before);
    },
  );

  it('no import, or an unknown spine, gives not_found', async () => {
    const { spineIds } = await orphanScenario();
    expect(addAnotherCopy(db(), spineIds[0])).toEqual({ status: 'not_found' });
    expect(addAnotherCopy(db(), 'no-such-spine')).toEqual({
      status: 'not_found',
    });
  });
});

describe('one add_to_collection enqueue site (IMP-01 guard)', () => {
  // Every later plan must reach the add POST through createImport or
  // retryImport, which both go through enqueueImport. A second module that
  // enqueues the type (or inserts it into jobs) fails here. The handler
  // registry only names the type to run it, so it is skipped.
  const root = path.resolve(__dirname, '../..');
  const registry = path.join(root, 'server/jobs/handlers/index.ts');
  const SITE =
    /type:\s*(ADD_TO_COLLECTION_JOB_TYPE|['"`]add_to_collection['"`])|INSERT INTO jobs[\s\S]{0,400}?add_to_collection/g;

  function sources(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return sources(p);
      return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)
        ? [p]
        : [];
    });
  }

  it('only src/server/imports/store.ts enqueues the add_to_collection type, once', () => {
    const sites: string[] = [];
    for (const file of sources(root)) {
      if (file === registry) continue;
      const text = fs.readFileSync(file, 'utf8');
      for (const _ of text.matchAll(SITE)) {
        sites.push(path.relative(root, file));
      }
    }
    expect(sites).toEqual([path.join('server', 'imports', 'store.ts')]);
  });
});
