import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

// The real discogsFetch (so classification and the username redaction are
// the client's own) behind a spy, always over a stubbed fetch: never a live
// API (CLAUDE.md).
const stub = vi.hoisted(() => ({
  respond: null as null | ((url: string) => Response | Promise<Response>),
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
          fetchImpl: (async (url: string) => {
            if (!stub.respond) throw new Error('no stubbed response');
            return stub.respond(String(url));
          }) as unknown as typeof fetch,
        }),
    ),
  };
});

import { clearAuthInvalid, saveDiscogsAuth } from '@/server/discogs/auth';
import { discogsFetch } from '@/server/discogs/client';
import {
  COLLECTION_FOLDER_KEY,
  FOLDERS_CACHE_KEY,
  getCachedFolders,
  getCollectionFolderId,
} from '@/server/discogs/folders';
import { resetDiscogsGateForTests } from '@/server/discogs/gate';
import { SECRET_ENV_NAMES, saveSecrets } from '@/server/secrets';
import { setSetting } from '@/server/settings';
import { useTempDataDir } from '../../../../../test/helpers/temp-data-dir';
import { GET, POST } from './route';

// GET/POST /api/discogs/folders (D-03, IMP-02, T-04-24, T-04-25, T-04-26):
// GET answers the cache only; POST { refresh: true } is JSON only, 409
// without a connection, busy without a request while paused, and caches the
// folders with id >= 1 in Discogs order. No token, secret or username leaks.

const CANARY_SECRET = 'CANARYDISCOGSSECRET-0123456789abcd';
const CANARY_TOKEN = 'CANARYTOKEN-0123456789efgh';
const CANARY_TOKEN_SECRET = 'CANARYTOKENSECRET-0123456789ijkl';
const USERNAME = 'fake-owner';

function post(
  body: unknown = { refresh: true },
  contentType = 'application/json',
): Request {
  return new Request('http://127.0.0.1:3001/api/discogs/folders', {
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

async function read(res: Response) {
  const text = await res.text();
  for (const canary of [CANARY_SECRET, CANARY_TOKEN, CANARY_TOKEN_SECRET]) {
    expect(text).not.toContain(canary);
  }
  return { status: res.status, body: JSON.parse(text) as unknown };
}

const call = async (req: Request = post()) => read(await POST(req));

function connect(): void {
  saveDiscogsAuth({
    token: CANARY_TOKEN,
    tokenSecret: CANARY_TOKEN_SECRET,
    username: USERNAME,
  });
}

const DISCOGS_FOLDERS = {
  folders: [
    { id: 0, name: 'All', count: 7, resource_url: 'https://x/0' },
    { id: 1, name: 'Uncategorized', count: 5, resource_url: 'https://x/1' },
    { id: 9, name: 'Zappa box', count: 2, resource_url: 'https://x/9' },
    { id: 3, name: 'Ambient', count: 0, resource_url: 'https://x/3' },
  ],
};

describe('/api/discogs/folders', () => {
  useTempDataDir();
  let dir = '';
  const names = ['SECRETS_FILE', ...Object.values(SECRET_ENV_NAMES)];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const n of names) {
      saved[n] = process.env[n];
      delete process.env[n];
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-discogs-folders-'));
    process.env.SECRETS_FILE = path.join(dir, 'secrets.json');
    saveSecrets({
      discogsConsumerKey: 'CANARYDISCOGSKEY-0123456789wxyz',
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
    clearAuthInvalid();
    for (const n of names) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('GET answers the empty state without calling Discogs', async () => {
    const { status, body } = await read(await GET());
    expect(status).toBe(200);
    expect(body).toEqual({
      folders: [],
      selectedId: 1,
      savedId: null,
      savedMissing: false,
      fetchedAt: null,
      connected: false,
    });
    expect(discogsFetch).not.toHaveBeenCalled();
  });

  it('GET answers the cached list, the saved folder and connected', async () => {
    connect();
    setSetting(FOLDERS_CACHE_KEY, {
      folders: [
        { id: 1, name: 'Uncategorized', count: 5 },
        { id: 9, name: 'Zappa box', count: 2 },
      ],
      fetchedAt: 1_700_000_000_000,
    });
    setSetting(COLLECTION_FOLDER_KEY, 9);
    const { body } = await read(await GET());
    expect(body).toMatchObject({
      selectedId: 9,
      savedId: 9,
      savedMissing: false,
      fetchedAt: 1_700_000_000_000,
      connected: true,
    });
    expect(discogsFetch).not.toHaveBeenCalled();
  });

  it('a refresh reads the folders once, drops folder 0 and keeps Discogs order', async () => {
    connect();
    let url = '';
    stub.respond = (u) => {
      url = u;
      return json(200, DISCOGS_FOLDERS);
    };
    const { status, body } = await call();
    expect(status).toBe(200);
    const expected = [
      { id: 1, name: 'Uncategorized', count: 5 },
      { id: 9, name: 'Zappa box', count: 2 },
      { id: 3, name: 'Ambient', count: 0 },
    ];
    expect(body).toMatchObject({
      ok: true,
      folders: expected,
      selectedId: 1,
      savedId: null,
      savedMissing: false,
    });
    expect(discogsFetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(discogsFetch).mock.calls[0][0]).toMatchObject({
      path: `/users/${USERNAME}/collection/folders`,
      auth: 'oauth',
    });
    expect(new URL(url).pathname).toBe(`/users/${USERNAME}/collection/folders`);
    expect(getCachedFolders()?.folders).toEqual(expected);
    expect(JSON.stringify(body)).not.toContain('resource_url');
  });

  it('a refresh that no longer lists the saved folder falls back to 1', async () => {
    connect();
    setSetting(FOLDERS_CACHE_KEY, {
      folders: [{ id: 4, name: 'Gone soon', count: 1 }],
      fetchedAt: 1,
    });
    setSetting(COLLECTION_FOLDER_KEY, 4);
    stub.respond = () => json(200, DISCOGS_FOLDERS);
    const { body } = await call();
    expect(body).toMatchObject({
      ok: true,
      selectedId: 1,
      savedId: 4,
      savedMissing: true,
    });
    expect(getCollectionFolderId()).toBe(1);
  });

  it('415 for text/plain and 400 for any other body, without a request', async () => {
    connect();
    expect((await call(post({ refresh: true }, 'text/plain'))).status).toBe(
      415,
    );
    expect((await call(post({}))).status).toBe(400);
    expect((await call(post({ refresh: true, folderId: 2 }))).status).toBe(400);
    expect((await call(post({ refresh: 'yes' }))).status).toBe(400);
    expect(discogsFetch).not.toHaveBeenCalled();
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

  it('rejected on a 401 and on a 403, and nothing is cached', async () => {
    connect();
    stub.respond = () => json(401, { message: 'You must authenticate.' });
    expect((await call()).body).toEqual({ ok: false, kind: 'rejected' });
    connect();
    stub.respond = () => json(403, { message: 'Not yours.' });
    expect((await call()).body).toEqual({ ok: false, kind: 'rejected' });
    expect(getCachedFolders()).toBeNull();
  });

  it('unreachable when fetch rejects, busy on a 429', async () => {
    connect();
    stub.respond = () => {
      throw new TypeError('fetch failed');
    };
    expect((await call()).body).toEqual({ ok: false, kind: 'unreachable' });
    stub.respond = () => json(429, { message: 'slow down' });
    expect((await call()).body).toEqual({ ok: false, kind: 'busy' });
  });

  it('other with a short reason that never names the user or echoes Discogs', async () => {
    connect();
    stub.respond = () =>
      json(422, { message: `secret body for ${USERNAME} ${CANARY_TOKEN}` });
    const { body } = await call();
    expect(body).toMatchObject({ ok: false, kind: 'other' });
    const reason = (body as { reason: string }).reason;
    expect(reason.length).toBeLessThanOrEqual(160);
    expect(reason).not.toContain(USERNAME);
    expect(reason).not.toContain('secret body');
    expect(reason).toContain('/users/:u/collection/folders');
  });

  it('other when Discogs answers without a folder list', async () => {
    connect();
    stub.respond = () => json(200, { folders: 'nope' });
    const { body } = await call();
    expect(body).toEqual({
      ok: false,
      kind: 'other',
      reason: 'Discogs answered without a folder list',
    });
    expect(getCachedFolders()).toBeNull();
  });
});
