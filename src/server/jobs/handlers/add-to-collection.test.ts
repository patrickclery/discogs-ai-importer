import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTempDataDir } from '../../../../test/helpers/temp-data-dir';
import { getDb } from '../../db/client';
import {
  clearAuthInvalid,
  clearDiscogsAuth,
  markAuthInvalid,
  saveDiscogsAuth,
} from '../../discogs/auth';
import { type DiscogsGate, resetDiscogsGateForTests } from '../../discogs/gate';
import { cancelImport, enqueueImport } from '../../imports/store';
import { SECRET_ENV_NAMES, saveSecrets } from '../../secrets';
import { claimNext, failOrRetry } from '../queue';
import type { JobContext } from '../types';
import {
  CHECK_UNSURE_REASON,
  runAddToCollection,
  runCheckImport,
} from './add-to-collection';

// add_to_collection (D-05, D-07, D-09, IMP-03, IMP-04): every attempt reads
// the owner's copies first, adopts a copy its own earlier POST made, holds a
// copy no import records, and only then writes the fenced intent and sends
// the one POST. Each failure class ends with a stored kind. fetchImpl is
// always a stub answering per method and path, and the gate runs on a fake
// clock: never a live API, never a real sleep.

const START = 1_800_000_000_000;
const SPINE = 'spine-1';
const RELEASE = 1031;
const USER = 'fake-owner';
const GET_PATH = `/users/${USER}/collection/releases/${RELEASE}`;
const POST_PATH = `/users/${USER}/collection/folders/1/releases/${RELEASE}`;

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
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-add-to-collection-'));
    process.env.SECRETS_FILE = path.join(dir, 'secrets.json');
    saveSecrets({
      discogsConsumerKey: 'CANARYDISCOGSKEY-0123456789wxyz',
      discogsConsumerSecret: 'CANARYDISCOGSSECRET-0123456789abcd',
    });
    saveDiscogsAuth({
      token: 'CANARYTOKEN-0123456789efgh',
      tokenSecret: 'CANARYTOKENSECRET-0123456789ijkl',
      username: USER,
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

type Copy = { instance_id: number; folder_id?: number; date_added?: string };

/** ISO 8601 at second resolution with an offset, like Discogs. */
function discogsDate(ms: number): string {
  const shifted = new Date(ms - 7 * 3_600_000).toISOString();
  return `${shifted.slice(0, 19)}-07:00`;
}

function copiesResponse(copies: Copy[]): Response {
  const releases = copies.map((c) => ({
    id: RELEASE,
    instance_id: c.instance_id,
    folder_id: c.folder_id ?? 1,
    date_added: c.date_added ?? discogsDate(Date.now()),
    rating: 0,
    basic_information: { id: RELEASE, title: 'Low Orbit' },
  }));
  return new Response(
    JSON.stringify({
      pagination: {
        page: 1,
        pages: 1,
        per_page: 50,
        items: releases.length,
        urls: {},
      },
      releases,
    }),
    { status: 200 },
  );
}

function added(instanceId: number): Response {
  return new Response(
    JSON.stringify({
      instance_id: instanceId,
      resource_url: `https://api.discogs.com/users/${USER}/collection/folders/1/release/${RELEASE}/instance/${instanceId}`,
    }),
    { status: 201 },
  );
}

const status = (code: number, body = '{"message":"no"}') =>
  new Response(body, { status: code });

type Call = { method: string; path: string };
type Answer = Response | Error;
type Router = (call: Call, n: { get: number; post: number }) => Answer;

/** A fetchImpl answering per method and path, logging every call. */
function stubFetch(router: Router) {
  const calls: Call[] = [];
  const n = { get: 0, post: 0 };
  const fetchImpl = vi.fn(
    async (url: string | URL, init?: RequestInit): Promise<Response> => {
      const call = {
        method: (init?.method ?? 'GET').toUpperCase(),
        path: new URL(String(url)).pathname,
      };
      calls.push(call);
      if (call.method === 'POST') n.post++;
      else n.get++;
      const answer = router(call, n);
      if (answer instanceof Error) throw answer;
      return answer;
    },
  ) as unknown as typeof fetch;
  return {
    fetchImpl,
    calls,
    gets: () => calls.filter((c) => c.method === 'GET'),
    posts: () => calls.filter((c) => c.method === 'POST'),
  };
}

/** GET answers with these copies; POST with the given answer. */
function route(get: () => Answer, post: () => Answer): Router {
  return (call) => (call.method === 'POST' ? post() : get());
}

function seedSpine(state = 'active', id = SPINE): void {
  const db = getDb().$client;
  const now = Date.now();
  db.prepare(
    `INSERT OR IGNORE INTO photos (id, sha256, original_name, mime, bytes,
       original_path, created_at, updated_at)
     VALUES ('photo-1', 'abc', 'shelf.jpg', 'image/jpeg', 1, 'photos/x.jpg', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO spines (id, photo_id, state, created_at, updated_at)
     VALUES (?, 'photo-1', ?, ?, ?)`,
  ).run(id, state, now, now);
}

type ImportSeed = {
  spineId?: string;
  status?: string;
  allowDuplicate?: boolean;
  intentAt?: number | null;
  snapshot?: number[] | null;
  instanceId?: number | null;
  postCount?: number;
  errorKind?: string | null;
};

function insertImport(seed: ImportSeed = {}): string {
  const db = getDb().$client;
  const id = `imp-${Math.random().toString(36).slice(2, 10)}`;
  const now = Date.now();
  db.prepare(
    `INSERT INTO imports (id, spine_id, release_id, folder_id, status,
       allow_duplicate, instance_id, intent_at, snapshot_json, post_count,
       error_kind, created_at, updated_at)
     VALUES (@id, @spineId, @releaseId, 1, @status, @allowDuplicate,
       @instanceId, @intentAt, @snapshot, @postCount, @errorKind, @now, @now)`,
  ).run({
    id,
    spineId: seed.spineId ?? SPINE,
    releaseId: RELEASE,
    status: seed.status ?? 'pending',
    allowDuplicate: seed.allowDuplicate ? 1 : 0,
    instanceId: seed.instanceId ?? null,
    intentAt: seed.intentAt ?? null,
    snapshot:
      seed.snapshot === undefined || seed.snapshot === null
        ? null
        : JSON.stringify(seed.snapshot),
    postCount: seed.postCount ?? 0,
    errorKind: seed.errorKind ?? null,
    now,
  });
  return id;
}

function ctxOf(claimed: NonNullable<ReturnType<typeof claimNext>>) {
  return {
    job: claimed,
    signal: new AbortController().signal,
    isCurrent: () => true,
  } satisfies JobContext;
}

/** An import with its job enqueued and claimed like the worker does. */
function queuedImport(seed: ImportSeed = {}): {
  importId: string;
  ctx: JobContext;
} {
  const importId = insertImport(seed);
  enqueueImport(getDb().$client, importId);
  const claimed = claimNext('discogs');
  if (!claimed) throw new Error('no job claimed');
  return { importId, ctx: ctxOf(claimed) };
}

/** The worker's retry: failOrRetry, then a later claim of the same job. */
function retryClaim(ctx: JobContext, err: unknown): JobContext {
  const outcome = failOrRetry(ctx.job.id, err, Date.now(), ctx.job.attempts);
  expect(outcome).toBe('queued');
  const claimed = claimNext('discogs', Date.now() + 60_000);
  if (!claimed || claimed.id !== ctx.job.id) throw new Error('no re-claim');
  return ctxOf(claimed);
}

type ImportRow = {
  status: string;
  instance_id: number | null;
  folder_id: number;
  adopted: number;
  intent_at: number | null;
  snapshot_json: string | null;
  existing_json: string | null;
  post_count: number;
  error_kind: string | null;
  error: string | null;
  imported_at: number | null;
};

function importRow(id: string): ImportRow {
  return getDb()
    .$client.prepare('SELECT * FROM imports WHERE id = ?')
    .get(id) as ImportRow;
}

function dedupeKey(jobId: string): string | null {
  return (
    getDb()
      .$client.prepare('SELECT dedupe_key FROM jobs WHERE id = ?')
      .get(jobId) as { dedupe_key: string | null }
  ).dedupe_key;
}

async function errorOf(p: Promise<unknown>): Promise<Record<string, unknown>> {
  return p.then(
    () => {
      throw new Error('expected a rejection');
    },
    (e: unknown) => e as Record<string, unknown>,
  );
}

describe('add_to_collection handler', () => {
  useTempDataDir();
  useTempSecrets();
  let gate: DiscogsGate;
  let clock: ReturnType<typeof fakeClock>;

  beforeEach(() => {
    clock = fakeClock();
    gate = resetDiscogsGateForTests(clock);
  });

  function run(importId: string, ctx: JobContext, router: Router) {
    const stub = stubFetch(router);
    const result = runAddToCollection({ importId }, ctx, {
      fetch: { fetchImpl: stub.fetchImpl, gate },
    });
    return { stub, result };
  }

  it('a confirmed release with no copies reads once, posts once and records the copy', async () => {
    seedSpine();
    const { importId, ctx } = queuedImport();
    const { stub, result } = run(
      importId,
      ctx,
      route(
        () => copiesResponse([]),
        () => added(7001),
      ),
    );
    await expect(result).resolves.toBeUndefined();
    expect(stub.calls).toEqual([
      { method: 'GET', path: GET_PATH },
      { method: 'POST', path: POST_PATH },
    ]);
    const row = importRow(importId);
    expect(row).toMatchObject({
      status: 'imported',
      instance_id: 7001,
      folder_id: 1,
      adopted: 0,
      post_count: 1,
      error_kind: null,
    });
    expect(row.intent_at).not.toBeNull();
    expect(JSON.parse(row.snapshot_json ?? 'null')).toEqual([]);
  });

  it('a 429 on the read defers without spending an attempt and leaves the import pending', async () => {
    seedSpine();
    const { importId, ctx } = queuedImport();
    const { stub, result } = run(
      importId,
      ctx,
      route(
        () =>
          new Response('', { status: 429, headers: { 'retry-after': '4' } }),
        () => added(7001),
      ),
    );
    const err = await errorOf(result);
    expect(err.name).toBe('JobDeferredError');
    expect(err.runAfter).toBe(clock.t + 4000);
    expect(stub.posts()).toHaveLength(0);
    expect(importRow(importId)).toMatchObject({
      status: 'pending',
      error_kind: null,
      post_count: 0,
    });
  });

  it('a 429 on the add defers and takes back the intent it wrote: Discogs created nothing (CR-01)', async () => {
    seedSpine();
    const { importId, ctx } = queuedImport();
    const { stub, result } = run(
      importId,
      ctx,
      route(
        () => copiesResponse([]),
        () => new Response('', { status: 429 }),
      ),
    );
    const err = await errorOf(result);
    expect(err.name).toBe('JobDeferredError');
    expect(stub.posts()).toHaveLength(1);
    expect(importRow(importId)).toMatchObject({
      status: 'pending',
      intent_at: null,
      snapshot_json: null,
      post_count: 0,
    });
  });

  it("a 429 on a retry's add restores the earlier intent, not none (CR-01)", async () => {
    seedSpine();
    const intentAt = Date.now() - 5_000;
    const { importId, ctx } = queuedImport({
      status: 'importing',
      intentAt,
      snapshot: [],
      postCount: 1,
    });
    const { stub, result } = run(
      importId,
      ctx,
      route(
        () => copiesResponse([]),
        () => new Response('', { status: 429 }),
      ),
    );
    await expect(result).rejects.toMatchObject({ name: 'JobDeferredError' });
    expect(stub.posts()).toHaveLength(1);
    expect(importRow(importId)).toMatchObject({
      status: 'importing',
      intent_at: intentAt,
      snapshot_json: '[]',
      post_count: 1,
    });
  });

  it('a pause set after the read defers before the intent: no intent, no POST (CR-01)', async () => {
    seedSpine();
    const { importId, ctx } = queuedImport();
    const { stub, result } = run(importId, ctx, (call) => {
      if (call.method === 'POST') return added(7001);
      // Another request's 429 pauses the gate while this read is answered.
      gate.pause(5_000);
      return copiesResponse([]);
    });
    await expect(result).rejects.toMatchObject({ name: 'JobDeferredError' });
    expect(stub.posts()).toHaveLength(0);
    expect(importRow(importId)).toMatchObject({
      status: 'pending',
      intent_at: null,
      post_count: 0,
    });
  });

  it('a 404 on the read of an import whose intent is written fails other, never rejected (CR-01)', async () => {
    seedSpine();
    const { importId, ctx } = queuedImport({
      status: 'importing',
      intentAt: Date.now() - 5_000,
      snapshot: [],
      postCount: 1,
    });
    const { stub, result } = run(
      importId,
      ctx,
      route(
        () => status(404),
        () => added(7001),
      ),
    );
    await expect(result).resolves.toBeUndefined();
    expect(stub.posts()).toHaveLength(0);
    expect(importRow(importId)).toMatchObject({
      status: 'failed',
      error_kind: 'other',
    });
  });

  it('a 401 on the read ends the import failed with auth and releases the dedupe key', async () => {
    seedSpine();
    const { importId, ctx } = queuedImport();
    const { stub, result } = run(
      importId,
      ctx,
      route(
        () => status(401),
        () => added(7001),
      ),
    );
    await expect(result).resolves.toBeUndefined();
    expect(stub.posts()).toHaveLength(0);
    expect(importRow(importId)).toMatchObject({
      status: 'failed',
      error_kind: 'auth',
    });
    expect(dedupeKey(ctx.job.id)).toBeNull();
  });

  it('a 403 on the read ends the import failed with auth and releases the dedupe key', async () => {
    seedSpine();
    const { importId, ctx } = queuedImport();
    const { stub, result } = run(
      importId,
      ctx,
      route(
        () => status(403),
        () => added(7001),
      ),
    );
    await expect(result).resolves.toBeUndefined();
    expect(stub.posts()).toHaveLength(0);
    expect(importRow(importId)).toMatchObject({
      status: 'failed',
      error_kind: 'auth',
    });
    expect(dedupeKey(ctx.job.id)).toBeNull();
  });

  it('a 403 on the add ends the import failed with auth', async () => {
    seedSpine();
    const { importId, ctx } = queuedImport();
    const { result } = run(
      importId,
      ctx,
      route(
        () => copiesResponse([]),
        () => status(403),
      ),
    );
    await expect(result).resolves.toBeUndefined();
    expect(importRow(importId)).toMatchObject({
      status: 'failed',
      error_kind: 'auth',
    });
    expect(dedupeKey(ctx.job.id)).toBeNull();
  });

  it('a 404 on the add ends the import failed with not_found', async () => {
    seedSpine();
    const { importId, ctx } = queuedImport();
    const { stub, result } = run(
      importId,
      ctx,
      route(
        () => copiesResponse([]),
        () => status(404),
      ),
    );
    await expect(result).resolves.toBeUndefined();
    expect(stub.posts()).toHaveLength(1);
    const row = importRow(importId);
    expect(row).toMatchObject({ status: 'failed', error_kind: 'not_found' });
    expect(row.error).not.toContain(USER);
    expect(dedupeKey(ctx.job.id)).toBeNull();
  });

  it('a 422 on the add ends the import failed with rejected', async () => {
    seedSpine();
    const { importId, ctx } = queuedImport();
    const { result } = run(
      importId,
      ctx,
      route(
        () => copiesResponse([]),
        () =>
          status(
            422,
            '{"detail":[{"loc":["path","release_id"]}],"message":"See detail"}',
          ),
      ),
    );
    await expect(result).resolves.toBeUndefined();
    const row = importRow(importId);
    expect(row).toMatchObject({ status: 'failed', error_kind: 'rejected' });
    expect(row.error).toContain('422');
    expect(row.error).not.toContain('detail');
  });

  it('another 4xx on the add ends the import failed with rejected', async () => {
    seedSpine();
    const { importId, ctx } = queuedImport();
    const { result } = run(
      importId,
      ctx,
      route(
        () => copiesResponse([]),
        () => status(409),
      ),
    );
    await expect(result).resolves.toBeUndefined();
    expect(importRow(importId)).toMatchObject({
      status: 'failed',
      error_kind: 'rejected',
    });
  });

  it('a 5xx on the read records unavailable and rethrows, keeping the status', async () => {
    seedSpine();
    const { importId, ctx } = queuedImport();
    const { stub, result } = run(
      importId,
      ctx,
      route(
        () => status(502, ''),
        () => added(7001),
      ),
    );
    const err = await errorOf(result);
    expect(err.name).toBe('DiscogsUnavailableError');
    expect(stub.posts()).toHaveLength(0);
    const row = importRow(importId);
    expect(row).toMatchObject({ status: 'pending', error_kind: 'unavailable' });
    expect(row.error).toContain('502');
    expect(row.error).not.toContain(USER);
  });

  it('a network error on the add records unavailable and rethrows, keeping importing', async () => {
    seedSpine();
    const { importId, ctx } = queuedImport();
    const { result } = run(
      importId,
      ctx,
      route(
        () => copiesResponse([]),
        () => new TypeError('fetch failed'),
      ),
    );
    const err = await errorOf(result);
    expect(err.name).toBe('DiscogsUnavailableError');
    expect(importRow(importId)).toMatchObject({
      status: 'importing',
      error_kind: 'unavailable',
      post_count: 1,
    });
  });

  it('an unexpected collection body records other and rethrows', async () => {
    seedSpine();
    const { importId, ctx } = queuedImport();
    const { stub, result } = run(
      importId,
      ctx,
      route(
        () => new Response('{"releases":"nope"}', { status: 200 }),
        () => added(7001),
      ),
    );
    await expect(result).rejects.toThrow(/unexpected collection body/);
    expect(stub.posts()).toHaveLength(0);
    expect(importRow(importId)).toMatchObject({
      status: 'pending',
      error_kind: 'other',
    });
  });

  it('after an add that timed out, the retry reads once and adopts the copy without a second POST', async () => {
    seedSpine();
    const { importId, ctx } = queuedImport();
    const first = run(
      importId,
      ctx,
      route(
        () => copiesResponse([]),
        () => new DOMException('The operation timed out.', 'TimeoutError'),
      ),
    );
    const err = await errorOf(first.result);
    expect(err.name).toBe('DiscogsUnavailableError');
    expect(importRow(importId).status).toBe('importing');

    // Discogs carried the add out: the copy is there on the retry.
    const ctx2 = retryClaim(ctx, err);
    expect(ctx2.job.attempts).toBe(2);
    const second = run(
      importId,
      ctx2,
      route(
        () => copiesResponse([{ instance_id: 7001 }]),
        () => added(7002),
      ),
    );
    await expect(second.result).resolves.toBeUndefined();
    expect(second.stub.gets()).toHaveLength(1);
    expect(second.stub.posts()).toHaveLength(0);
    expect(importRow(importId)).toMatchObject({
      status: 'imported',
      instance_id: 7001,
      adopted: 1,
      post_count: 1,
      error_kind: null,
      error: null,
    });
  });

  it('a 201 without an instance_id records an error and the retry adopts the copy', async () => {
    seedSpine();
    const { importId, ctx } = queuedImport();
    const first = run(
      importId,
      ctx,
      route(
        () => copiesResponse([]),
        () => new Response('{}', { status: 201 }),
      ),
    );
    const err = await errorOf(first.result);
    expect(String(err.message)).toMatch(/unexpected add body/);
    expect(importRow(importId)).toMatchObject({
      status: 'importing',
      error_kind: 'other',
      instance_id: null,
    });

    const ctx2 = retryClaim(ctx, err);
    const second = run(
      importId,
      ctx2,
      route(
        () => copiesResponse([{ instance_id: 7001 }]),
        () => added(7002),
      ),
    );
    await expect(second.result).resolves.toBeUndefined();
    expect(second.stub.posts()).toHaveLength(0);
    expect(importRow(importId)).toMatchObject({
      status: 'imported',
      instance_id: 7001,
      adopted: 1,
      post_count: 1,
    });
  });

  it('after a crash with the intent written, the next attempt adopts and never posts', async () => {
    seedSpine();
    const intentAt = Date.now() - 5_000;
    const { importId, ctx } = queuedImport({
      status: 'importing',
      intentAt,
      snapshot: [6001],
      postCount: 1,
    });
    const { stub, result } = run(
      importId,
      ctx,
      route(
        () =>
          copiesResponse([
            {
              instance_id: 6001,
              date_added: discogsDate(intentAt - 3_600_000),
            },
            { instance_id: 7001 },
          ]),
        () => added(7002),
      ),
    );
    await expect(result).resolves.toBeUndefined();
    expect(stub.posts()).toHaveLength(0);
    expect(importRow(importId)).toMatchObject({
      status: 'imported',
      instance_id: 7001,
      adopted: 1,
      post_count: 1,
    });
  });

  it('a local clock minutes ahead of Discogs cannot hide the landed copy: one page adopts it, never a second POST (WR-04)', async () => {
    seedSpine();
    // The intent was stamped 10 minutes ahead of Discogs's date_added.
    const intentAt = Date.now() + 600_000;
    const { importId, ctx } = queuedImport({
      status: 'importing',
      allowDuplicate: true,
      intentAt,
      snapshot: [6001],
      postCount: 1,
    });
    const { stub, result } = run(
      importId,
      ctx,
      route(
        () =>
          copiesResponse([
            { instance_id: 6001, date_added: discogsDate(Date.now() - 1e7) },
            { instance_id: 7001, date_added: discogsDate(Date.now()) },
          ]),
        () => added(7002),
      ),
    );
    await expect(result).resolves.toBeUndefined();
    expect(stub.posts()).toHaveLength(0);
    expect(importRow(importId)).toMatchObject({
      status: 'imported',
      instance_id: 7001,
      adopted: 1,
      post_count: 1,
    });
  });

  it('allow_duplicate with an unplaced copy past one page holds instead of posting again (WR-04)', async () => {
    seedSpine();
    const intentAt = Date.now() + 600_000;
    const { importId, ctx } = queuedImport({
      status: 'importing',
      allowDuplicate: true,
      intentAt,
      snapshot: [6001],
      postCount: 1,
    });
    const { stub, result } = run(importId, ctx, (call) => {
      if (call.method === 'POST') return added(7002);
      return new Response(
        JSON.stringify({
          pagination: { page: 1, pages: 2, per_page: 50, items: 51, urls: {} },
          releases: [
            {
              id: RELEASE,
              instance_id: 7001,
              folder_id: 1,
              date_added: discogsDate(Date.now()),
            },
          ],
        }),
        { status: 200 },
      );
    });
    await expect(result).resolves.toBeUndefined();
    expect(stub.posts()).toHaveLength(0);
    expect(importRow(importId).status).toBe('already_in_collection');
  });

  it('a retry keeps the earlier snapshot and adds the copies seen now (WR-04)', async () => {
    seedSpine();
    const { importId, ctx } = queuedImport({
      status: 'importing',
      allowDuplicate: true,
      intentAt: Date.now() - 5_000,
      snapshot: [6001, 6005],
      postCount: 1,
    });
    const { stub, result } = run(
      importId,
      ctx,
      route(
        () =>
          copiesResponse([
            { instance_id: 6001, date_added: discogsDate(Date.now() - 1e7) },
          ]),
        () => added(7001),
      ),
    );
    await expect(result).resolves.toBeUndefined();
    expect(stub.posts()).toHaveLength(1);
    expect(importRow(importId)).toMatchObject({
      status: 'imported',
      instance_id: 7001,
      snapshot_json: '[6001,6005]',
      post_count: 2,
    });
  });

  it('a copy no import records holds already_in_collection with no POST, ascending existing_json and a released key', async () => {
    seedSpine();
    const { importId, ctx } = queuedImport();
    const { stub, result } = run(
      importId,
      ctx,
      route(
        () =>
          copiesResponse([
            { instance_id: 9002, date_added: '2016-01-02T10:00:00-08:00' },
            {
              instance_id: 9001,
              folder_id: 3,
              date_added: '2015-11-30T10:54:13-08:00',
            },
          ]),
        () => added(7001),
      ),
    );
    await expect(result).resolves.toBeUndefined();
    expect(stub.posts()).toHaveLength(0);
    const row = importRow(importId);
    expect(row.status).toBe('already_in_collection');
    expect(row.post_count).toBe(0);
    expect(JSON.parse(row.existing_json ?? 'null')).toEqual([
      {
        instanceId: 9001,
        folderId: 3,
        dateAdded: '2015-11-30T10:54:13-08:00',
      },
      {
        instanceId: 9002,
        folderId: 1,
        dateAdded: '2016-01-02T10:00:00-08:00',
      },
    ]);
    expect(dedupeKey(ctx.job.id)).toBeNull();
  });

  it('allow_duplicate 1 posts once even with a copy already in the collection', async () => {
    seedSpine();
    const { importId, ctx } = queuedImport({ allowDuplicate: true });
    const { stub, result } = run(
      importId,
      ctx,
      route(
        () =>
          copiesResponse([
            { instance_id: 9001, date_added: '2015-11-30T10:54:13-08:00' },
          ]),
        () => added(7001),
      ),
    );
    await expect(result).resolves.toBeUndefined();
    expect(stub.posts()).toHaveLength(1);
    const row = importRow(importId);
    expect(row).toMatchObject({
      status: 'imported',
      instance_id: 7001,
      post_count: 1,
    });
    expect(JSON.parse(row.snapshot_json ?? 'null')).toEqual([9001]);
  });

  it.each(['superseded', 'dismissed'])(
    'a %s spine fails removed without a request',
    async (state) => {
      seedSpine(state);
      const { importId, ctx } = queuedImport();
      const { stub, result } = run(
        importId,
        ctx,
        route(
          () => copiesResponse([]),
          () => added(7001),
        ),
      );
      await expect(result).resolves.toBeUndefined();
      expect(stub.calls).toHaveLength(0);
      expect(importRow(importId)).toMatchObject({
        status: 'failed',
        error_kind: 'removed',
      });
      expect(dedupeKey(ctx.job.id)).toBeNull();
    },
  );

  it('no sign-in fails auth without a request', async () => {
    seedSpine();
    clearDiscogsAuth();
    const { importId, ctx } = queuedImport();
    const { stub, result } = run(
      importId,
      ctx,
      route(
        () => copiesResponse([]),
        () => added(7001),
      ),
    );
    await expect(result).resolves.toBeUndefined();
    expect(stub.calls).toHaveLength(0);
    expect(importRow(importId)).toMatchObject({
      status: 'failed',
      error_kind: 'auth',
    });
  });

  it('a known-invalid sign-in fails auth without a request', async () => {
    seedSpine();
    markAuthInvalid();
    const { importId, ctx } = queuedImport();
    const { stub, result } = run(
      importId,
      ctx,
      route(
        () => copiesResponse([]),
        () => added(7001),
      ),
    );
    await expect(result).resolves.toBeUndefined();
    expect(stub.calls).toHaveLength(0);
    expect(importRow(importId)).toMatchObject({
      status: 'failed',
      error_kind: 'auth',
    });
  });

  describe('another import of the same release still being resolved (WR-05)', () => {
    /** Spine 2's import posted, its answer was lost, its job is on backoff. */
    function unresolvedSibling(): { siblingJob: string; runAfter: number } {
      seedSpine('active', 'spine-2');
      const siblingId = insertImport({
        spineId: 'spine-2',
        status: 'importing',
        intentAt: Date.now() - 5_000,
        snapshot: [],
        postCount: 1,
      });
      const job = enqueueImport(getDb().$client, siblingId);
      const runAfter = Date.now() + 60_000;
      getDb()
        .$client.prepare('UPDATE jobs SET run_after = ? WHERE id = ?')
        .run(runAfter, job.id);
      return { siblingJob: job.id, runAfter };
    }

    it('an import with no intent waits for it, with no request', async () => {
      seedSpine();
      const { runAfter } = unresolvedSibling();
      const { importId, ctx } = queuedImport();
      const { stub, result } = run(
        importId,
        ctx,
        route(
          () => copiesResponse([{ instance_id: 7001 }]),
          () => added(7002),
        ),
      );
      const err = await errorOf(result);
      expect(err.name).toBe('JobDeferredError');
      expect(err.runAfter).toBe(runAfter + 1_000);
      expect(stub.calls).toHaveLength(0);
      expect(importRow(importId)).toMatchObject({
        status: 'pending',
        intent_at: null,
        existing_json: null,
      });
    });

    it("does not wait once that import's job has given up", async () => {
      seedSpine();
      const { siblingJob } = unresolvedSibling();
      getDb()
        .$client.prepare(`UPDATE jobs SET status = 'failed' WHERE id = ?`)
        .run(siblingJob);
      const { importId, ctx } = queuedImport();
      const { stub, result } = run(
        importId,
        ctx,
        route(
          () => copiesResponse([]),
          () => added(7002),
        ),
      );
      await expect(result).resolves.toBeUndefined();
      expect(stub.gets()).toHaveLength(1);
      expect(importRow(importId).status).toBe('imported');
    });

    it('an import with its own intent never waits, so two imports never wait on each other', async () => {
      seedSpine();
      unresolvedSibling();
      const { importId, ctx } = queuedImport({
        status: 'importing',
        intentAt: Date.now() - 5_000,
        snapshot: [],
        postCount: 1,
      });
      const { stub, result } = run(
        importId,
        ctx,
        route(
          () => copiesResponse([]),
          () => added(7002),
        ),
      );
      await expect(result).resolves.toBeUndefined();
      expect(stub.gets()).toHaveLength(1);
    });
  });

  it('a paused gate defers without a request', async () => {
    seedSpine();
    gate.pause(5000);
    const { importId, ctx } = queuedImport();
    const { stub, result } = run(
      importId,
      ctx,
      route(
        () => copiesResponse([]),
        () => added(7001),
      ),
    );
    await expect(result).rejects.toMatchObject({ name: 'JobDeferredError' });
    expect(stub.calls).toHaveLength(0);
    expect(importRow(importId).status).toBe('pending');
  });

  it('an instance id another import already records fails other with no second POST', async () => {
    seedSpine();
    seedSpine('active', 'spine-2');
    insertImport({
      spineId: 'spine-2',
      status: 'imported',
      instanceId: 7001,
      postCount: 1,
    });
    const { importId, ctx } = queuedImport();
    const { stub, result } = run(
      importId,
      ctx,
      route(
        () => copiesResponse([]),
        () => added(7001),
      ),
    );
    await expect(result).resolves.toBeUndefined();
    expect(stub.posts()).toHaveLength(1);
    expect(importRow(importId)).toMatchObject({
      status: 'failed',
      error_kind: 'other',
      instance_id: null,
    });
    expect(dedupeKey(ctx.job.id)).toBeNull();
  });

  it.each([
    [
      'attempts changed',
      `UPDATE jobs SET attempts = attempts + 1 WHERE id = @id`,
    ],
    [
      'the job was requeued',
      `UPDATE jobs SET status = 'queued' WHERE id = @id`,
    ],
  ])(
    'the intent refuses a claim that is no longer current (%s) and sends no POST',
    async (_what, sql) => {
      seedSpine();
      const { importId, ctx } = queuedImport();
      getDb().$client.prepare(sql).run({ id: ctx.job.id });
      const { stub, result } = run(
        importId,
        ctx,
        route(
          () => copiesResponse([]),
          () => added(7001),
        ),
      );
      await expect(result).rejects.toMatchObject({ name: 'NotCurrentError' });
      expect(stub.posts()).toHaveLength(0);
      expect(importRow(importId)).toMatchObject({
        status: 'pending',
        intent_at: null,
        post_count: 0,
      });
    },
  );

  it('a terminal answer writes nothing once the claim is lost', async () => {
    seedSpine();
    const { importId, ctx } = queuedImport();
    let lost = false;
    const lossy: JobContext = { ...ctx, isCurrent: () => !lost };
    const { result } = run(importId, lossy, (call) => {
      if (call.method === 'GET') return copiesResponse([]);
      lost = true;
      return status(404);
    });
    await expect(result).rejects.toMatchObject({
      name: 'DiscogsNotFoundError',
    });
    expect(importRow(importId)).toMatchObject({
      status: 'importing',
      error_kind: null,
    });
  });
});

describe('check_import (Change match on a failed import that may have landed, CR-01)', () => {
  useTempDataDir();
  useTempSecrets();
  let gate: DiscogsGate;
  let clock: ReturnType<typeof fakeClock>;

  beforeEach(() => {
    clock = fakeClock();
    gate = resetDiscogsGateForTests(clock);
  });

  /** A failed import with an intent, Change match sent, its check claimed. */
  function checkingImport(seed: ImportSeed = {}): {
    importId: string;
    ctx: JobContext;
  } {
    const importId = insertImport({
      status: 'failed',
      intentAt: Date.now() - 5_000,
      snapshot: [6001],
      postCount: 1,
      errorKind: 'unavailable',
      ...seed,
    });
    const res = cancelImport(getDb().$client, seed.spineId ?? SPINE);
    expect(res.status).toBe('checking');
    const claimed = claimNext('discogs');
    if (!claimed) throw new Error('no job claimed');
    expect(claimed.type).toBe('check_import');
    return { importId, ctx: ctxOf(claimed) };
  }

  function check(importId: string, ctx: JobContext, router: Router) {
    const stub = stubFetch(router);
    const result = runCheckImport({ importId }, ctx, {
      fetch: { fetchImpl: stub.fetchImpl, gate },
    });
    return { stub, result };
  }

  const preexisting = () => ({
    instance_id: 6001,
    date_added: discogsDate(Date.now() - 3_600_000),
  });

  it('nothing landed: one read, never a POST, the import is deleted and the key freed', async () => {
    seedSpine();
    const { importId, ctx } = checkingImport();
    const { stub, result } = check(
      importId,
      ctx,
      route(
        () => copiesResponse([preexisting()]),
        () => added(7001),
      ),
    );
    await expect(result).resolves.toBeUndefined();
    expect(stub.calls).toEqual([{ method: 'GET', path: GET_PATH }]);
    expect(
      getDb()
        .$client.prepare('SELECT 1 FROM imports WHERE id = ?')
        .get(importId),
    ).toBeUndefined();
    expect(dedupeKey(ctx.job.id)).toBeNull();
  });

  it('a copy that landed is adopted, never a POST', async () => {
    seedSpine();
    const { importId, ctx } = checkingImport();
    const { stub, result } = check(
      importId,
      ctx,
      route(
        () => copiesResponse([preexisting(), { instance_id: 7001 }]),
        () => added(7002),
      ),
    );
    await expect(result).resolves.toBeUndefined();
    expect(stub.posts()).toHaveLength(0);
    expect(importRow(importId)).toMatchObject({
      status: 'imported',
      instance_id: 7001,
      adopted: 1,
      post_count: 1,
    });
  });

  it('more than one page of copies cannot prove nothing landed: failed other, row kept, no POST', async () => {
    seedSpine();
    const { importId, ctx } = checkingImport();
    const { stub, result } = check(importId, ctx, (call) => {
      if (call.method === 'POST') return added(7001);
      return new Response(
        JSON.stringify({
          pagination: { page: 1, pages: 2, per_page: 50, items: 51, urls: {} },
          releases: [],
        }),
        { status: 200 },
      );
    });
    await expect(result).resolves.toBeUndefined();
    expect(stub.posts()).toHaveLength(0);
    expect(importRow(importId)).toMatchObject({
      status: 'failed',
      error_kind: 'other',
      error: CHECK_UNSURE_REASON,
    });
    expect(dedupeKey(ctx.job.id)).toBeNull();
  });

  it('a 404 on the read fails other, never rejected, so Change match stays refused', async () => {
    seedSpine();
    const { importId, ctx } = checkingImport();
    const { stub, result } = check(
      importId,
      ctx,
      route(
        () => status(404),
        () => added(7001),
      ),
    );
    await expect(result).resolves.toBeUndefined();
    expect(stub.posts()).toHaveLength(0);
    expect(importRow(importId)).toMatchObject({
      status: 'failed',
      error_kind: 'other',
    });
    expect(cancelImport(getDb().$client, SPINE).status).toBe('checking');
  });

  it('a 429 on the read defers and leaves the check pending', async () => {
    seedSpine();
    const { importId, ctx } = checkingImport();
    const { stub, result } = check(
      importId,
      ctx,
      route(
        () => new Response('', { status: 429 }),
        () => added(7001),
      ),
    );
    await expect(result).rejects.toMatchObject({ name: 'JobDeferredError' });
    expect(stub.posts()).toHaveLength(0);
    expect(importRow(importId).status).toBe('pending');
  });

  it('a check whose import was re-queued by another job does nothing', async () => {
    seedSpine();
    const { importId, ctx } = checkingImport();
    getDb()
      .$client.prepare(`UPDATE imports SET job_id = 'other-job' WHERE id = ?`)
      .run(importId);
    const { stub, result } = check(
      importId,
      ctx,
      route(
        () => copiesResponse([]),
        () => added(7001),
      ),
    );
    await expect(result).resolves.toBeUndefined();
    expect(stub.calls).toHaveLength(0);
    expect(importRow(importId).status).toBe('pending');
  });
});
