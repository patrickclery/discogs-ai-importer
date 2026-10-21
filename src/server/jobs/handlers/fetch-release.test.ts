import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTempDataDir } from '../../../../test/helpers/temp-data-dir';
import { getDb } from '../../db/client';
import {
  clearAuthInvalid,
  clearDiscogsAuth,
  isAuthInvalid,
  markAuthInvalid,
  saveDiscogsAuth,
} from '../../discogs/auth';
import { type DiscogsGate, resetDiscogsGateForTests } from '../../discogs/gate';
import { createSearch, setSearchJob } from '../../discogs/store';
import { SECRET_ENV_NAMES, saveSecrets } from '../../secrets';
import { claimNext, enqueue } from '../queue';
import type { JobContext } from '../types';
import { runFetchRelease } from './fetch-release';

// fetch_release (D-15, Pitfall 5): one paced GET /releases/{id} stores
// exactly one result, a 404 finishes not_found, and nothing ever writes a
// discogs_candidates row. fetchImpl is always a stub and the gate runs on a
// fake clock: never a live API, never a real sleep.

const START = 1_800_000_000_000;
const SPINE = 'spine-1';

type SearchDb = {
  status: string;
  error_kind: string | null;
  error: string | null;
  finished_at: number | null;
};

function useTempSecrets(): void {
  let dir = '';
  const names = [
    'SECRETS_FILE',
    'DISCOGS_API_BASE',
    ...Object.values(SECRET_ENV_NAMES),
  ];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const n of names) {
      saved[n] = process.env[n];
      delete process.env[n];
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-fetch-release-'));
    process.env.SECRETS_FILE = path.join(dir, 'secrets.json');
    saveSecrets({
      discogsConsumerKey: 'CANARYDISCOGSKEY-0123456789wxyz',
      discogsConsumerSecret: 'CANARYDISCOGSSECRET-0123456789abcd',
    });
    saveDiscogsAuth({
      token: 'CANARYTOKEN-0123456789efgh',
      tokenSecret: 'CANARYTOKENSECRET-0123456789ijkl',
      username: 'fake-owner',
    });
  });
  afterEach(() => {
    clearAuthInvalid();
    vi.restoreAllMocks();
    for (const n of names) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

function fakeClock() {
  const clock = {
    t: START,
    now: () => clock.t,
    sleep: async (ms: number) => {
      clock.t += ms;
    },
  };
  return clock;
}

const RELEASE_ID = 1820636;

const releaseBody = JSON.stringify({
  id: RELEASE_ID,
  title: 'Nevermind',
  artists: [
    { name: 'Nirvana', anv: '', join: '&' },
    { name: 'Friends', anv: '', join: '' },
  ],
  year: 1991,
  country: 'US',
  labels: [{ name: 'DGC', catno: 'DGCD-24425' }],
  formats: [{ name: 'CD', qty: '1', descriptions: ['Album'] }],
  thumb: 'https://i.discogs.com/r1820636.jpeg',
  master_id: 13814,
});

function seedSpine(state = 'active'): void {
  const db = getDb().$client;
  const now = Date.now();
  db.prepare(
    `INSERT INTO photos (id, sha256, original_name, mime, bytes, original_path,
       created_at, updated_at)
     VALUES ('photo-1', 'abc', 'shelf.jpg', 'image/jpeg', 1, 'photos/x.jpg', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO spines (id, photo_id, state, created_at, updated_at)
     VALUES (?, 'photo-1', ?, ?, ?)`,
  ).run(SPINE, state, now, now);
}

function dedupeKey(jobId: string): string | null {
  return (
    getDb()
      .$client.prepare('SELECT dedupe_key FROM jobs WHERE id = ?')
      .get(jobId) as { dedupe_key: string | null }
  ).dedupe_key;
}

/** A queued release search with its running job, claimed like the worker. */
function queuedRelease(releaseId = RELEASE_ID): {
  searchId: string;
  ctx: JobContext;
} {
  const db = getDb().$client;
  const searchId = createSearch(db, {
    spineId: SPINE,
    kind: 'release',
    inputs: { artist: null, title: null, catno: null, rawText: null },
    inputHash: null,
    queryText: String(releaseId),
    releaseId,
  });
  const job = enqueue({
    lane: 'discogs',
    type: 'fetch_release',
    payload: { searchId },
    dedupeKey: `search:${searchId}`,
  });
  setSearchJob(db, searchId, job.id);
  const claimed = claimNext('discogs');
  if (!claimed) throw new Error('no job claimed');
  return {
    searchId,
    ctx: {
      job: claimed,
      signal: new AbortController().signal,
      isCurrent: () => true,
    },
  };
}

type ReleaseRow = SearchDb & {
  stage: string | null;
  result_count: number | null;
  total_count: number | null;
  results_json: string | null;
};

function searchRow(id: string): ReleaseRow {
  return getDb()
    .$client.prepare(
      `SELECT status, stage, result_count, total_count, results_json,
         error_kind, error, finished_at
       FROM discogs_searches WHERE id = ?`,
    )
    .get(id) as ReleaseRow;
}

function candidateCount(): number {
  return (
    getDb()
      .$client.prepare(
        'SELECT COUNT(*) AS n FROM discogs_candidates WHERE spine_id = ?',
      )
      .get(SPINE) as { n: number }
  ).n;
}

describe('fetch_release handler', () => {
  useTempDataDir();
  useTempSecrets();
  let gate: DiscogsGate;
  let clock: ReturnType<typeof fakeClock>;

  beforeEach(() => {
    clock = fakeClock();
    gate = resetDiscogsGateForTests(clock);
  });

  async function run(respond: () => Response, state = 'active') {
    seedSpine(state);
    const { searchId, ctx } = queuedRelease();
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL) => {
      urls.push(String(url));
      return respond();
    }) as unknown as typeof fetch;
    const result = runFetchRelease({ searchId }, ctx, {
      fetch: { fetchImpl, gate },
    });
    return { searchId, ctx, result, urls };
  }

  it('a 200 stores exactly one result with the artists-display title', async () => {
    const { searchId, result, urls } = await run(
      () => new Response(releaseBody, { status: 200 }),
    );
    await expect(result).resolves.toBeUndefined();
    expect(urls).toHaveLength(1);
    expect(new URL(urls[0] as string).pathname).toBe(`/releases/${RELEASE_ID}`);
    const row = searchRow(searchId);
    expect(row).toMatchObject({
      status: 'done',
      stage: 'release',
      result_count: 1,
      total_count: 1,
    });
    const stored = JSON.parse(row.results_json ?? '[]') as {
      releaseId: number;
      title: string;
      artist: string | null;
      catno: string | null;
      masterId: number | null;
    }[];
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      releaseId: RELEASE_ID,
      title: 'Nirvana & Friends - Nevermind',
      artist: 'Nirvana & Friends',
      catno: 'DGCD-24425',
      masterId: 13814,
    });
    expect(candidateCount()).toBe(0);
  });

  it('a 404 finishes not_found with no result and no candidate', async () => {
    const { searchId, result, urls } = await run(
      () =>
        new Response(
          '{"message":"That release does not exist or may have been deleted."}',
          { status: 404 },
        ),
    );
    await expect(result).resolves.toBeUndefined();
    expect(urls).toHaveLength(1);
    const row = searchRow(searchId);
    expect(row).toMatchObject({
      status: 'not_found',
      result_count: 0,
      total_count: 0,
    });
    expect(JSON.parse(row.results_json ?? 'null')).toEqual([]);
    expect(candidateCount()).toBe(0);
  });

  it('a body for another release id is not stored', async () => {
    const { searchId, result } = await run(
      () =>
        new Response(JSON.stringify({ ...JSON.parse(releaseBody), id: 42 }), {
          status: 200,
        }),
    );
    await expect(result).rejects.toThrow(/unexpected release body/);
    expect(searchRow(searchId).status).toBe('queued');
  });

  it('a 429 defers with no attempt spent and leaves the search queued', async () => {
    const { searchId, result } = await run(
      () => new Response('', { status: 429, headers: { 'retry-after': '4' } }),
    );
    const err = await result.then(
      () => null,
      (e: unknown) => e as { name: string; runAfter: number },
    );
    expect(err?.name).toBe('JobDeferredError');
    expect(err?.runAfter).toBe(clock.t + 4000);
    expect(searchRow(searchId).status).toBe('queued');
  });

  it('a paused gate defers without a request', async () => {
    gate.pause(5000);
    const { searchId, result, urls } = await run(
      () => new Response(releaseBody, { status: 200 }),
    );
    await expect(result).rejects.toMatchObject({ name: 'JobDeferredError' });
    expect(urls).toHaveLength(0);
    expect(searchRow(searchId).status).toBe('queued');
  });

  it('no sign-in finishes not_connected without a request and releases the key', async () => {
    clearDiscogsAuth();
    const { searchId, ctx, result, urls } = await run(
      () => new Response(releaseBody, { status: 200 }),
    );
    await expect(result).resolves.toBeUndefined();
    expect(urls).toHaveLength(0);
    expect(searchRow(searchId).status).toBe('not_connected');
    expect(dedupeKey(ctx.job.id)).toBeNull();
  });

  it('a known-invalid sign-in finishes auth_failed without a request', async () => {
    markAuthInvalid();
    const { searchId, result, urls } = await run(
      () => new Response(releaseBody, { status: 200 }),
    );
    await expect(result).resolves.toBeUndefined();
    expect(urls).toHaveLength(0);
    expect(searchRow(searchId).status).toBe('auth_failed');
  });

  it('a 401 finishes auth_failed and turns on Reconnect needed', async () => {
    const { searchId, result } = await run(
      () => new Response('{"message":"nope"}', { status: 401 }),
    );
    await expect(result).resolves.toBeUndefined();
    expect(searchRow(searchId).status).toBe('auth_failed');
    expect(isAuthInvalid()).toBe(true);
  });

  it('a dismissed spine finishes skipped without a request', async () => {
    const { searchId, result, urls } = await run(
      () => new Response(releaseBody, { status: 200 }),
      'dismissed',
    );
    await expect(result).resolves.toBeUndefined();
    expect(urls).toHaveLength(0);
    expect(searchRow(searchId).status).toBe('skipped');
  });

  it('a 5xx records unavailable and rethrows for the worker retry', async () => {
    const { searchId, result } = await run(
      () => new Response('{"message":"Bad gateway."}', { status: 502 }),
    );
    await expect(result).rejects.toMatchObject({
      name: 'DiscogsUnavailableError',
    });
    expect(searchRow(searchId)).toMatchObject({
      status: 'queued',
      error_kind: 'unavailable',
    });
  });
});
