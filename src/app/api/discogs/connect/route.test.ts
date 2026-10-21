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
  hasPendingConnect,
  readPendingConnect,
} from '@/server/discogs/auth';
import { discogsGate, resetDiscogsGateForTests } from '@/server/discogs/gate';
import { SECRET_ENV_NAMES, saveSecrets } from '@/server/secrets';
import { POST } from './route';

// POST /api/discogs/connect (D-01, D-03, T-03-02): one consumer-signed
// request token call, the discogs.com authorize URL back, and a pending
// entry for the callback. No body ever carries a secret.

const CANARY_KEY = 'CANARYDISCOGSKEY-0123456789wxyz';
const CANARY_SECRET = 'CANARYDISCOGSSECRET-0123456789abcd';
const CANARY_RT_SECRET = 'CANARYREQUESTSECRET-0123456789mnop';
const RT = 'rt-0123456789';

const REQUEST_TOKEN_OK = () =>
  new Response(
    `oauth_token=${RT}&oauth_token_secret=${CANARY_RT_SECRET}&oauth_callback_confirmed=true`,
    {
      status: 200,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    },
  );

async function connect(
  body: unknown = {},
  { host = '127.0.0.1:3000', contentType = 'application/json' } = {},
) {
  const res = await POST(
    new Request(`http://${host}/api/discogs/connect`, {
      method: 'POST',
      headers: { 'content-type': contentType, host },
      body: JSON.stringify(body),
    }),
  );
  const text = await res.text();
  for (const canary of [CANARY_SECRET, CANARY_RT_SECRET]) {
    expect(text).not.toContain(canary);
  }
  return { status: res.status, body: JSON.parse(text) as unknown };
}

describe('POST /api/discogs/connect', () => {
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
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-connect-route-'));
    process.env.SECRETS_FILE = path.join(dir, 'secrets.json');
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

  function credentials(): void {
    saveSecrets({
      discogsConsumerKey: CANARY_KEY,
      discogsConsumerSecret: CANARY_SECRET,
    });
  }

  it('gets a request token, answers the authorize URL and stores the pending entry', async () => {
    credentials();
    stub.queue.push(REQUEST_TOKEN_OK);
    const { status, body } = await connect();
    expect(status).toBe(200);
    expect(body).toEqual({
      authorizeUrl: `https://www.discogs.com/oauth/authorize?oauth_token=${RT}`,
    });
    expect(stub.sent).toHaveLength(1);
    const sent = stub.sent[0];
    expect(new URL(sent.url).pathname).toBe('/oauth/request_token');
    expect(sent.authorization).toContain(`oauth_consumer_key="${CANARY_KEY}"`);
    expect(sent.authorization).toContain(
      `oauth_callback="${encodeURIComponent('http://127.0.0.1:3000/api/discogs/callback')}"`,
    );
    const entry = readPendingConnect(RT);
    expect(entry).toMatchObject({
      secret: CANARY_RT_SECRET,
      callback: 'http://127.0.0.1:3000/api/discogs/callback',
    });
    expect(entry?.expiresAt ?? 0).toBeGreaterThan(Date.now());
  });

  it('the callback URL follows the Host header (D-03)', async () => {
    credentials();
    stub.queue.push(REQUEST_TOKEN_OK);
    await connect({}, { host: 'localhost:3001' });
    expect(readPendingConnect(RT)?.callback).toBe(
      'http://localhost:3001/api/discogs/callback',
    );
  });

  it('409 credentials_missing without a consumer key and secret, no request', async () => {
    const { status, body } = await connect();
    expect(status).toBe(409);
    expect(body).toEqual({ error: 'credentials_missing' });
    expect(stub.sent).toHaveLength(0);
    expect(hasPendingConnect()).toBe(false);
  });

  it('415 for a non-JSON body and 400 for extra keys, no request', async () => {
    credentials();
    expect((await connect({}, { contentType: 'text/plain' })).status).toBe(415);
    expect((await connect({ callback: 'http://evil' })).status).toBe(400);
    expect(stub.sent).toHaveLength(0);
  });

  it('503 busy while the gate is paused, no request', async () => {
    credentials();
    discogsGate().pause(30_000);
    const { status, body } = await connect();
    expect(status).toBe(503);
    expect(body).toEqual({ error: 'busy' });
    expect(stub.sent).toHaveLength(0);
  });

  it('401 bad_credentials when Discogs rejects the consumer key; nothing pending', async () => {
    credentials();
    stub.queue.push(() => new Response('Invalid consumer.', { status: 401 }));
    const { status, body } = await connect();
    expect(status).toBe(401);
    expect(body).toEqual({ error: 'bad_credentials' });
    expect(hasPendingConnect()).toBe(false);
  });

  it('a 200 without a request token is a failure and nothing pending', async () => {
    credentials();
    stub.queue.push(() => new Response('oauth_token=', { status: 200 }));
    const { status, body } = await connect();
    expect(status).toBe(502);
    expect(body).toMatchObject({ error: 'failed' });
    expect(hasPendingConnect()).toBe(false);
  });
});
