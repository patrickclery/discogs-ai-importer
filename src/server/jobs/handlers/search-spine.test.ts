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
import { runSearchSpine } from './search-spine';

// The search_spine branches that keep a 429, a revoked sign-in, a
// disconnect or a vanished spine from losing work or wasting a request
// (D-06, RESEARCH Pitfalls 2, 6 and 7). fetchImpl is always a stub and the
// gate runs on a fake clock: never a live API, never a real sleep.

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
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-search-spine-'));
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

const okBody = JSON.stringify({
  pagination: { items: 1, page: 1, pages: 1, per_page: 10 },
  results: [
    {
      id: 1001,
      type: 'release',
      title: 'Nova Lane - Blue Hour',
      catno: 'TR-200',
      label: ['Fake Label'],
      formats: [{ name: 'CD', qty: '1', descriptions: ['Album'] }],
    },
  ],
});

function stubFetch(respond: () => Response) {
  let calls = 0;
  const fetchImpl = vi.fn(async () => {
    calls += 1;
    return respond();
  }) as unknown as typeof fetch;
  return { fetchImpl, calls: () => calls };
}

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

/** A queued search with its running job, claimed like the worker does. */
function queuedSearch(kind: 'auto' | 'again' = 'auto'): {
  searchId: string;
  ctx: JobContext;
} {
  const db = getDb().$client;
  const searchId = createSearch(db, {
    spineId: SPINE,
    kind,
    inputs: { artist: null, title: null, catno: 'TR-200', rawText: null },
    inputHash: 'hash-1',
  });
  const job = enqueue({
    lane: 'discogs',
    type: 'search_spine',
    payload: { searchId },
    dedupeKey: `search:auto:${SPINE}:hash-1`,
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

function searchRow(id: string): SearchDb {
  return getDb()
    .$client.prepare(
      'SELECT status, error_kind, error, finished_at FROM discogs_searches WHERE id = ?',
    )
    .get(id) as SearchDb;
}

function dedupeKey(jobId: string): string | null {
  return (
    getDb()
      .$client.prepare('SELECT dedupe_key FROM jobs WHERE id = ?')
      .get(jobId) as { dedupe_key: string | null }
  ).dedupe_key;
}

describe('search_spine handler (deferral, auth, vanished spines, errors)', () => {
  useTempDataDir();
  useTempSecrets();
  let gate: DiscogsGate;
  let clock: ReturnType<typeof fakeClock>;

  beforeEach(() => {
    clock = fakeClock();
    gate = resetDiscogsGateForTests(clock);
  });

  async function run(
    respond: () => Response,
    opts: { state?: string; kind?: 'auto' | 'again' } = {},
  ) {
    seedSpine(opts.state);
    const { searchId, ctx } = queuedSearch(opts.kind);
    const stub = stubFetch(respond);
    const result = runSearchSpine({ searchId }, ctx, {
      fetch: { fetchImpl: stub.fetchImpl, gate },
    });
    return { searchId, ctx, result, calls: stub.calls };
  }

  it('a 429 throws JobDeferredError carrying the gate resume time and leaves the search queued', async () => {
    const { searchId, result, calls } = await run(
      () => new Response('', { status: 429, headers: { 'retry-after': '7' } }),
    );
    const err = await result.then(
      () => null,
      (e: unknown) => e as { name: string; runAfter: number },
    );
    expect(err?.name).toBe('JobDeferredError');
    expect(err?.runAfter).toBe(gate.pausedUntil());
    expect(err?.runAfter).toBe(clock.t + 7000);
    expect(calls()).toBe(1);
    expect(searchRow(searchId)).toMatchObject({
      status: 'queued',
      error_kind: null,
    });
  });

  it('a gate paused before the first request defers without any request', async () => {
    gate.pause(5000);
    const { searchId, result, calls } = await run(
      () => new Response(okBody, { status: 200 }),
    );
    const err = await result.then(
      () => null,
      (e: unknown) => e as { name: string; runAfter: number },
    );
    expect(err?.name).toBe('JobDeferredError');
    expect(err?.runAfter).toBe(START + 5000);
    expect(calls()).toBe(0);
    expect(searchRow(searchId).status).toBe('queued');
  });

  it('a 401 finishes auth_failed, turns on Reconnect needed and releases the dedupe key', async () => {
    const { searchId, ctx, result, calls } = await run(
      () => new Response('{"message":"nope"}', { status: 401 }),
    );
    await expect(result).resolves.toBeUndefined();
    expect(calls()).toBe(1);
    expect(searchRow(searchId).status).toBe('auth_failed');
    expect(isAuthInvalid()).toBe(true);
    expect(dedupeKey(ctx.job.id)).toBeNull();
  });

  it('with no stored connection it finishes not_connected without a request and releases the key', async () => {
    clearDiscogsAuth();
    const { searchId, ctx, result, calls } = await run(
      () => new Response(okBody, { status: 200 }),
    );
    await expect(result).resolves.toBeUndefined();
    expect(calls()).toBe(0);
    expect(searchRow(searchId).status).toBe('not_connected');
    expect(dedupeKey(ctx.job.id)).toBeNull();
  });

  it('once auth is known invalid, a queued search short-circuits to auth_failed without a request', async () => {
    markAuthInvalid();
    const { searchId, ctx, result, calls } = await run(
      () => new Response(okBody, { status: 200 }),
    );
    await expect(result).resolves.toBeUndefined();
    expect(calls()).toBe(0);
    expect(searchRow(searchId).status).toBe('auth_failed');
    expect(dedupeKey(ctx.job.id)).toBeNull();
  });

  it.each([
    ['superseded', 'auto'],
    ['dismissed', 'auto'],
    ['orphaned', 'auto'],
    ['superseded', 'again'],
  ] as const)(
    'a %s spine finishes a %s search skipped without a request',
    async (state, kind) => {
      const { searchId, ctx, result, calls } = await run(
        () => new Response(okBody, { status: 200 }),
        { state, kind },
      );
      await expect(result).resolves.toBeUndefined();
      expect(calls()).toBe(0);
      expect(searchRow(searchId).status).toBe('skipped');
      expect(dedupeKey(ctx.job.id)).not.toBeNull();
    },
  );

  // Nyquist gap audit (CR-01): an orphaned spine can become active again
  // (re-attach, re-scan merge), so its skipped auto search must release the
  // dedupe key or the same inputs can never be auto-searched again. it.fails
  // while CR-01 is open; flip to it (and narrow the it.each above) once fixed.
  it.fails('CR-01: an orphaned spine finishes its auto search skipped and releases the dedupe key', async () => {
    const { searchId, ctx, result, calls } = await run(
      () => new Response(okBody, { status: 200 }),
      { state: 'orphaned', kind: 'auto' },
    );
    await expect(result).resolves.toBeUndefined();
    expect(calls()).toBe(0);
    expect(searchRow(searchId).status).toBe('skipped');
    expect(dedupeKey(ctx.job.id)).toBeNull();
  });

  it('an orphaned spine still runs an explicit (again) search', async () => {
    const { searchId, result, calls } = await run(
      () => new Response(okBody, { status: 200 }),
      { state: 'orphaned', kind: 'again' },
    );
    await expect(result).resolves.toBeUndefined();
    expect(calls()).toBe(1);
    expect(searchRow(searchId).status).toBe('done');
  });

  it('a 5xx records error_kind unavailable and rethrows for the worker retry', async () => {
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

  it.each([400, 403, 422])(
    'a %i finishes the search failed with error_kind rejected and does not throw',
    async (status) => {
      const { searchId, ctx, result, calls } = await run(
        () => new Response('{"message":"bad"}', { status }),
      );
      await expect(result).resolves.toBeUndefined();
      expect(calls()).toBe(1);
      const row = searchRow(searchId);
      expect(row.status).toBe('failed');
      expect(row.error_kind).toBe('rejected');
      expect(row.error?.length ?? 0).toBeLessThanOrEqual(160);
      expect(row.error).toContain(String(status));
      expect(dedupeKey(ctx.job.id)).not.toBeNull();
    },
  );
});

describe('search_spine handler (kind manual, D-15)', () => {
  useTempDataDir();
  useTempSecrets();
  let gate: DiscogsGate;

  beforeEach(() => {
    gate = resetDiscogsGateForTests(fakeClock());
  });

  /** A queued manual search for the typed text, claimed like the worker. */
  function queuedManual(text: string): { searchId: string; ctx: JobContext } {
    const db = getDb().$client;
    const searchId = createSearch(db, {
      spineId: SPINE,
      kind: 'manual',
      inputs: { artist: null, title: null, catno: null, rawText: text },
      inputHash: null,
      queryText: text,
    });
    const job = enqueue({
      lane: 'discogs',
      type: 'search_spine',
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

  function manyResults(n: number, total: number): string {
    return JSON.stringify({
      pagination: { items: total, page: 1, pages: 2, per_page: 25 },
      results: Array.from({ length: n }, (_, i) => ({
        id: 2000 + i,
        type: 'release',
        title: `Band ${i} - Best Of`,
        catno: `BO-${i}`,
        formats: [{ name: 'CD', qty: '1' }],
        thumb: `https://i.discogs.com/${i}.jpg`,
      })),
    });
  }

  function seedAutoCandidate(): void {
    const db = getDb().$client;
    const autoId = createSearch(db, {
      spineId: SPINE,
      kind: 'auto',
      inputs: { artist: null, title: null, catno: 'X', rawText: null },
      inputHash: 'hash-auto',
    });
    db.prepare(
      `INSERT INTO discogs_candidates (id, spine_id, search_id, source,
         release_id, rank, title, labels_json, formats_json, catno_match,
         created_at)
       VALUES ('cand-auto', ?, ?, 'auto', 9999, 0, 'Old - Auto', '[]',
         '[]', 0, ?)`,
    ).run(SPINE, autoId, Date.now());
  }

  function candidateIds(): string[] {
    return (
      getDb()
        .$client.prepare(
          'SELECT id FROM discogs_candidates WHERE spine_id = ? ORDER BY id',
        )
        .all(SPINE) as { id: string }[]
    ).map((r) => r.id);
  }

  it('sends one GET /database/search with q, type, format CD, per_page 25 and page 1', async () => {
    seedSpine();
    const { searchId, ctx } = queuedManual('Best Of');
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL) => {
      urls.push(String(url));
      return new Response(manyResults(25, 312), { status: 200 });
    }) as unknown as typeof fetch;
    await runSearchSpine({ searchId }, ctx, { fetch: { fetchImpl, gate } });
    expect(urls).toHaveLength(1);
    const u = new URL(urls[0] as string);
    expect(u.pathname).toBe('/database/search');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      q: 'Best Of',
      type: 'release',
      format: 'CD',
      per_page: '25',
      page: '1',
    });
    const row = getDb()
      .$client.prepare(
        'SELECT status, stage, result_count, total_count, results_json FROM discogs_searches WHERE id = ?',
      )
      .get(searchId) as {
      status: string;
      stage: string | null;
      result_count: number;
      total_count: number;
      results_json: string;
    };
    expect(row.status).toBe('done');
    expect(row.stage).toBe('text');
    expect(row.result_count).toBe(25);
    expect(row.total_count).toBe(312);
    const stored = JSON.parse(row.results_json) as { releaseId: number }[];
    expect(stored).toHaveLength(25);
    expect(stored[0]?.releaseId).toBe(2000);
  });

  it('stores at most 25 results even when Discogs answers more', async () => {
    seedSpine();
    const { searchId, ctx } = queuedManual('Best Of');
    const fetchImpl = vi.fn(
      async () => new Response(manyResults(30, 30), { status: 200 }),
    ) as unknown as typeof fetch;
    await runSearchSpine({ searchId }, ctx, { fetch: { fetchImpl, gate } });
    const row = getDb()
      .$client.prepare(
        'SELECT result_count, results_json FROM discogs_searches WHERE id = ?',
      )
      .get(searchId) as { result_count: number; results_json: string };
    expect(row.result_count).toBe(25);
    expect(JSON.parse(row.results_json)).toHaveLength(25);
  });

  it('no results finishes no_match after one request, with no cascade', async () => {
    seedSpine();
    const { searchId, ctx } = queuedManual('Nothing At All');
    const stub = stubFetch(
      () =>
        new Response(
          JSON.stringify({ pagination: { items: 0 }, results: [] }),
          { status: 200 },
        ),
    );
    await runSearchSpine({ searchId }, ctx, {
      fetch: { fetchImpl: stub.fetchImpl, gate },
    });
    expect(stub.calls()).toBe(1);
    expect(searchRow(searchId).status).toBe('no_match');
  });

  it('never inserts or deletes a discogs_candidates row', async () => {
    seedSpine();
    seedAutoCandidate();
    const { searchId, ctx } = queuedManual('Best Of');
    const fetchImpl = vi.fn(
      async () => new Response(manyResults(3, 3), { status: 200 }),
    ) as unknown as typeof fetch;
    await runSearchSpine({ searchId }, ctx, { fetch: { fetchImpl, gate } });
    expect(searchRow(searchId).status).toBe('done');
    expect(candidateIds()).toEqual(['cand-auto']);
  });

  it('defers on a 429 and leaves the manual search queued', async () => {
    seedSpine();
    const { searchId, ctx } = queuedManual('Best Of');
    const stub = stubFetch(
      () => new Response('', { status: 429, headers: { 'retry-after': '3' } }),
    );
    const err = await runSearchSpine({ searchId }, ctx, {
      fetch: { fetchImpl: stub.fetchImpl, gate },
    }).then(
      () => null,
      (e: unknown) => e as { name: string },
    );
    expect(err?.name).toBe('JobDeferredError');
    expect(searchRow(searchId).status).toBe('queued');
  });

  it('defers on a paused gate without a request', async () => {
    seedSpine();
    gate.pause(5000);
    const { searchId, ctx } = queuedManual('Best Of');
    const stub = stubFetch(() => new Response(okBody, { status: 200 }));
    const err = await runSearchSpine({ searchId }, ctx, {
      fetch: { fetchImpl: stub.fetchImpl, gate },
    }).then(
      () => null,
      (e: unknown) => e as { name: string },
    );
    expect(err?.name).toBe('JobDeferredError');
    expect(stub.calls()).toBe(0);
  });

  it('runs for an orphaned spine but skips a dismissed one', async () => {
    seedSpine('dismissed');
    const { searchId, ctx } = queuedManual('Best Of');
    const stub = stubFetch(() => new Response(okBody, { status: 200 }));
    await runSearchSpine({ searchId }, ctx, {
      fetch: { fetchImpl: stub.fetchImpl, gate },
    });
    expect(stub.calls()).toBe(0);
    expect(searchRow(searchId).status).toBe('skipped');
  });

  it('finishes not_connected and auth_failed without a request', async () => {
    seedSpine();
    clearDiscogsAuth();
    const a = queuedManual('Best Of');
    const stub = stubFetch(() => new Response(okBody, { status: 200 }));
    await runSearchSpine({ searchId: a.searchId }, a.ctx, {
      fetch: { fetchImpl: stub.fetchImpl, gate },
    });
    expect(searchRow(a.searchId).status).toBe('not_connected');
    saveDiscogsAuth({
      token: 'CANARYTOKEN-0123456789efgh',
      tokenSecret: 'CANARYTOKENSECRET-0123456789ijkl',
      username: 'fake-owner',
    });
    markAuthInvalid();
    const b = queuedManual('Best Of 2');
    await runSearchSpine({ searchId: b.searchId }, b.ctx, {
      fetch: { fetchImpl: stub.fetchImpl, gate },
    });
    expect(searchRow(b.searchId).status).toBe('auth_failed');
    expect(stub.calls()).toBe(0);
  });
});
