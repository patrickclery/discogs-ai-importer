import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { orphanScenario } from '../../../test/helpers/scan-runs';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';
import { getDb } from '../db/client';
import { createSearch } from '../discogs/store';
import { newId } from '../ids';
import { cancelQueuedJob } from '../jobs/queue';
import { SECRET_ENV_NAMES, saveSecrets } from '../secrets';
import { cancelImport, createImport } from './store';

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

/** One stored candidate of the spine for releaseId; returns its id. */
function seedCandidate(spineId: string, releaseId = 1031): string {
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

function count(table: 'imports' | 'jobs', where = '1 = 1'): number {
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

  it.each(['unavailable', 'interrupted'])(
    'a failed import with an intent and %s answers started and changes nothing',
    async (kind) => {
      const { spineIds } = await orphanScenario();
      const { importId, jobId } = confirm(spineIds[0]);
      setJob(jobId, 'failed');
      setImport(importId, {
        status: 'failed',
        intent_at: 1_000,
        error_kind: kind,
      });
      const before = snapshot();
      expect(cancelImport(db(), spineIds[0])).toEqual({ status: 'started' });
      expect(snapshot()).toBe(before);
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
