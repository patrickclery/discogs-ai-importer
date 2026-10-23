import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FoldersGetResult } from '@/app/api/discogs/folders/route';
import type { SpinesResponse } from '@/lib/scan-types';
import type { StatusResponse } from '@/lib/status-types';
import { handle } from '../routes';
import { getState, resetStore, setClock } from '../store';

// D-12, D-04, T-05-24: Connect, paste code, Test, Disconnect and the folder
// list answer from the demo account with the real routes' bodies and status
// codes; Connect only ever answers a fixed same-site URL.

const T0 = Date.UTC(2026, 9, 23, 12, 0, 0);
const ORIGIN = 'http://127.0.0.1:4173';
let clockNow = T0;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  clockNow = T0;
  setClock(() => clockNow);
  resetStore();
});

afterEach(() => {
  setClock(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function call(
  method: string,
  path: string,
  body?: unknown,
  opts: { raw?: string; contentType?: string | null; host?: string } = {},
): Promise<{ status: number; body: unknown }> {
  const headers = new Headers();
  const contentType =
    opts.contentType === undefined ? 'application/json' : opts.contentType;
  if (contentType !== null) headers.set('content-type', contentType);
  if (opts.host) headers.set('host', opts.host);
  const raw =
    opts.raw !== undefined
      ? opts.raw
      : body === undefined
        ? null
        : JSON.stringify(body);
  const pending = handle({
    method,
    url: new URL(path, ORIGIN),
    headers,
    body: raw,
  });
  await vi.runAllTimersAsync();
  const res = await pending;
  return { status: res.status, body: res.body };
}

async function spinesConnected(): Promise<boolean> {
  const res = await call('GET', '/api/spines');
  return (res.body as SpinesResponse).discogs.connected;
}

async function statusConnected(): Promise<boolean> {
  const res = await call('GET', '/api/status');
  return (res.body as StatusResponse).discogs.connected;
}

describe('POST /api/discogs/connect', () => {
  it('answers the fixed same-site settings URL under the basePath', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/discogs-ai-importer');
    const res = await call('POST', '/api/discogs/connect', {});
    expect(res).toEqual({
      status: 200,
      body: {
        authorizeUrl: '/discogs-ai-importer/settings/?discogs=connected',
      },
    });
    expect(getState().account.pendingConnectAt).toBe(T0);
  });

  it('ignores request data when building the URL (T-05-24)', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '');
    const res = await call(
      'POST',
      '/api/discogs/connect?next=https://evil.example',
      {},
      { host: 'evil.example' },
    );
    expect(res.body).toEqual({ authorizeUrl: '/settings/?discogs=connected' });
  });

  it('refuses a body with fields, a non-JSON body and a non-JSON type', async () => {
    expect((await call('POST', '/api/discogs/connect', { x: 1 })).status).toBe(
      400,
    );
    const notJson = await call('POST', '/api/discogs/connect', undefined, {
      raw: '{',
    });
    expect(notJson).toEqual({
      status: 400,
      body: { error: 'invalid_body', message: 'The request body is not JSON.' },
    });
    const type = await call(
      'POST',
      '/api/discogs/connect',
      {},
      {
        contentType: 'text/plain',
      },
    );
    expect(type).toEqual({
      status: 415,
      body: { error: 'unsupported_type', message: 'Send application/json.' },
    });
  });

  it('answers credentials_missing without both consumer values', async () => {
    getState().account.consumerSecretTail = null;
    const res = await call('POST', '/api/discogs/connect', {});
    expect(res).toEqual({
      status: 409,
      body: { error: 'credentials_missing' },
    });
  });
});

describe('POST /api/discogs/disconnect and finish', () => {
  it('disconnects, which the Spines and status responses report', async () => {
    expect(await spinesConnected()).toBe(true);
    expect(await statusConnected()).toBe(true);
    const res = await call('POST', '/api/discogs/disconnect', {});
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(getState().account.connected).toBe(false);
    expect(await spinesConnected()).toBe(false);
    expect(await statusConnected()).toBe(false);
  });

  it('a pasted code reconnects as demo-user', async () => {
    await call('POST', '/api/discogs/disconnect', {});
    const res = await call('POST', '/api/discogs/finish', { code: 'x' });
    expect(res).toEqual({ status: 200, body: { username: 'demo-user' } });
    const { account } = getState();
    expect(account).toMatchObject({
      connected: true,
      username: 'demo-user',
      needsReconnect: false,
      pendingConnectAt: null,
    });
    expect(await spinesConnected()).toBe(true);
    expect(await statusConnected()).toBe(true);
  });

  it('an empty code answers the real 400', async () => {
    await call('POST', '/api/discogs/disconnect', {});
    const res = await call('POST', '/api/discogs/finish', { code: '   ' });
    expect(res).toEqual({ status: 400, body: { error: 'empty' } });
    expect(getState().account.connected).toBe(false);
  });

  it('finish refuses an over-long code with the fixed invalid_body text', async () => {
    const res = await call('POST', '/api/discogs/finish', {
      code: 'a'.repeat(201),
    });
    expect(res).toEqual({
      status: 400,
      body: {
        error: 'invalid_body',
        message: 'The request body is not valid.',
      },
    });
  });

  it('disconnect refuses a body with fields', async () => {
    const res = await call('POST', '/api/discogs/disconnect', { x: 1 });
    expect(res.status).toBe(400);
    expect(getState().account.connected).toBe(true);
  });
});

describe('POST /api/discogs/test', () => {
  it('answers the real success for demo-user when connected', async () => {
    getState().account.needsReconnect = true;
    const res = await call('POST', '/api/discogs/test', {});
    expect(res).toEqual({
      status: 200,
      body: { ok: true, username: 'demo-user' },
    });
    expect(getState().account.needsReconnect).toBe(false);
  });

  it('answers not_connected 409 when not connected', async () => {
    await call('POST', '/api/discogs/disconnect', {});
    const res = await call('POST', '/api/discogs/test', {});
    expect(res).toEqual({ status: 409, body: { error: 'not_connected' } });
  });
});

describe('/api/discogs/folders', () => {
  it('GET answers the demo folders and the current folder', async () => {
    getState().account.folderId = 2;
    const res = await call('GET', '/api/discogs/folders');
    expect(res.status).toBe(200);
    const body = res.body as FoldersGetResult;
    expect(body.folders.map((f) => f.name)).toEqual([
      'Uncategorized',
      'Jazz',
      'Soundtracks',
    ]);
    expect(body).toMatchObject({
      selectedId: 2,
      savedId: 2,
      savedMissing: false,
      fetchedAt: getState().initAt,
      connected: true,
    });
  });

  it('GET reports not connected after Disconnect', async () => {
    await call('POST', '/api/discogs/disconnect', {});
    const res = await call('GET', '/api/discogs/folders');
    expect((res.body as FoldersGetResult).connected).toBe(false);
  });

  it('POST {refresh:true} answers the refresh result after a delay', async () => {
    clockNow = T0 + 60_000;
    const pending = handle({
      method: 'POST',
      url: new URL('/api/discogs/folders', ORIGIN),
      headers: new Headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ refresh: true }),
    });
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(settled).toBe(false);
    await vi.runAllTimersAsync();
    const res = await pending;
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      selectedId: 1,
      fetchedAt: T0 + 60_000,
    });
    expect((res.body as { folders: unknown[] }).folders.length).toBe(3);
    const get = await call('GET', '/api/discogs/folders');
    expect((get.body as FoldersGetResult).fetchedAt).toBe(T0 + 60_000);
  });

  it('POST answers not_connected 409 when not connected, 400 on a bad body', async () => {
    expect(
      (await call('POST', '/api/discogs/folders', { refresh: false })).status,
    ).toBe(400);
    await call('POST', '/api/discogs/disconnect', {});
    const res = await call('POST', '/api/discogs/folders', { refresh: true });
    expect(res).toEqual({ status: 409, body: { error: 'not_connected' } });
  });
});
