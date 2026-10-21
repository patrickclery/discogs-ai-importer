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
import { inputHash, loadSpineInputs } from '@/server/discogs/inputs';
import {
  createSearch,
  finishSearch,
  setSearchJob,
} from '@/server/discogs/store';
import { enqueue } from '@/server/jobs/queue';
import { SECRET_ENV_NAMES, saveSecrets } from '@/server/secrets';
import { POST } from './route';

// POST /api/spines/{id}/search (DISC-05, D-06, D-14, T-03-29, T-03-30):
// JSON only, a strict body, 404 and 409 refusals, 201 with a new search.
// Plan 03-11 adds text and ref modes to the same route; Plan 03-12 pins them.

function useTempSecrets(): void {
  let dir = '';
  const names = ['SECRETS_FILE', ...Object.values(SECRET_ENV_NAMES)];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const n of names) {
      saved[n] = process.env[n];
      delete process.env[n];
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-search-route-'));
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

function search(id: string, body: unknown, contentType = 'application/json') {
  return POST(
    new Request(`http://127.0.0.1:3000/api/spines/${id}/search`, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

function searchCount(spineId: string): number {
  return (
    getDb()
      .$client.prepare(
        'SELECT COUNT(*) AS n FROM discogs_searches WHERE spine_id = ?',
      )
      .get(spineId) as { n: number }
  ).n;
}

/** An auto search of the spine's current inputs whose job has jobStatus. */
function seedSearch(
  spineId: string,
  jobStatus: 'queued' | 'running' | 'failed',
): void {
  const db = getDb().$client;
  const inputs = loadSpineInputs(db, spineId);
  const searchId = createSearch(db, {
    spineId,
    kind: 'auto',
    inputs,
    inputHash: inputHash(inputs),
  });
  const job = enqueue({
    lane: 'discogs',
    type: 'search_spine',
    payload: { searchId },
    dedupeKey: `search:auto:${spineId}:${inputHash(inputs)}`,
  });
  setSearchJob(db, searchId, job.id);
  db.prepare('UPDATE jobs SET status = @jobStatus WHERE id = @id').run({
    jobStatus,
    id: job.id,
  });
}

describe('POST /api/spines/{id}/search', () => {
  useTempDataDir();
  useTempSecrets();

  it('415 for text/plain, and no search is created', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    const res = await search(spineIds[0], { mode: 'again' }, 'text/plain');
    expect(res.status).toBe(415);
    expect(searchCount(spineIds[0])).toBe(0);
  });

  it('400 for an unknown mode or an extra key', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    const nope = await search(spineIds[0], { mode: 'nope' });
    expect(nope.status).toBe(400);
    expect(((await nope.json()) as { error: string }).error).toBe(
      'invalid_body',
    );
    expect((await search(spineIds[0], { mode: 'again', x: 1 })).status).toBe(
      400,
    );
    expect(searchCount(spineIds[0])).toBe(0);
  });

  it('404 for an unknown spine', async () => {
    await orphanScenario();
    connect();
    const res = await search('no-such-spine', { mode: 'again' });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('not_found');
  });

  it('409 not_searchable for a superseded and a dismissed spine', async () => {
    const { supersededId, spineIds } = await orphanScenario();
    connect();
    getDb()
      .$client.prepare("UPDATE spines SET state = 'dismissed' WHERE id = ?")
      .run(spineIds[1]);
    for (const id of [supersededId, spineIds[1]]) {
      const res = await search(id, { mode: 'again' });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: 'not_searchable',
        message: 'This spine can no longer be searched.',
      });
      expect(searchCount(id)).toBe(0);
    }
  });

  it('409 not_connected with no stored sign-in, and with a rejected one', async () => {
    const { spineIds } = await orphanScenario();
    const none = await search(spineIds[0], { mode: 'again' });
    expect(none.status).toBe(409);
    expect(await none.json()).toEqual({
      error: 'not_connected',
      message: 'Connect Discogs in Settings first',
    });
    connect();
    markAuthInvalid();
    const invalid = await search(spineIds[0], { mode: 'again' });
    expect(invalid.status).toBe(409);
    expect(((await invalid.json()) as { error: string }).error).toBe(
      'not_connected',
    );
    expect(searchCount(spineIds[0])).toBe(0);
  });

  it('409 busy while the latest search is queued or running', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    seedSearch(spineIds[0], 'queued');
    seedSearch(spineIds[1], 'running');
    for (const id of [spineIds[0], spineIds[1]]) {
      const res = await search(id, { mode: 'again' });
      expect(res.status).toBe(409);
      expect(((await res.json()) as { error: string }).error).toBe('busy');
      expect(searchCount(id)).toBe(1);
    }
  });

  it('201 for an orphaned spine', async () => {
    const { orphanId } = await orphanScenario();
    connect();
    const res = await search(orphanId, { mode: 'again' });
    expect(res.status).toBe(201);
    const { searchId } = (await res.json()) as { searchId: string };
    const row = getDb()
      .$client.prepare(
        `SELECT s.kind, s.status, j.dedupe_key FROM discogs_searches s
         JOIN jobs j ON j.id = s.job_id WHERE s.id = ?`,
      )
      .get(searchId);
    expect(row).toEqual({
      kind: 'again',
      status: 'queued',
      dedupe_key: `search:${searchId}`,
    });
  });

  it('201 for a spine whose latest search failed (Retry, D-06)', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    seedSearch(spineIds[0], 'failed');
    const res = await search(spineIds[0], { mode: 'again' });
    expect(res.status).toBe(201);
    expect(searchCount(spineIds[0])).toBe(2);
    // A search that ended failed (not just its job) is retryable too.
    const db = getDb().$client;
    const { searchId } = (await res.json()) as { searchId: string };
    finishSearch(db, searchId, { status: 'failed', error: 'HTTP 500' });
    expect((await search(spineIds[0], { mode: 'again' })).status).toBe(201);
    expect(searchCount(spineIds[0])).toBe(3);
  });
});

/** The started search with its job's type and dedupe key. */
function startedRow(searchId: string) {
  return getDb()
    .$client.prepare(
      `SELECT s.kind, s.status, s.query_text, s.release_id, s.inputs_json,
         j.type, j.dedupe_key
       FROM discogs_searches s JOIN jobs j ON j.id = s.job_id
       WHERE s.id = ?`,
    )
    .get(searchId) as {
    kind: string;
    status: string;
    query_text: string | null;
    release_id: number | null;
    inputs_json: string;
    type: string;
    dedupe_key: string | null;
  };
}

describe('POST /api/spines/{id}/search modes text and ref (D-15, Pitfall 5)', () => {
  useTempDataDir();
  useTempSecrets();

  it.each(['[m13814]', 'm13814', 'https://www.discogs.com/master/13814'])(
    '400 master for %s in ref and text mode, with no search created',
    async (value) => {
      const { spineIds } = await orphanScenario();
      connect();
      for (const mode of ['ref', 'text']) {
        const res = await search(spineIds[0], { mode, value });
        expect(res.status).toBe(400);
        expect(((await res.json()) as { error: string }).error).toBe('master');
      }
      expect(searchCount(spineIds[0])).toBe(0);
    },
  );

  it('400 for empty or blank text', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    for (const value of ['', '   ']) {
      const res = await search(spineIds[0], { mode: 'text', value });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe(
        'invalid_body',
      );
    }
    expect(searchCount(spineIds[0])).toBe(0);
  });

  it('400 for a 501-character value; 500 is accepted', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    const long = await search(spineIds[0], {
      mode: 'text',
      value: 'a'.repeat(501),
    });
    expect(long.status).toBe(400);
    expect(searchCount(spineIds[0])).toBe(0);
    const max = await search(spineIds[0], {
      mode: 'text',
      value: 'a'.repeat(500),
    });
    expect(max.status).toBe(201);
  });

  it('400 invalid_ref for ref mode with plain text', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    const res = await search(spineIds[0], { mode: 'ref', value: 'Nirvana' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('invalid_ref');
    expect(searchCount(spineIds[0])).toBe(0);
  });

  it('text starts a manual search_spine job keyed by its own search id', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    const res = await search(spineIds[0], {
      mode: 'text',
      value: '  Static Bloom  ',
    });
    expect(res.status).toBe(201);
    const { searchId } = (await res.json()) as { searchId: string };
    const row = startedRow(searchId);
    expect(row).toMatchObject({
      kind: 'manual',
      status: 'queued',
      query_text: 'Static Bloom',
      release_id: null,
      type: 'search_spine',
      dedupe_key: `search:${searchId}`,
    });
    expect(JSON.parse(row.inputs_json)).toMatchObject({
      artist: null,
      title: null,
      catno: null,
      rawText: 'Static Bloom',
    });
  });

  it('text that reads as a release link starts a release search (server re-parse)', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    const res = await search(spineIds[0], {
      mode: 'text',
      value: 'https://www.discogs.com/release/1820636-Nirvana-Nevermind',
    });
    expect(res.status).toBe(201);
    const { searchId } = (await res.json()) as { searchId: string };
    expect(startedRow(searchId)).toMatchObject({
      kind: 'release',
      release_id: 1820636,
      type: 'fetch_release',
    });
  });

  it('a pasted number in ref mode starts a release search', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    const res = await search(spineIds[0], { mode: 'ref', value: '13814' });
    expect(res.status).toBe(201);
    const { searchId } = (await res.json()) as { searchId: string };
    expect(startedRow(searchId)).toMatchObject({
      kind: 'release',
      release_id: 13814,
      type: 'fetch_release',
    });
  });

  it('409 not_connected for text and ref with no stored sign-in', async () => {
    const { spineIds } = await orphanScenario();
    for (const body of [
      { mode: 'text', value: 'Static Bloom' },
      { mode: 'ref', value: '1820636' },
    ]) {
      const res = await search(spineIds[0], body);
      expect(res.status).toBe(409);
      expect(((await res.json()) as { error: string }).error).toBe(
        'not_connected',
      );
    }
    expect(searchCount(spineIds[0])).toBe(0);
  });

  it('a queued automatic search does not block a dialog search', async () => {
    const { spineIds } = await orphanScenario();
    connect();
    seedSearch(spineIds[0], 'queued');
    const res = await search(spineIds[0], {
      mode: 'text',
      value: 'Static Bloom',
    });
    expect(res.status).toBe(201);
    expect(searchCount(spineIds[0])).toBe(2);
  });
});
