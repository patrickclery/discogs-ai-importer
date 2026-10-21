import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { orphanScenario } from '../../../test/helpers/scan-runs';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

// The real discogsFetch (so the error classes are the client's own) over a
// stubbed fetch that answers from a queue and records every request: never
// a live API (CLAUDE.md).
type Sent = { method: string; path: string; authorization: string };
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
              path: new URL(String(url)).pathname,
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

import { z } from 'zod';
import { POST as finish } from '@/app/api/discogs/finish/route';
import { getDb } from '@/server/db/client';
import {
  clearPendingConnect,
  getDiscogsAuth,
  hasPendingConnect,
  MAX_REJECTED_CODES,
  PENDING_CONNECT_TTL_MS,
  type PendingConnect,
  readPendingConnect,
  saveDiscogsAuth,
  setPendingConnect,
} from '@/server/discogs/auth';
import { completeConnect } from '@/server/discogs/connect';
import { discogsGate, resetDiscogsGateForTests } from '@/server/discogs/gate';
import { percentEncode } from '@/server/discogs/oauth';
import { SECRET_ENV_NAMES, saveSecrets } from '@/server/secrets';
import { getSetting } from '@/server/settings';

// completeConnect (D-01, RESEARCH A2) and POST /api/discogs/finish (the
// RESEARCH A1 paste-code fallback, T-03-38). No body ever carries the code,
// a token or a secret (D-02).

const CANARY_KEY = 'CANARYDISCOGSKEY-0123456789wxyz';
const CANARY_SECRET = 'CANARYDISCOGSSECRET-0123456789abcd';
const CANARY_RT_SECRET = 'CANARYREQUESTSECRET-0123456789mnop';
const CANARY_AT = 'CANARYACCESSTOKEN-0123456789qrst';
const CANARY_AT_SECRET = 'CANARYACCESSSECRET-0123456789uvwx';
const CODE = 'CANARYCODE-0123456789yz';
const RT = 'rt-0123456789';

function form(status: number, body: string): () => Response {
  return () =>
    new Response(body, {
      status,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
}

function json(status: number, body: unknown): () => Response {
  return () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
}

const ACCESS_OK = form(
  200,
  `oauth_token=${CANARY_AT}&oauth_token_secret=${CANARY_AT_SECRET}`,
);
const ACCESS_401 = form(401, 'Invalid verifier.');
const IDENTITY_OK = json(200, { id: 1, username: 'fake-owner' });

function pendingEntry(): PendingConnect {
  return {
    secret: CANARY_RT_SECRET,
    callback: 'http://127.0.0.1:3001/api/discogs/callback',
    expiresAt: Date.now() + PENDING_CONNECT_TTL_MS,
  };
}

/** The decoded oauth_signature of a recorded request. */
function signature(s: Sent): string {
  const m = /oauth_signature="([^"]*)"/.exec(s.authorization);
  return m ? decodeURIComponent(m[1]) : '';
}

function post(body: unknown, contentType = 'application/json'): Request {
  return new Request('http://127.0.0.1:3001/api/discogs/finish', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function call(req: Request) {
  const res = await finish(req);
  const text = await res.text();
  for (const canary of [
    CANARY_SECRET,
    CANARY_RT_SECRET,
    CANARY_AT,
    CANARY_AT_SECRET,
    CODE,
  ]) {
    expect(text).not.toContain(canary);
  }
  return { status: res.status, body: JSON.parse(text) as unknown };
}

describe('discogs connect', () => {
  useTempDataDir();
  let dir = '';
  const names = ['SECRETS_FILE', ...Object.values(SECRET_ENV_NAMES)];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const n of names) {
      saved[n] = process.env[n];
      delete process.env[n];
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-discogs-connect-'));
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

  describe('completeConnect', () => {
    it('signs the exchange consumer_secret&request_token_secret and saves the connection', async () => {
      stub.queue.push(ACCESS_OK, IDENTITY_OK);
      const out = await completeConnect({
        oauthToken: RT,
        verifier: CODE,
        pending: pendingEntry(),
        via: 'callback',
      });
      expect(out).toEqual({ username: 'fake-owner' });
      expect(stub.sent.map((s) => `${s.method} ${s.path}`)).toEqual([
        'POST /oauth/access_token',
        'GET /oauth/identity',
      ]);
      expect(signature(stub.sent[0])).toBe(
        `${percentEncode(CANARY_SECRET)}&${percentEncode(CANARY_RT_SECRET)}`,
      );
      expect(stub.sent[0].authorization).toContain(
        `oauth_verifier="${percentEncode(CODE)}"`,
      );
      expect(getDiscogsAuth()).toEqual({
        token: CANARY_AT,
        tokenSecret: CANARY_AT_SECRET,
        username: 'fake-owner',
      });
      expect(getSetting('discogs_exchange_form', z.string())).toBe('standard');
    });

    it('connecting queues the backfill: one auto search per already-scanned active CD spine (D-08)', async () => {
      const sc = await orphanScenario();
      const db = getDb().$client;
      const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
      expect(count('SELECT COUNT(*) AS n FROM discogs_searches')).toBe(0);
      stub.queue.push(ACCESS_OK, IDENTITY_OK);
      await completeConnect({
        oauthToken: RT,
        verifier: CODE,
        pending: pendingEntry(),
        via: 'callback',
      });
      const activeCd = count(
        `SELECT COUNT(*) AS n FROM spines s
         JOIN spine_detections d ON d.id = s.current_detection_id
         WHERE s.state = 'active' AND d.media_kind = 'cd'`,
      );
      expect(activeCd).toBeGreaterThan(0);
      const searched = (
        db
          .prepare(
            `SELECT spine_id FROM discogs_searches
             WHERE kind = 'auto' AND status = 'queued'`,
          )
          .all() as { spine_id: string }[]
      ).map((r) => r.spine_id);
      expect(searched).toHaveLength(activeCd);
      expect(searched).not.toContain(sc.orphanId);
      expect(searched).not.toContain(sc.supersededId);
      expect(
        count(
          "SELECT COUNT(*) AS n FROM jobs WHERE lane = 'discogs' AND type = 'search_spine'",
        ),
      ).toBe(activeCd);
      // Only the exchange and identity: the backfill only queues.
      expect(stub.sent).toHaveLength(2);
    });

    it('retries the exchange once with the docs signature after a 401', async () => {
      stub.queue.push(ACCESS_401, ACCESS_OK, IDENTITY_OK);
      await completeConnect({
        oauthToken: RT,
        verifier: CODE,
        pending: pendingEntry(),
        via: 'callback',
      });
      const exchanges = stub.sent.filter(
        (s) => s.path === '/oauth/access_token',
      );
      expect(exchanges).toHaveLength(2);
      expect(signature(exchanges[1])).toBe(`${percentEncode(CANARY_SECRET)}&`);
      expect(getSetting('discogs_exchange_form', z.string())).toBe('docs');
    });

    it('fails after a second 401 and saves nothing', async () => {
      stub.queue.push(ACCESS_401, ACCESS_401);
      await expect(
        completeConnect({
          oauthToken: RT,
          verifier: CODE,
          pending: pendingEntry(),
          via: 'code',
        }),
      ).rejects.toMatchObject({ name: 'DiscogsAuthError' });
      expect(
        stub.sent.filter((s) => s.path === '/oauth/access_token'),
      ).toHaveLength(2);
      expect(getDiscogsAuth()).toBeNull();
    });

    it('an identity answer without a username fails the connect and saves nothing', async () => {
      stub.queue.push(ACCESS_OK, json(200, { id: 1 }));
      await expect(
        completeConnect({
          oauthToken: RT,
          verifier: CODE,
          pending: pendingEntry(),
          via: 'callback',
        }),
      ).rejects.toMatchObject({ name: 'DiscogsRequestError' });
      expect(getDiscogsAuth()).toBeNull();
      expect(getSetting('discogs_connect_via', z.string())).toBeNull();
    });

    it("records via 'code' in the discogs_connect_via setting", async () => {
      stub.queue.push(ACCESS_OK, IDENTITY_OK);
      await completeConnect({
        oauthToken: RT,
        verifier: CODE,
        pending: pendingEntry(),
        via: 'code',
      });
      expect(getSetting('discogs_connect_via', z.string())).toBe('code');
    });

    it('an error message never carries the code or a secret', async () => {
      stub.queue.push(ACCESS_OK, json(200, {}));
      const err = await completeConnect({
        oauthToken: RT,
        verifier: CODE,
        pending: pendingEntry(),
        via: 'code',
      }).catch((e: Error) => e);
      const text = String((err as Error).message);
      for (const canary of [CODE, CANARY_RT_SECRET, CANARY_AT_SECRET]) {
        expect(text).not.toContain(canary);
      }
    });
  });

  describe('POST /api/discogs/finish', () => {
    it('415 for a non-JSON body, without a request', async () => {
      setPendingConnect(RT, pendingEntry());
      const { status } = await call(post(`code=${CODE}`, 'text/plain'));
      expect(status).toBe(415);
      expect(stub.sent).toHaveLength(0);
    });

    it('400 invalid_body for extra keys or a code over 200 characters', async () => {
      setPendingConnect(RT, pendingEntry());
      expect((await call(post({ code: CODE, token: 'x' }))).status).toBe(400);
      expect((await call(post({ code: 'x'.repeat(201) }))).status).toBe(400);
      expect(stub.sent).toHaveLength(0);
    });

    it("400 { error: 'empty' } for an empty or whitespace code", async () => {
      setPendingConnect(RT, pendingEntry());
      for (const code of ['', '   \n\t']) {
        const { status, body } = await call(post({ code }));
        expect(status).toBe(400);
        expect(body).toEqual({ error: 'empty' });
      }
      expect(stub.sent).toHaveLength(0);
      expect(hasPendingConnect()).toBe(true);
    });

    it("410 { error: 'expired' } with no live pending connect", async () => {
      expect(await call(post({ code: CODE }))).toEqual({
        status: 410,
        body: { error: 'expired' },
      });
      setPendingConnect(RT, {
        ...pendingEntry(),
        expiresAt: Date.now() - 1,
      });
      expect((await call(post({ code: CODE }))).status).toBe(410);
      expect(stub.sent).toHaveLength(0);
    });

    it("401 { error: 'rejected' } for a rejected code, keeping the pending entry for another try", async () => {
      setPendingConnect(RT, pendingEntry());
      stub.queue.push(ACCESS_401, ACCESS_401);
      expect(await call(post({ code: CODE }))).toEqual({
        status: 401,
        body: { error: 'rejected' },
      });
      expect(hasPendingConnect()).toBe(true);
      expect(readPendingConnect(RT)?.rejections).toBe(1);
      expect(getDiscogsAuth()).toBeNull();

      // Another try with the right code connects.
      stub.queue.push(ACCESS_OK, IDENTITY_OK);
      expect(await call(post({ code: CODE }))).toEqual({
        status: 200,
        body: { username: 'fake-owner' },
      });
    });

    it('drops the pending entry after the 5th rejected code', async () => {
      setPendingConnect(RT, pendingEntry());
      for (let i = 1; i <= MAX_REJECTED_CODES; i++) {
        stub.queue.push(ACCESS_401, ACCESS_401);
        expect((await call(post({ code: `${CODE}-${i}` }))).status).toBe(401);
        expect(hasPendingConnect()).toBe(i < MAX_REJECTED_CODES);
      }
      expect((await call(post({ code: CODE }))).body).toEqual({
        error: 'expired',
      });
    });

    it('200 { username } on success, trims the code, saves the connection and deletes the pending entry', async () => {
      setPendingConnect(RT, pendingEntry());
      stub.queue.push(ACCESS_OK, IDENTITY_OK);
      expect(await call(post({ code: `  ${CODE}\n` }))).toEqual({
        status: 200,
        body: { username: 'fake-owner' },
      });
      expect(stub.sent[0].authorization).toContain(
        `oauth_verifier="${percentEncode(CODE)}"`,
      );
      expect(stub.sent[0].authorization).toContain(
        `oauth_token="${percentEncode(RT)}"`,
      );
      expect(hasPendingConnect()).toBe(false);
      expect(getDiscogsAuth()?.username).toBe('fake-owner');
      expect(getSetting('discogs_connect_via', z.string())).toBe('code');
      expect((await call(post({ code: CODE }))).status).toBe(410);
    });

    it('502 failed with a plain reason when Discogs answers oddly, keeping an existing connection', async () => {
      saveDiscogsAuth({
        token: 'old-token',
        tokenSecret: 'old-secret',
        username: 'old-owner',
      });
      setPendingConnect(RT, pendingEntry());
      stub.queue.push(form(200, 'nothing=here'));
      const { status, body } = await call(post({ code: CODE }));
      expect(status).toBe(502);
      expect(body).toEqual({
        error: 'failed',
        message: "Discogs sent an answer the app didn't expect",
      });
      expect(getDiscogsAuth()?.username).toBe('old-owner');
    });

    it('503 busy without a request while the gate is paused', async () => {
      setPendingConnect(RT, pendingEntry());
      discogsGate().pause(60_000);
      const { status, body } = await call(post({ code: CODE }));
      expect(status).toBe(503);
      expect(body).toMatchObject({ error: 'busy' });
      expect(stub.sent).toHaveLength(0);
      expect(hasPendingConnect()).toBe(true);
    });
  });
});
