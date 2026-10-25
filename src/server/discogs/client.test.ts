import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SECRET_ENV_NAMES, saveSecrets } from '../secrets';
import { clearDiscogsAuth, isAuthInvalid, saveDiscogsAuth } from './auth';
import {
  DiscogsAuthError,
  DiscogsNotFoundError,
  DiscogsRateLimitedError,
  type DiscogsRequest,
  DiscogsRequestError,
  DiscogsUnavailableError,
  discogsFetch,
} from './client';
import { type DiscogsGate, resetDiscogsGateForTests } from './gate';

// Never hits a live API (CLAUDE.md): fetchImpl is always a stub, and the
// gate runs on a fake clock so no test sleeps.

const CANARY_KEY = 'CANARYDISCOGSKEY-0123456789wxyz';
const CANARY_SECRET = 'CANARYDISCOGSSECRET-0123456789abcd';
const CANARY_TOKEN = 'CANARYTOKEN-0123456789efgh';
const CANARY_TOKEN_SECRET = 'CANARYTOKENSECRET-0123456789ijkl';
const UA =
  'DiscogsAIImporter/0.1 +https://github.com/patrickclery/discogs-ai-importer';
const START = 1_800_000_000_000;

type FetchCall = { url: string; init: RequestInit };

/** Temp SECRETS_FILE outside DATA_DIR and clean Discogs env vars. */
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
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-discogs-client-'));
    process.env.SECRETS_FILE = path.join(dir, 'secrets.json');
    saveSecrets({
      discogsConsumerKey: CANARY_KEY,
      discogsConsumerSecret: CANARY_SECRET,
    });
  });
  afterEach(() => {
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

function stubFetch(respond: () => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const fetchImpl = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return respond();
    },
  ) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function reply(
  status: number,
  body: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(status === 204 ? null : body, { status, headers });
}

function headerOf(call: FetchCall, name: string): string | null {
  return new Headers(call.init.headers).get(name);
}

describe('discogsFetch', () => {
  useTempSecrets();
  let clock: ReturnType<typeof fakeClock>;
  let gate: DiscogsGate;

  beforeEach(() => {
    clock = fakeClock();
    gate = resetDiscogsGateForTests(clock);
  });

  async function run(req: DiscogsRequest, respond: () => Response) {
    const stub = stubFetch(respond);
    const result = discogsFetch(req, { fetchImpl: stub.fetchImpl, gate });
    return { result, ...stub };
  }

  async function rejection(p: Promise<unknown>): Promise<Error> {
    try {
      await p;
    } catch (err) {
      return err as Error;
    }
    throw new Error('expected a rejection');
  }

  it('returns status, text and parsed JSON on 2xx', async () => {
    const { result, calls } = await run(
      {
        path: '/database/search',
        query: { q: 'nevermind', per_page: 10 },
        auth: 'none',
      },
      () =>
        reply(200, '{"results":[]}', { 'content-type': 'application/json' }),
    );
    const res = await result;
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ results: [] });
    const url = new URL(calls[0].url);
    expect(url.origin).toBe('https://api.discogs.com');
    expect(url.pathname).toBe('/database/search');
    expect(url.searchParams.get('q')).toBe('nevermind');
    expect(url.searchParams.get('per_page')).toBe('10');
    expect(calls[0].init.redirect).toBe('error');
  });

  it('sends the project User-Agent and the Discogs Accept header', async () => {
    const { result, calls } = await run(
      {
        path: '/oauth/identity',
        auth: 'request',
        token: CANARY_TOKEN,
        tokenSecret: CANARY_TOKEN_SECRET,
      },
      () => reply(200, '{"username":"x"}'),
    );
    await result;
    expect(headerOf(calls[0], 'user-agent')).toBe(UA);
    expect(headerOf(calls[0], 'accept')).toBe(
      'application/vnd.discogs.v2.discogs+json',
    );
    const auth = headerOf(calls[0], 'authorization') ?? '';
    expect(auth).toMatch(/^OAuth /);
    expect(auth).toContain('oauth_signature_method="PLAINTEXT"');
  });

  it('sends no Authorization header for auth none', async () => {
    const { result, calls } = await run(
      { path: '/releases/1', auth: 'none' },
      () => reply(200, '{}'),
    );
    await result;
    expect(headerOf(calls[0], 'authorization')).toBeNull();
  });

  it('waits on gate.acquire before every request', async () => {
    const order: string[] = [];
    const acquire = vi.spyOn(gate, 'acquire').mockImplementation(async () => {
      order.push('acquire');
    });
    const stub = stubFetch(() => {
      order.push('fetch');
      return reply(200, '{}');
    });
    await discogsFetch(
      { path: '/releases/1', auth: 'none' },
      { fetchImpl: stub.fetchImpl, gate },
    );
    await discogsFetch(
      { path: '/releases/2', auth: 'none' },
      { fetchImpl: stub.fetchImpl, gate },
    );
    expect(acquire).toHaveBeenCalledTimes(2);
    expect(order).toEqual(['acquire', 'fetch', 'acquire', 'fetch']);
  });

  it('spaces consecutive requests by the gate interval', async () => {
    const stub = stubFetch(() => reply(200, '{}'));
    const deps = { fetchImpl: stub.fetchImpl, gate };
    await discogsFetch({ path: '/releases/1', auth: 'none' }, deps);
    const first = clock.t;
    await discogsFetch({ path: '/releases/2', auth: 'none' }, deps);
    expect(clock.t - first).toBe(1112);
  });

  it('observes the rate-limit headers of every response', async () => {
    const { result } = await run({ path: '/releases/1', auth: 'none' }, () =>
      reply(200, '{}', {
        'x-discogs-ratelimit': '25',
        'x-discogs-ratelimit-remaining': '20',
      }),
    );
    await result;
    expect(gate.intervalMs).toBe(2667);
  });

  it('429 with an empty body and no Retry-After pauses 60 s and throws DiscogsRateLimitedError', async () => {
    const { result } = await run(
      { path: '/database/search', auth: 'none' },
      () => reply(429, '', { 'content-type': 'application/json' }),
    );
    const err = await rejection(result);
    expect(err).toBeInstanceOf(DiscogsRateLimitedError);
    expect(err.name).toBe('DiscogsRateLimitedError');
    const resumeAt = (err as DiscogsRateLimitedError).resumeAt;
    expect(resumeAt - clock.t).toBe(60_000);
    expect(gate.pausedUntil()).toBe(resumeAt);
  });

  it('429 with Retry-After 7 pauses 7 s', async () => {
    const { result } = await run(
      { path: '/database/search', auth: 'none' },
      () => reply(429, '', { 'retry-after': '7' }),
    );
    const err = (await rejection(result)) as DiscogsRateLimitedError;
    expect(err.name).toBe('DiscogsRateLimitedError');
    expect(err.resumeAt - clock.t).toBe(7_000);
    expect(gate.pausedUntil()).toBe(clock.t + 7_000);
  });

  it('holds the next request until a 429 pause ends', async () => {
    let n = 0;
    const stub = stubFetch(() =>
      n++ === 0 ? reply(429, '') : reply(200, '{}'),
    );
    const deps = { fetchImpl: stub.fetchImpl, gate };
    const err = await rejection(
      discogsFetch({ path: '/releases/1', auth: 'none' }, deps),
    );
    const resumeAt = (err as DiscogsRateLimitedError).resumeAt;
    await discogsFetch({ path: '/releases/1', auth: 'none' }, deps);
    expect(clock.t).toBeGreaterThanOrEqual(resumeAt);
  });

  it("401 'Invalid consumer.' (form body) throws DiscogsAuthError, not a JSON parse error", async () => {
    const { result } = await run(
      {
        path: '/oauth/request_token',
        auth: 'consumer',
        callback: 'http://127.0.0.1:3001/api/discogs/callback',
      },
      () =>
        reply(401, 'Invalid consumer.', {
          'content-type': 'application/x-www-form-urlencoded',
        }),
    );
    const err = await rejection(result);
    expect(err).toBeInstanceOf(DiscogsAuthError);
    expect(err.name).toBe('DiscogsAuthError');
    expect(err).not.toBeInstanceOf(SyntaxError);
    expect(isAuthInvalid()).toBe(false);
  });

  it('401 with auth oauth also turns isAuthInvalid() on', async () => {
    saveDiscogsAuth({
      token: CANARY_TOKEN,
      tokenSecret: CANARY_TOKEN_SECRET,
      username: 'owner',
    });
    expect(isAuthInvalid()).toBe(false);
    const { result } = await run(
      { path: '/oauth/identity', auth: 'oauth' },
      () =>
        reply(
          401,
          '{"message":"You must authenticate to access this resource."}',
          {
            'content-type': 'application/json',
          },
        ),
    );
    const err = await rejection(result);
    expect(err.name).toBe('DiscogsAuthError');
    expect(isAuthInvalid()).toBe(true);
  });

  it('500 JSON throws DiscogsUnavailableError', async () => {
    const { result } = await run(
      { path: '/oauth/request_token', auth: 'consumer' },
      () =>
        reply(
          500,
          '{"message":"An internal server error occurred (code: 1)"}',
          {
            'content-type': 'application/json',
          },
        ),
    );
    const err = await rejection(result);
    expect(err).toBeInstanceOf(DiscogsUnavailableError);
    expect(err.name).toBe('DiscogsUnavailableError');
  });

  it('a fetch TypeError throws DiscogsUnavailableError', async () => {
    const { result } = await run({ path: '/releases/1', auth: 'none' }, () => {
      throw new TypeError('fetch failed');
    });
    const err = await rejection(result);
    expect(err).toBeInstanceOf(DiscogsUnavailableError);
    expect(err.name).toBe('DiscogsUnavailableError');
  });

  it('404 throws DiscogsNotFoundError', async () => {
    const { result } = await run(
      { path: '/releases/999999999999', auth: 'none' },
      () =>
        reply(
          404,
          '{"message":"That release does not exist or may have been deleted."}',
        ),
    );
    const err = await rejection(result);
    expect(err).toBeInstanceOf(DiscogsNotFoundError);
    expect(err.name).toBe('DiscogsNotFoundError');
  });

  it('422 throws DiscogsRequestError', async () => {
    const { result } = await run(
      { path: '/database/search', auth: 'none' },
      () => reply(422, '{"message":"Invalid"}'),
    );
    const err = await rejection(result);
    expect(err).toBeInstanceOf(DiscogsRequestError);
    expect(err.name).toBe('DiscogsRequestError');
    expect((err as DiscogsRequestError).status).toBe(422);
  });

  it("keeps the caller's abort reason instead of classifying it", async () => {
    const ctl = new AbortController();
    const reason = new Error('worker stopped');
    reason.name = 'WorkerStoppedError';
    const stub = stubFetch(() => {
      ctl.abort(reason);
      throw new DOMException('aborted', 'AbortError');
    });
    const err = await rejection(
      discogsFetch(
        { path: '/releases/1', auth: 'none', signal: ctl.signal },
        { fetchImpl: stub.fetchImpl, gate },
      ),
    );
    expect(err).toBe(reason);
  });

  describe('read-only allowlist (phase prohibition)', () => {
    for (const req of [
      { method: 'POST', path: '/database/search' },
      { method: 'POST', path: '/users/owner/collection/folders/1/releases/1' },
      { method: 'PUT', path: '/users/owner/collection/folders/1/releases/1' },
      {
        method: 'DELETE',
        path: '/users/owner/collection/folders/1/releases/1',
      },
      { method: 'PATCH', path: '/users/owner' },
      // D-01: the versions lookup is a GET-only allowlist entry.
      { method: 'POST', path: '/masters/13814/versions' },
    ]) {
      it(`${req.method} ${req.path} throws before fetch is called`, async () => {
        const { result, fetchImpl } = await run({ ...req, auth: 'oauth' }, () =>
          reply(200, '{}'),
        );
        const err = await rejection(result);
        expect(err.name).toBe('DiscogsRequestError');
        expect(fetchImpl).not.toHaveBeenCalled();
      });
    }

    it('POST /oauth/access_token is allowed', async () => {
      const { result, calls } = await run(
        {
          method: 'POST',
          path: '/oauth/access_token',
          auth: 'request',
          token: CANARY_TOKEN,
          tokenSecret: CANARY_TOKEN_SECRET,
          verifier: 'v',
        },
        () => reply(200, 'oauth_token=a&oauth_token_secret=b'),
      );
      const res = await result;
      expect(res.status).toBe(200);
      expect(calls[0].init.method).toBe('POST');
    });

    it('a path carrying a query string is refused', async () => {
      const { result, fetchImpl } = await run(
        { path: '/database/search?q=x', auth: 'none' },
        () => reply(200, '{}'),
      );
      expect((await rejection(result)).name).toBe('DiscogsRequestError');
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  describe('write gate (D-06, IMP-04)', () => {
    const ADD = '/users/fake-owner/collection/folders/1/releases/1011';

    beforeEach(() => {
      saveDiscogsAuth({
        token: CANARY_TOKEN,
        tokenSecret: CANARY_TOKEN_SECRET,
        username: 'fake-owner',
      });
    });

    it('POST /users/fake-owner/collection/folders/1/releases/1011 with auth oauth reaches fetch (folder 1 accepted, IMP-02)', async () => {
      const { result, calls } = await run(
        { method: 'POST', path: ADD, auth: 'oauth' },
        () => reply(201, '{"instance_id":5,"resource_url":"x"}'),
      );
      const res = await result;
      expect(res.status).toBe(201);
      expect(calls).toHaveLength(1);
      expect(calls[0].init.method).toBe('POST');
      expect(new URL(calls[0].url).pathname).toBe(ADD);
    });

    it('a folder above 1 is accepted', async () => {
      const { result, calls } = await run(
        {
          method: 'POST',
          path: '/users/fake-owner/collection/folders/8765/releases/1011',
          auth: 'oauth',
        },
        () => reply(201, '{}'),
      );
      await result;
      expect(calls).toHaveLength(1);
    });

    const refused: Array<{ why: string; req: DiscogsRequest }> = [
      {
        why: 'folder 0 (All is read-only, IMP-02)',
        req: {
          method: 'POST',
          path: '/users/fake-owner/collection/folders/0/releases/1011',
          auth: 'oauth',
        },
      },
      {
        why: 'a non-numeric folder id',
        req: {
          method: 'POST',
          path: '/users/fake-owner/collection/folders/abc/releases/1011',
          auth: 'oauth',
        },
      },
      {
        why: 'a negative folder id',
        req: {
          method: 'POST',
          path: '/users/fake-owner/collection/folders/-1/releases/1011',
          auth: 'oauth',
        },
      },
      {
        why: 'a zero-padded folder id',
        req: {
          method: 'POST',
          path: '/users/fake-owner/collection/folders/01/releases/1011',
          auth: 'oauth',
        },
      },
      {
        why: 'a non-numeric release id',
        req: {
          method: 'POST',
          path: '/users/fake-owner/collection/folders/1/releases/abc',
          auth: 'oauth',
        },
      },
      {
        why: 'a negative release id',
        req: {
          method: 'POST',
          path: '/users/fake-owner/collection/folders/1/releases/-1011',
          auth: 'oauth',
        },
      },
      {
        why: 'release id 0',
        req: {
          method: 'POST',
          path: '/users/fake-owner/collection/folders/1/releases/0',
          auth: 'oauth',
        },
      },
      {
        why: 'another username',
        req: {
          method: 'POST',
          path: '/users/someone-else/collection/folders/1/releases/1011',
          auth: 'oauth',
        },
      },
      {
        why: 'the username in another case',
        req: {
          method: 'POST',
          path: '/users/FAKE-OWNER/collection/folders/1/releases/1011',
          auth: 'oauth',
        },
      },
      {
        why: 'a trailing slash',
        req: { method: 'POST', path: `${ADD}/`, auth: 'oauth' },
      },
      {
        why: 'a sub-path of the add path',
        req: { method: 'POST', path: `${ADD}/instances/9`, auth: 'oauth' },
      },
      {
        why: 'PUT on the add path',
        req: { method: 'PUT', path: ADD, auth: 'oauth' },
      },
      {
        why: 'DELETE on the add path',
        req: { method: 'DELETE', path: ADD, auth: 'oauth' },
      },
      {
        why: 'DELETE of an instance',
        req: {
          method: 'DELETE',
          path: '/users/fake-owner/collection/folders/1/releases/1011/instances/9',
          auth: 'oauth',
        },
      },
      {
        why: 'PATCH on the add path',
        req: { method: 'PATCH', path: ADD, auth: 'oauth' },
      },
      {
        why: 'POST to the folders list (create a folder)',
        req: {
          method: 'POST',
          path: '/users/fake-owner/collection/folders',
          auth: 'oauth',
        },
      },
      {
        why: 'POST to a folder (rename a folder)',
        req: {
          method: 'POST',
          path: '/users/fake-owner/collection/folders/1',
          auth: 'oauth',
        },
      },
      {
        why: 'POST to the user profile',
        req: { method: 'POST', path: '/users/fake-owner', auth: 'oauth' },
      },
      {
        why: 'the add POST with auth request',
        req: {
          method: 'POST',
          path: ADD,
          auth: 'request',
          token: CANARY_TOKEN,
          tokenSecret: CANARY_TOKEN_SECRET,
        },
      },
      {
        why: 'the add POST with auth consumer',
        req: { method: 'POST', path: ADD, auth: 'consumer' },
      },
      {
        why: 'the add POST with auth none',
        req: { method: 'POST', path: ADD, auth: 'none' },
      },
      {
        why: 'HEAD',
        req: { method: 'HEAD', path: ADD, auth: 'oauth' },
      },
    ];
    for (const { why, req } of refused) {
      it(`refuses ${why} before fetch is called`, async () => {
        const { result, calls } = await run(req, () => reply(201, '{}'));
        const err = await rejection(result);
        expect(err).toBeInstanceOf(DiscogsRequestError);
        expect(err.message).toContain('refused: not an allowed request');
        expect(calls).toHaveLength(0);
      });
    }

    it('refuses the add POST when no username is stored', async () => {
      clearDiscogsAuth();
      const { result, calls } = await run(
        { method: 'POST', path: ADD, auth: 'oauth' },
        () => reply(201, '{}'),
      );
      expect(await rejection(result)).toBeInstanceOf(DiscogsRequestError);
      expect(calls).toHaveLength(0);
    });

    for (const p of [
      '/users/fake-owner/collection/folders',
      '/users/fake-owner/collection/releases/1011',
      '/masters/13814/versions',
    ]) {
      it(`GET ${p} is allowed`, async () => {
        const { result, calls } = await run({ path: p, auth: 'oauth' }, () =>
          reply(200, '{}'),
        );
        await result;
        expect(calls).toHaveLength(1);
        expect(calls[0].init.method).toBe('GET');
      });
    }

    it('a 500 on the add POST names /users/:u/ and never the username (canary)', async () => {
      saveDiscogsAuth({
        token: CANARY_TOKEN,
        tokenSecret: CANARY_TOKEN_SECRET,
        username: 'CANARYUSER-0123',
      });
      const { result } = await run(
        {
          method: 'POST',
          path: '/users/CANARYUSER-0123/collection/folders/1/releases/1011',
          auth: 'oauth',
        },
        () => reply(500, '{"message":"CANARYUSER-0123 broke"}'),
      );
      const err = await rejection(result);
      expect(err).toBeInstanceOf(DiscogsUnavailableError);
      expect(err.message).toContain('/users/:u/');
      expect(err.message).not.toContain('CANARYUSER');
      expect(String(err.stack ?? '')).not.toContain('CANARYUSER');
    });

    it('a refused request for the canary user never names the username', async () => {
      saveDiscogsAuth({
        token: CANARY_TOKEN,
        tokenSecret: CANARY_TOKEN_SECRET,
        username: 'CANARYUSER-0123',
      });
      const { result, calls } = await run(
        {
          method: 'DELETE',
          path: '/users/CANARYUSER-0123/collection/folders/1/releases/1011',
          auth: 'oauth',
        },
        () => reply(204, ''),
      );
      const err = await rejection(result);
      expect(err.message).toContain('/users/:u/');
      expect(err.message).not.toContain('CANARYUSER');
      expect(calls).toHaveLength(0);
    });
  });

  it('no thrown message contains the consumer secret or the token secret', async () => {
    saveDiscogsAuth({
      token: CANARY_TOKEN,
      tokenSecret: CANARY_TOKEN_SECRET,
      username: 'owner',
    });
    const answers: Array<() => Response> = [
      () => reply(401, 'Invalid consumer.'),
      () => reply(404, '{}'),
      () => reply(422, `{"message":"${CANARY_SECRET}"}`),
      () => reply(429, ''),
      () => reply(500, `{"message":"${CANARY_TOKEN_SECRET}"}`),
      () => {
        throw new TypeError(`fetch failed ${CANARY_SECRET}`);
      },
    ];
    for (const respond of answers) {
      resetDiscogsGateForTests(clock);
      for (const auth of ['consumer', 'oauth'] as const) {
        const err = await rejection(
          discogsFetch(
            { path: '/oauth/identity', query: { q: CANARY_TOKEN }, auth },
            {
              fetchImpl: stubFetch(respond).fetchImpl,
              gate: resetDiscogsGateForTests(clock),
            },
          ),
        );
        for (const needle of [
          CANARY_SECRET,
          CANARY_TOKEN_SECRET,
          CANARY_TOKEN,
          CANARY_KEY,
        ]) {
          expect(err.message).not.toContain(needle);
          expect(String(err.stack ?? '')).not.toContain(needle);
        }
      }
    }
  });
});
