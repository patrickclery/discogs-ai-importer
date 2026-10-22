import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  foreignCandidate,
  orphanScenario,
} from '../../../../../test/helpers/scan-runs';
import { useTempDataDir } from '../../../../../test/helpers/temp-data-dir';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

import { getDb } from '@/server/db/client';
import {
  clearAuthInvalid,
  markAuthInvalid,
  saveDiscogsAuth,
} from '@/server/discogs/auth';
import { createSearch, finishSearch } from '@/server/discogs/store';
import { newId } from '@/server/ids';
import { createImport } from '@/server/imports/store';
import { SECRET_ENV_NAMES, saveSecrets } from '@/server/secrets';
import { POST } from './route';

// POST /api/spines/retry-failed (REV-04, D-13, A-04-21, T-04-37, T-04-40):
// every failed spine under the photo filter goes back in line with the
// per-spine Retry rule; nothing while Discogs is not connected; never an
// import the owner did not confirm.

function useTempSecrets(): void {
  let dir = '';
  const names = ['SECRETS_FILE', ...Object.values(SECRET_ENV_NAMES)];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const n of names) {
      saved[n] = process.env[n];
      delete process.env[n];
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-retry-failed-'));
    process.env.SECRETS_FILE = path.join(dir, 'secrets.json');
    saveSecrets({
      discogsConsumerKey: 'CANARYDISCOGSKEY-0123456789wxyz',
      discogsConsumerSecret: 'CANARYDISCOGSSECRET-0123456789abcd',
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
}

function connect(): void {
  saveDiscogsAuth({
    token: 'CANARYTOKEN-0123456789efgh',
    tokenSecret: 'CANARYTOKENSECRET-0123456789ijkl',
    username: 'fake-owner',
  });
}

function db() {
  return getDb().$client;
}

function retryFailed(body: unknown, contentType = 'application/json') {
  return POST(
    new Request('http://127.0.0.1:3001/api/spines/retry-failed', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: JSON.stringify(body),
    }),
  );
}

/** A confirmed import whose job finished and that ended failed. */
function failedImport(spineId: string, releaseId = 1031): string {
  const searchId = createSearch(db(), {
    spineId,
    kind: 'manual',
    inputs: { artist: null, title: null, catno: null, rawText: 'x' },
    inputHash: null,
  });
  const candidateId = newId();
  db()
    .prepare(
      `INSERT INTO discogs_candidates (id, spine_id, search_id, source,
         release_id, rank, title, labels_json, formats_json, thumb_url,
         catno_match, created_at)
       VALUES (@id, @spineId, @searchId, 'manual', @releaseId, 0, 'A - T',
         '[]', '[]', NULL, 0, @now)`,
    )
    .run({ id: candidateId, spineId, searchId, releaseId, now: Date.now() });
  const res = createImport(db(), { spineId, candidateId });
  if (res.status !== 'ok') throw new Error(res.status);
  db().prepare(`UPDATE jobs SET status = 'failed' WHERE id = ?`).run(res.jobId);
  db()
    .prepare(
      `UPDATE imports SET status = 'failed', error_kind = 'unavailable',
         error = 'Discogs answered 502' WHERE id = ?`,
    )
    .run(res.importId);
  return res.importId;
}

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

function photoOf(spineId: string): string {
  return (
    db().prepare('SELECT photo_id FROM spines WHERE id = ?').get(spineId) as {
      photo_id: string;
    }
  ).photo_id;
}

function importJobs(): { rowid: number; id: string; dedupe_key: string }[] {
  return db()
    .prepare(
      `SELECT rowid, id, dedupe_key FROM jobs
       WHERE type = 'add_to_collection' AND status = 'queued'
       ORDER BY rowid`,
    )
    .all() as { rowid: number; id: string; dedupe_key: string }[];
}

function searchesOf(spineId: string): { id: string; kind: string }[] {
  return db()
    .prepare(
      `SELECT id, kind FROM discogs_searches WHERE spine_id = ?
       ORDER BY created_at, rowid`,
    )
    .all(spineId) as { id: string; kind: string }[];
}

function rows(): string {
  return JSON.stringify([
    db().prepare('SELECT * FROM imports ORDER BY id').all(),
    db().prepare('SELECT * FROM jobs ORDER BY id').all(),
    db().prepare('SELECT * FROM discogs_searches ORDER BY id').all(),
  ]);
}

describe('POST /api/spines/retry-failed', () => {
  useTempDataDir();
  useTempSecrets();

  it('415 for text/plain and 400 for unknown keys, and nothing changes', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    failedImport(spineIds[0]);
    const before = rows();
    expect((await retryFailed({}, 'text/plain')).status).toBe(415);
    const extra = await retryFailed({ all: true });
    expect(extra.status).toBe(400);
    expect(((await extra.json()) as { error: string }).error).toBe(
      'invalid_body',
    );
    expect((await retryFailed({ photoId: '' })).status).toBe(400);
    expect((await retryFailed({ photoId: 'x'.repeat(41) })).status).toBe(400);
    expect(rows()).toBe(before);
  });

  it('retries a failed import on its own row and a failed search under the photo filter; another photo is untouched', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    const importId = failedImport(spineIds[0]);
    failedSearch(spineIds[1]);
    const other = await foreignCandidate();
    failedSearch(other);
    const otherBefore = searchesOf(other);

    const res = await retryFailed({ photoId: photoOf(spineIds[0]) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ retried: 2, skipped: 0 });

    expect(
      db()
        .prepare('SELECT COUNT(*) AS n FROM imports WHERE spine_id = ?')
        .get(spineIds[0]),
    ).toEqual({ n: 1 });
    expect(
      db().prepare('SELECT status FROM imports WHERE id = ?').get(importId),
    ).toEqual({ status: 'pending' });
    expect(importJobs()).toHaveLength(1);
    const searches = searchesOf(spineIds[1]);
    expect(searches.at(-1)?.kind).toBe('again');
    expect(searchesOf(other)).toEqual(otherBefore);
  });

  it('without a photo filter retries every photo, in list order', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    failedImport(spineIds[0], 1031);
    failedImport(spineIds[1], 1032);
    const other = await foreignCandidate();
    failedSearch(other);

    const res = await retryFailed({});
    expect(await res.json()).toEqual({ retried: 3, skipped: 0 });
    // Each import gets its own job, enqueued in detection order.
    const jobs = importJobs();
    expect(jobs.map((j) => j.dedupe_key)).toEqual([
      `import:${spineIds[0]}:1031`,
      `import:${spineIds[1]}:1032`,
    ]);
    expect(searchesOf(other).at(-1)?.kind).toBe('again');
  });

  it('while not connected enqueues nothing and answers skipped', async () => {
    const { spineIds } = await orphanScenario();
    failedImport(spineIds[0]);
    failedSearch(spineIds[1]);
    const before = rows();
    const none = await retryFailed({});
    expect(none.status).toBe(200);
    expect(await none.json()).toEqual({ retried: 0, skipped: 2 });
    connect();
    markAuthInvalid();
    expect(await (await retryFailed({})).json()).toEqual({
      retried: 0,
      skipped: 2,
    });
    expect(rows()).toBe(before);
  });

  it('never gives a spine without an imports row an add_to_collection job', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    // A failed search with candidates the owner never confirmed.
    const searchId = failedSearch(spineIds[2]);
    db()
      .prepare(
        `INSERT INTO discogs_candidates (id, spine_id, search_id, source,
           release_id, rank, title, labels_json, formats_json, thumb_url,
           catno_match, created_at)
         VALUES (@id, @spineId, @searchId, 'auto', 1031, 0, 'A - T',
           '[]', '[]', NULL, 0, @now)`,
      )
      .run({ id: newId(), spineId: spineIds[2], searchId, now: Date.now() });
    expect(await (await retryFailed({})).json()).toEqual({
      retried: 1,
      skipped: 0,
    });
    expect(
      db()
        .prepare(
          `SELECT COUNT(*) AS n FROM jobs WHERE type = 'add_to_collection'`,
        )
        .get(),
    ).toEqual({ n: 0 });
    expect(db().prepare('SELECT COUNT(*) AS n FROM imports').get()).toEqual({
      n: 0,
    });
  });

  it('a second call while the retries are queued enqueues nothing new', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    failedImport(spineIds[0]);
    failedSearch(spineIds[1]);
    expect(await (await retryFailed({})).json()).toEqual({
      retried: 2,
      skipped: 0,
    });
    const before = rows();
    expect(await (await retryFailed({})).json()).toEqual({
      retried: 0,
      skipped: 0,
    });
    expect(rows()).toBe(before);
  });

  it('leaves a failed search beside a waiting import as it is', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    const importId = failedImport(spineIds[0]);
    // Put the import back in line, then fail a newer search (A-04-09).
    const job = db()
      .prepare(`SELECT job_id FROM imports WHERE id = ?`)
      .get(importId) as { job_id: string };
    db()
      .prepare(`UPDATE jobs SET status = 'queued' WHERE id = ?`)
      .run(job.job_id);
    db()
      .prepare(
        `UPDATE imports SET status = 'pending', error_kind = NULL, error = NULL
         WHERE id = ?`,
      )
      .run(importId);
    failedSearch(spineIds[0]);
    const before = rows();
    expect(await (await retryFailed({})).json()).toEqual({
      retried: 0,
      skipped: 0,
    });
    expect(rows()).toBe(before);
  });
});
