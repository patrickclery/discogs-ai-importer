import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { orphanScenario } from '../../../../../../../test/helpers/scan-runs';
import { useTempDataDir } from '../../../../../../../test/helpers/temp-data-dir';

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
import { createSearch } from '@/server/discogs/store';
import { newId } from '@/server/ids';
import { createImport } from '@/server/imports/store';
import { SECRET_ENV_NAMES, saveSecrets } from '@/server/secrets';
import { POST } from './route';

// POST /api/spines/{id}/import/another (D-05 remote decision, T-04-31):
// the owner owns two, so the held import is re-enqueued with
// allow_duplicate and its next attempt adds instead of holding.

function useTempSecrets(): void {
  let dir = '';
  const names = ['SECRETS_FILE', ...Object.values(SECRET_ENV_NAMES)];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const n of names) {
      saved[n] = process.env[n];
      delete process.env[n];
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-another-route-'));
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

function another(id: string, body: unknown, contentType = 'application/json') {
  return POST(
    new Request(`http://127.0.0.1:3001/api/spines/${id}/import/another`, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

/** A confirmed import of 1031 whose job finished; its id. */
function confirmed(spineId: string): string {
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
  db()
    .prepare(`UPDATE jobs SET status = 'succeeded' WHERE id = ?`)
    .run(res.jobId);
  return res.importId;
}

/** A held import (already_in_collection) listing one copy. */
function held(spineId: string): string {
  const importId = confirmed(spineId);
  db()
    .prepare(
      `UPDATE imports SET status = 'already_in_collection', existing_json = ?
       WHERE id = ?`,
    )
    .run(
      JSON.stringify([
        {
          instanceId: 7001,
          folderId: 1,
          dateAdded: '2015-11-30T10:54:13-08:00',
        },
      ]),
      importId,
    );
  return importId;
}

function rows(): string {
  return JSON.stringify([
    db().prepare('SELECT * FROM imports ORDER BY id').all(),
    db().prepare('SELECT * FROM jobs ORDER BY id').all(),
  ]);
}

describe('POST /api/spines/{id}/import/another', () => {
  useTempDataDir();
  useTempSecrets();

  it('415 for text/plain and 400 for any key, and nothing changes', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    held(spineIds[0]);
    const before = rows();
    expect((await another(spineIds[0], {}, 'text/plain')).status).toBe(415);
    const extra = await another(spineIds[0], { allowDuplicate: true });
    expect(extra.status).toBe(400);
    expect(((await extra.json()) as { error: string }).error).toBe(
      'invalid_body',
    );
    expect(rows()).toBe(before);
  });

  it('404 for an unknown spine and for a spine with no import', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    for (const id of ['no-such-spine', spineIds[0]]) {
      const res = await another(id, {});
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: string }).error).toBe('not_found');
    }
  });

  it('409 not_connected with no sign-in, and Reconnect copy for a rejected one', async () => {
    const { spineIds } = await orphanScenario();
    held(spineIds[0]);
    const before = rows();
    const none = await another(spineIds[0], {});
    expect(none.status).toBe(409);
    expect(await none.json()).toEqual({
      error: 'not_connected',
      message: 'Connect Discogs in Settings first',
    });
    connect();
    markAuthInvalid();
    const invalid = await another(spineIds[0], {});
    expect(invalid.status).toBe(409);
    expect(await invalid.json()).toEqual({
      error: 'not_connected',
      message: 'Reconnect Discogs in Settings first',
    });
    expect(rows()).toBe(before);
  });

  it('201 { importId }: the same row goes back to pending with allow_duplicate and a queued job', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    const importId = held(spineIds[0]);
    const res = await another(spineIds[0], {});
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ importId });
    expect(
      db()
        .prepare(
          `SELECT i.status, i.allow_duplicate, j.status AS job_status
           FROM imports i JOIN jobs j ON j.id = i.job_id WHERE i.id = ?`,
        )
        .get(importId),
    ).toEqual({ status: 'pending', allow_duplicate: 1, job_status: 'queued' });
  });

  it('409 not_held when the import is not waiting on that choice', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    confirmed(spineIds[0]);
    const before = rows();
    const res = await another(spineIds[0], {});
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'not_held',
      message: 'This spine is not waiting on that choice any more.',
    });
    expect(rows()).toBe(before);
  });
});
