import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTempDataDir } from '../../../../../test/helpers/temp-data-dir';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

// The real discogsFetch over a stubbed fetch that answers from a queue and
// records every request: never a live API (CLAUDE.md).
type Sent = { method: string; url: string; authorization: string };
const stub = vi.hoisted(() => ({
  queue: [] as Array<() => Response>,
  sent: [] as Sent[],
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
          fetchImpl: (async (url: string | URL, init?: RequestInit) => {
            const headers = new Headers(init?.headers);
            stub.sent.push({
              method: init?.method ?? 'GET',
              url: String(url),
              authorization: headers.get('authorization') ?? '',
            });
            const next = stub.queue.shift();
            if (!next) throw new Error('no stubbed response');
            return next();
          }) as unknown as typeof fetch,
        }),
    ),
  };
});

import {
  clearPendingConnect,
  getDiscogsAuth,
  hasPendingConnect,
  PENDING_CONNECT_TTL_MS,
  setPendingConnect,
} from '@/server/discogs/auth';
import { resetDiscogsGateForTests } from '@/server/discogs/gate';
import { SECRET_ENV_NAMES, saveSecrets } from '@/server/secrets';
import { GET } from './route';

// GET /api/discogs/callback (D-01, D-03, T-03-01, T-03-05): only a pending
// request token is accepted, once; the answer is always a 303 to
// /settings?discogs={connected|denied|expired|error}, never echoing a token
// or the verifier.

const CANARY_KEY = 'CANARYDISCOGSKEY-0123456789wxyz';
const CANARY_SECRET = 'CANARYDISCOGSSECRET-0123456789abcd';
const CANARY_RT_SECRET = 'CANARYREQUESTSECRET-0123456789mnop';
const CANARY_AT = 'CANARYACCESSTOKEN-0123456789qrst';
const CANARY_AT_SECRET = 'CANARYACCESSSECRET-0123456789uvwx';
const VERIFIER = 'CANARYVERIFIER-0123456789yz';
const RT = 'rt-0123456789';

const ACCESS_OK = () =>
  new Response(
    `oauth_token=${CANARY_AT}&oauth_token_secret=${CANARY_AT_SECRET}`,
    {
      status: 200,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    },
  );
const IDENTITY_OK = () =>
  new Response(JSON.stringify({ id: 1, username: 'fake-owner' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

function pending(expiresAt = Date.now() + PENDING_CONNECT_TTL_MS): void {
  setPendingConnect(RT, {
    secret: CANARY_RT_SECRET,
    callback: 'http://127.0.0.1:3000/api/discogs/callback',
    expiresAt,
  });
}

async function callback(query: string, host = '127.0.0.1:3000') {
  const res = await GET(
    new Request(`http://${host}/api/discogs/callback?${query}`, {
      headers: { host },
    }),
  );
  const location = res.headers.get('location') ?? '';
  for (const canary of [
    VERIFIER,
    RT,
    CANARY_RT_SECRET,
    CANARY_AT,
    CANARY_AT_SECRET,
  ]) {
    expect(location).not.toContain(canary);
  }
  return { status: res.status, location };
}

describe('GET /api/discogs/callback', () => {
  useTempDataDir();
  let dir = '';
  const names = [
    'SECRETS_FILE',
    'DISCOGS_API_BASE',
    'DISCOGS_WEB_BASE',
    ...Object.values(SECRET_ENV_NAMES),
  ];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const n of names) {
      saved[n] = process.env[n];
      delete process.env[n];
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-callback-'));
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
    clearPendingConnect();
    stub.queue = [];
    stub.sent = [];
  });

  afterEach(() => {
    clearPendingConnect();
    for (const n of names) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('connected: exchanges the verifier, saves the sign-in and consumes the pending entry', async () => {
    pending();
    stub.queue.push(ACCESS_OK, IDENTITY_OK);
    const res = await callback(`oauth_token=${RT}&oauth_verifier=${VERIFIER}`);
    expect(res).toEqual({
      status: 303,
      location: 'http://127.0.0.1:3000/settings?discogs=connected',
    });
    expect(
      stub.sent.map((s) => `${s.method} ${new URL(s.url).pathname}`),
    ).toEqual(['POST /oauth/access_token', 'GET /oauth/identity']);
    expect(getDiscogsAuth()).toEqual({
      token: CANARY_AT,
      tokenSecret: CANARY_AT_SECRET,
      username: 'fake-owner',
    });
    expect(hasPendingConnect()).toBe(false);
    // Single use: a replay of the same redirect is expired, no request.
    const replay = await callback(
      `oauth_token=${RT}&oauth_verifier=${VERIFIER}`,
    );
    expect(replay.location).toBe(
      'http://127.0.0.1:3000/settings?discogs=expired',
    );
    expect(stub.sent).toHaveLength(2);
  });

  it('denied: a denied= redirect saves nothing and makes no request', async () => {
    pending();
    const res = await callback(`denied=${RT}`);
    expect(res.location).toBe('http://127.0.0.1:3000/settings?discogs=denied');
    expect(stub.sent).toHaveLength(0);
    expect(getDiscogsAuth()).toBeNull();
    expect(hasPendingConnect()).toBe(false);
  });

  it('denied: a pending token without a verifier is denied', async () => {
    pending();
    const res = await callback(`oauth_token=${RT}`);
    expect(res.location).toBe('http://127.0.0.1:3000/settings?discogs=denied');
    expect(stub.sent).toHaveLength(0);
  });

  it('expired: a pending entry past its 15 minutes is refused without a request', async () => {
    pending(Date.now() - 1);
    const res = await callback(`oauth_token=${RT}&oauth_verifier=${VERIFIER}`);
    expect(res.location).toBe('http://127.0.0.1:3000/settings?discogs=expired');
    expect(stub.sent).toHaveLength(0);
    expect(getDiscogsAuth()).toBeNull();
  });

  it.each([
    ['an unknown token', 'oauth_token=rt-forged&oauth_verifier=x'],
    ['no token at all', 'oauth_verifier=x'],
  ])(
    'bad token: %s is expired, leaves the real entry and makes no request',
    async (_l, q) => {
      pending();
      const res = await callback(q);
      expect(res.location).toBe(
        'http://127.0.0.1:3000/settings?discogs=expired',
      );
      expect(stub.sent).toHaveLength(0);
      expect(hasPendingConnect()).toBe(true);
    },
  );

  it('error: a rejected exchange redirects to error and saves nothing', async () => {
    pending();
    const reject = () => new Response('Invalid verifier.', { status: 401 });
    stub.queue.push(reject, reject);
    const res = await callback(`oauth_token=${RT}&oauth_verifier=${VERIFIER}`);
    expect(res.location).toBe('http://127.0.0.1:3000/settings?discogs=error');
    expect(getDiscogsAuth()).toBeNull();
  });

  it('an unusable Host header falls back to 127.0.0.1, never an outside origin', async () => {
    const res = await callback('oauth_token=nope', 'evil.example/x?');
    expect(res.status).toBe(303);
    expect(res.location).toBe('http://127.0.0.1/settings?discogs=expired');
  });
});
