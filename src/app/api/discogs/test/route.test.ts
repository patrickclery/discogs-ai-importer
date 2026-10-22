import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

// The real discogsFetch (so classification and the auth-invalid flag are
// the client's own) behind a spy, always over a stubbed fetch: never a live
// API (CLAUDE.md).
const stub = vi.hoisted(() => ({
  respond: null as null | (() => Response | Promise<Response>),
}));
vi.mock('@/server/discogs/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/server/discogs/client')>();
  return {
    ...real,
    discogsFetch: vi.fn(
      (
        req: Parameters<typeof real.discogsFetch>[0],
        deps: Parameters<typeof real.discogsFetch>[1] = {},
      ) =>
        real.discogsFetch(req, {
          ...deps,
          fetchImpl: (async () => {
            if (!stub.respond) throw new Error('no stubbed response');
            return stub.respond();
          }) as unknown as typeof fetch,
        }),
    ),
  };
});

import { getDb } from '@/server/db/client';
import {
  clearAuthInvalid,
  isAuthInvalid,
  markAuthInvalid,
  saveDiscogsAuth,
} from '@/server/discogs/auth';
import { discogsFetch } from '@/server/discogs/client';
import { enqueueMissingSearches } from '@/server/discogs/enqueue';
import { resetDiscogsGateForTests } from '@/server/discogs/gate';
import { finishSearch } from '@/server/discogs/store';
import { releaseDedupeKey } from '@/server/jobs/queue';
import { SECRET_ENV_NAMES, saveSecrets } from '@/server/secrets';
import { orphanScenario } from '../../../../../test/helpers/scan-runs';
import { useTempDataDir } from '../../../../../test/helpers/temp-data-dir';
import { POST } from './route';

// POST /api/discogs/test (D-01, T-03-10, T-03-11): JSON only (415), 409
// without a connection, busy without a request while paused, rejected on a
// 401 (and Reconnect needed turns on), and no token or secret in any body.

const CANARY_KEY = 'CANARYDISCOGSKEY-0123456789wxyz';
const CANARY_SECRET = 'CANARYDISCOGSSECRET-0123456789abcd';
const CANARY_TOKEN = 'CANARYTOKEN-0123456789efgh';
const CANARY_TOKEN_SECRET = 'CANARYTOKENSECRET-0123456789ijkl';

function post(body: unknown = {}, contentType = 'application/json'): Request {
  return new Request('http://127.0.0.1:3000/api/discogs/test', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: JSON.stringify(body),
  });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function call(req: Request = post()) {
  const res = await POST(req);
  const text = await res.text();
  for (const canary of [CANARY_SECRET, CANARY_TOKEN, CANARY_TOKEN_SECRET]) {
    expect(text).not.toContain(canary);
  }
  return { status: res.status, body: JSON.parse(text) as unknown };
}

function connect(): void {
  saveDiscogsAuth({
    token: CANARY_TOKEN,
    tokenSecret: CANARY_TOKEN_SECRET,
    username: 'fake-owner',
  });
}

describe('POST /api/discogs/test', () => {
  // A passing test backfills: never against the owner's data/app.db (T-03-49).
  useTempDataDir();
  let dir = '';
  const names = ['SECRETS_FILE', ...Object.values(SECRET_ENV_NAMES)];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const n of names) {
      saved[n] = process.env[n];
      delete process.env[n];
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-discogs-test-'));
    process.env.SECRETS_FILE = path.join(dir, 'secrets.json');
    saveSecrets({
      discogsConsumerKey: CANARY_KEY,
      discogsConsumerSecret: CANARY_SECRET,
    });
    let t = 1_800_000_000_000;
    resetDiscogsGateForTests({
      now: () => t,
      sleep: async (ms: number) => {
        t += ms;
      },
    });
    stub.respond = null;
    vi.mocked(discogsFetch).mockClear();
  });

  afterEach(() => {
    for (const n of names) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('415 for text/plain, without a request', async () => {
    connect();
    const { status } = await call(post({}, 'text/plain'));
    expect(status).toBe(415);
    expect(discogsFetch).not.toHaveBeenCalled();
  });

  it('400 for a body with extra keys', async () => {
    connect();
    expect((await call(post({ token: 'x' }))).status).toBe(400);
  });

  it('409 not_connected without a stored connection', async () => {
    const { status, body } = await call();
    expect(status).toBe(409);
    expect(body).toEqual({ error: 'not_connected' });
    expect(discogsFetch).not.toHaveBeenCalled();
  });

  it('busy without calling discogsFetch while the gate is paused', async () => {
    connect();
    resetDiscogsGateForTests().pause(60_000);
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body).toEqual({ ok: false, kind: 'busy' });
    expect(discogsFetch).not.toHaveBeenCalled();
  });

  it('ok with the username from a signed /oauth/identity', async () => {
    connect();
    stub.respond = () => json(200, { id: 1, username: 'fake-owner' });
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, username: 'fake-owner' });
    expect(discogsFetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(discogsFetch).mock.calls[0][0]).toMatchObject({
      path: '/oauth/identity',
      auth: 'oauth',
    });
  });

  it('a success clears Reconnect needed', async () => {
    connect();
    markAuthInvalid();
    stub.respond = () => json(200, { id: 1, username: 'fake-owner' });
    await call();
    expect(isAuthInvalid()).toBe(false);
  });

  it('rejected on a 401, and the sign-in is marked invalid', async () => {
    connect();
    expect(isAuthInvalid()).toBe(false);
    stub.respond = () => json(401, { message: 'You must authenticate.' });
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body).toEqual({ ok: false, kind: 'rejected' });
    expect(isAuthInvalid()).toBe(true);
  });

  it('unreachable when fetch rejects', async () => {
    connect();
    stub.respond = () => {
      throw new TypeError('fetch failed');
    };
    const { body } = await call();
    expect(body).toEqual({ ok: false, kind: 'unreachable' });
  });

  it('busy on a 429', async () => {
    connect();
    stub.respond = () => json(429, { message: 'slow down' });
    const { body } = await call();
    expect(body).toEqual({ ok: false, kind: 'busy' });
  });

  it('other with a short reason when Discogs sends no username', async () => {
    connect();
    stub.respond = () => json(200, { id: 1, token: CANARY_TOKEN_SECRET });
    const { body } = await call();
    expect(body).toMatchObject({ ok: false, kind: 'other' });
    expect((body as { reason: string }).reason.length).toBeLessThanOrEqual(160);
  });
});

// Nyquist gap audit (WR-04): a passing Test connection clears Reconnect
// needed, so the spines a revoked sign-in left auth_failed must be queued
// again, as finishing a connect does.
describe('POST /api/discogs/test re-queues auth_failed spines (WR-04)', () => {
  useTempDataDir();
  let dir = '';
  const names = ['SECRETS_FILE', ...Object.values(SECRET_ENV_NAMES)];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const n of names) {
      saved[n] = process.env[n];
      delete process.env[n];
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-discogs-test-wr04-'));
    process.env.SECRETS_FILE = path.join(dir, 'secrets.json');
    saveSecrets({
      discogsConsumerKey: CANARY_KEY,
      discogsConsumerSecret: CANARY_SECRET,
    });
    let t = 1_800_000_000_000;
    resetDiscogsGateForTests({
      now: () => t,
      sleep: async (ms: number) => {
        t += ms;
      },
    });
    stub.respond = null;
  });

  afterEach(() => {
    clearAuthInvalid();
    for (const n of names) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('WR-04: a passing test queues a new search for each auth_failed spine', async () => {
    const sc = await orphanScenario();
    connect();
    const db = getDb().$client;
    expect(enqueueMissingSearches({ includeAuthFailed: true })).toBeGreaterThan(
      0,
    );
    // A 401 ended every queued search auth_failed (search_spine's path).
    const queued = db
      .prepare(
        "SELECT id, job_id FROM discogs_searches WHERE status = 'queued'",
      )
      .all() as { id: string; job_id: string }[];
    for (const q of queued) {
      finishSearch(db, q.id, { status: 'auth_failed' });
      db.prepare("UPDATE jobs SET status = 'succeeded' WHERE id = ?").run(
        q.job_id,
      );
      releaseDedupeKey(q.job_id);
    }
    markAuthInvalid();
    stub.respond = () => json(200, { id: 1, username: 'fake-owner' });
    const { body } = await call();
    expect(body).toEqual({ ok: true, username: 'fake-owner' });
    expect(isAuthInvalid()).toBe(false);
    const requeued = db
      .prepare(
        `SELECT COUNT(*) AS n FROM discogs_searches
         WHERE status = 'queued' AND spine_id = @spineId`,
      )
      .get({ spineId: sc.spineIds[0] }) as { n: number };
    expect(requeued.n).toBe(1);
  });
});
