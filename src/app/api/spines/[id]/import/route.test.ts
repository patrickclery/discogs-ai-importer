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
import { clearAuthInvalid, saveDiscogsAuth } from '@/server/discogs/auth';
import { createSearch } from '@/server/discogs/store';
import { newId } from '@/server/ids';
import { SECRET_ENV_NAMES, saveSecrets } from '@/server/secrets';
import { DELETE, POST } from './route';

// /api/spines/{id}/import: DELETE is Change match (D-02, T-04-14, T-04-16),
// POST the confirm (Plan 04-01) and its retry_first refusal (D-07).

function useTempSecrets(): void {
  let dir = '';
  const names = ['SECRETS_FILE', ...Object.values(SECRET_ENV_NAMES)];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const n of names) {
      saved[n] = process.env[n];
      delete process.env[n];
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-import-route-'));
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
       VALUES (@id, @spineId, @searchId, 'manual', @releaseId, 0, 'A - T',
         '[]', '[]', NULL, 0, @now)`,
    )
    .run({ id, spineId, searchId, releaseId, now: Date.now() });
  return id;
}

function call(
  method: 'POST' | 'DELETE',
  id: string,
  body: unknown,
  contentType = 'application/json',
) {
  const req = new Request(`http://127.0.0.1:3001/api/spines/${id}/import`, {
    method,
    headers: { 'content-type': contentType },
    body: JSON.stringify(body),
  });
  const ctx = { params: Promise.resolve({ id }) };
  return method === 'POST' ? POST(req, ctx) : DELETE(req, ctx);
}

async function confirmed(spineId: string): Promise<string> {
  const res = await call('POST', spineId, {
    candidateId: seedCandidate(spineId),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { importId: string }).importId;
}

function rows(): string {
  return JSON.stringify([
    db().prepare('SELECT * FROM imports ORDER BY id').all(),
    db().prepare('SELECT * FROM jobs ORDER BY id').all(),
  ]);
}

describe('DELETE /api/spines/{id}/import (Change match)', () => {
  useTempDataDir();
  useTempSecrets();

  it('415 for text/plain, and nothing changes', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    await confirmed(spineIds[0]);
    const before = rows();
    const res = await call('DELETE', spineIds[0], {}, 'text/plain');
    expect(res.status).toBe(415);
    expect(rows()).toBe(before);
  });

  it('400 for a body with unknown keys, and nothing changes', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    await confirmed(spineIds[0]);
    const before = rows();
    const res = await call('DELETE', spineIds[0], { candidateId: 'x' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      'invalid_body',
    );
    expect(rows()).toBe(before);
  });

  it('404 for a spine with no import and for an unknown spine', async () => {
    const { spineIds } = await orphanScenario();
    for (const id of [spineIds[0], 'no-such-spine']) {
      const res = await call('DELETE', id, {});
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: string }).error).toBe('not_found');
    }
  });

  it('200 cancels a waiting import, and a new confirm on that spine answers 201', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    const importId = await confirmed(spineIds[0]);
    const res = await call('DELETE', spineIds[0], {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cancelled: true });
    expect(
      db().prepare('SELECT 1 FROM imports WHERE id = ?').get(importId),
    ).toBeUndefined();
    const again = await call('POST', spineIds[0], {
      candidateId: seedCandidate(spineIds[0]),
    });
    expect(again.status).toBe(201);
  });

  it('409 started once the import job is running, and nothing changes', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    const importId = await confirmed(spineIds[0]);
    db()
      .prepare(
        `UPDATE jobs SET status = 'running'
         WHERE id = (SELECT job_id FROM imports WHERE id = ?)`,
      )
      .run(importId);
    const before = rows();
    const res = await call('DELETE', spineIds[0], {});
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'started',
      message:
        "It's already being added to Discogs, so the match can't be changed now.",
    });
    expect(rows()).toBe(before);
  });
});

describe('POST /api/spines/{id}/import retry_first (D-07)', () => {
  useTempDataDir();
  useTempSecrets();

  it('409 retry_first over a failed import with an unresolved intent, and nothing changes', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    const importId = await confirmed(spineIds[0]);
    db()
      .prepare(
        `UPDATE imports SET status = 'failed', intent_at = 1000,
           error_kind = 'unavailable' WHERE id = ?`,
      )
      .run(importId);
    const candidateId = seedCandidate(spineIds[0], 2042);
    const before = rows();
    const res = await call('POST', spineIds[0], { candidateId });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'retry_first',
      message: 'Retry the import first. Discogs may already have added it.',
    });
    expect(rows()).toBe(before);
  });
});
