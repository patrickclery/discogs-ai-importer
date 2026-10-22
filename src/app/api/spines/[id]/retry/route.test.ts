import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { orphanScenario } from '../../../../../../test/helpers/scan-runs';
import { useTempDataDir } from '../../../../../../test/helpers/temp-data-dir';

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

// POST /api/spines/{id}/retry (REV-04, D-13, T-04-16, T-04-18): retries the
// failed import first, else the failed search; never a second job.

function useTempSecrets(): void {
  let dir = '';
  const names = ['SECRETS_FILE', ...Object.values(SECRET_ENV_NAMES)];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const n of names) {
      saved[n] = process.env[n];
      delete process.env[n];
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-retry-route-'));
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

function retry(id: string, body: unknown, contentType = 'application/json') {
  return POST(
    new Request(`http://127.0.0.1:3001/api/spines/${id}/retry`, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

/** A confirmed import whose job finished and that ended failed. */
function failedImport(spineId: string): string {
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
       VALUES (@id, @spineId, @searchId, 'manual', 1031, 0, 'A - T',
         '[]', '[]', NULL, 0, @now)`,
    )
    .run({ id: candidateId, spineId, searchId, now: Date.now() });
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

function failedSearch(spineId: string): void {
  const searchId = createSearch(db(), {
    spineId,
    kind: 'auto',
    inputs: { artist: 'A', title: 'T', catno: null, rawText: null },
    inputHash: `h-${newId()}`,
  });
  finishSearch(db(), searchId, { status: 'failed', error: 'HTTP 500' });
}

function rows(): string {
  return JSON.stringify([
    db().prepare('SELECT * FROM imports ORDER BY id').all(),
    db().prepare('SELECT * FROM jobs ORDER BY id').all(),
    db().prepare('SELECT * FROM discogs_searches ORDER BY id').all(),
  ]);
}

describe('POST /api/spines/{id}/retry', () => {
  useTempDataDir();
  useTempSecrets();

  it('415 for text/plain and 400 for unknown keys, and nothing changes', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    failedImport(spineIds[0]);
    const before = rows();
    expect((await retry(spineIds[0], {}, 'text/plain')).status).toBe(415);
    const extra = await retry(spineIds[0], { kind: 'import' });
    expect(extra.status).toBe(400);
    expect(((await extra.json()) as { error: string }).error).toBe(
      'invalid_body',
    );
    expect(rows()).toBe(before);
  });

  it('404 for an unknown spine', async () => {
    await orphanScenario();
    connect();
    const res = await retry('no-such-spine', {});
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('not_found');
  });

  it('409 not_connected with no sign-in, and Reconnect copy for a rejected one', async () => {
    const { spineIds } = await orphanScenario();
    failedImport(spineIds[0]);
    const before = rows();
    const none = await retry(spineIds[0], {});
    expect(none.status).toBe(409);
    expect(await none.json()).toEqual({
      error: 'not_connected',
      message: 'Connect Discogs in Settings first',
    });
    connect();
    markAuthInvalid();
    const invalid = await retry(spineIds[0], {});
    expect(invalid.status).toBe(409);
    expect(await invalid.json()).toEqual({
      error: 'not_connected',
      message: 'Reconnect Discogs in Settings first',
    });
    expect(rows()).toBe(before);
  });

  it('201 kind import for a failed import, on the same row', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    const importId = failedImport(spineIds[0]);
    const res = await retry(spineIds[0], {});
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ kind: 'import', importId });
    expect(
      db().prepare('SELECT status FROM imports WHERE id = ?').get(importId),
    ).toEqual({ status: 'pending' });
  });

  it('201 kind search for a failed search', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    failedSearch(spineIds[0]);
    const res = await retry(spineIds[0], {});
    expect(res.status).toBe(201);
    const body = (await res.json()) as { kind: string; searchId: string };
    expect(body.kind).toBe('search');
    expect(
      db()
        .prepare('SELECT kind FROM discogs_searches WHERE id = ?')
        .get(body.searchId),
    ).toEqual({ kind: 'again' });
  });

  it('409 nothing_to_retry when nothing failed', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    const before = rows();
    const res = await retry(spineIds[0], {});
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'nothing_to_retry',
      message: 'Nothing failed on this spine.',
    });
    expect(rows()).toBe(before);
  });

  it('409 busy while the retried import job is running', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    const importId = failedImport(spineIds[0]);
    expect((await retry(spineIds[0], {})).status).toBe(201);
    db()
      .prepare(
        `UPDATE jobs SET status = 'running'
         WHERE id = (SELECT job_id FROM imports WHERE id = ?)`,
      )
      .run(importId);
    const before = rows();
    const res = await retry(spineIds[0], {});
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'busy',
      message: "It's already waiting or running.",
    });
    expect(rows()).toBe(before);
  });
});
