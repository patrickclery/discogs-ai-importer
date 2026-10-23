import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpinesResponse } from '@/lib/scan-types';
import { toDemoRequest } from './fetch-shim';
import {
  DEMO_ERROR_BODY,
  type DemoRoute,
  handle,
  matchRoute,
  matchRouteIn,
} from './routes';
import { resetStore, setClock, subscribe } from './store';

// DEMO-03 / D-11 / D-15: the dispatcher and the fetch shim's request parsing.

const T0 = Date.UTC(2026, 9, 23, 12, 0, 0);
const ORIGIN = 'http://127.0.0.1:4173';

function req(method: string, path: string, body: string | null = null) {
  return { method, url: new URL(path, ORIGIN), headers: new Headers(), body };
}

beforeEach(() => {
  setClock(() => T0);
  resetStore();
});

afterEach(() => {
  setClock(null);
  vi.restoreAllMocks();
});

describe('handle', () => {
  it('answers GET /api/spines from the seeded sample shelf', async () => {
    const res = await handle(req('GET', '/api/spines'));
    expect(res.status).toBe(200);
    const body = res.body as SpinesResponse;
    expect(body.counts.all).toBe(61);
    expect(body.spines).toHaveLength(61);
    expect(body.photos.map((p) => p.filename)).toEqual(['cd-spines.heic']);
    expect(body.discogsActive).toBe(false);
    expect(body.discogs.connected).toBe(true);
    expect(body.discogs.folder).toEqual({ id: 1, name: 'Uncategorized' });
  });

  it('answers GET /api/photos and GET /api/status', async () => {
    const photos = (await handle(req('GET', '/api/photos'))).body as {
      photos: Array<{ id: string }>;
    };
    expect(photos.photos.map((p) => p.id)).toEqual(['demo-photo-1']);
    const status = await handle(req('GET', '/api/status'));
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ worker: { bootId: 'demo' } });
  });

  it('answers an unknown /api path with 501 demo_not_implemented', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await handle(req('POST', '/api/nope/123'));
    expect(res).toEqual({
      status: 501,
      body: { error: 'demo_not_implemented' },
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('POST /api/nope/123'),
    );
  });

  it('answers a throwing handler with the real 500 shape, not a rejection (WR-01)', async () => {
    const route = matchRoute('GET', '/api/spines')?.route;
    if (!route) throw new Error('GET /api/spines route missing');
    vi.spyOn(route, 'handler').mockImplementation(() => {
      throw new Error('boom');
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    let emitted = 0;
    const unsubscribe = subscribe(() => {
      emitted += 1;
    });
    try {
      const res = await handle(req('GET', '/api/spines'));
      expect(res).toEqual({ status: 500, body: DEMO_ERROR_BODY });
      expect(DEMO_ERROR_BODY).toMatchObject({
        error: 'failed',
        message: expect.any(String),
      });
      expect(emitted).toBe(1);
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('GET /api/spines threw'),
        expect.any(Error),
      );
    } finally {
      unsubscribe();
    }
  });

  it('matches the method as well as the path', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await handle(req('DELETE', '/api/spines'))).status).toBe(501);
  });
});

describe('matchRouteIn', () => {
  const table: DemoRoute[] = [
    {
      method: 'POST',
      pattern: '/api/spines/:id/import',
      handler: () => ({ status: 200, body: null }),
    },
    {
      method: 'POST',
      pattern: '/api/spines/:id/import/:kind',
      handler: () => ({ status: 201, body: null }),
    },
  ];

  it('decodes :name params', () => {
    const hit = matchRouteIn(
      table,
      'post',
      '/api/spines/demo%20spine%2F7/import',
    );
    expect(hit?.route).toBe(table[0]);
    expect(hit?.params).toEqual({ id: 'demo spine/7' });
  });

  it('matches one segment per param and whole paths only', () => {
    expect(
      matchRouteIn(table, 'POST', '/api/spines/a/import/another')?.params,
    ).toEqual({ id: 'a', kind: 'another' });
    expect(matchRouteIn(table, 'POST', '/api/spines/a/b/import')).toBeNull();
    expect(matchRouteIn(table, 'POST', '/api/spines//import')).toBeNull();
    expect(matchRouteIn(table, 'GET', '/api/spines/a/import')).toBeNull();
  });
});

describe('toDemoRequest', () => {
  it('never reads a Blob or File body (D-11)', () => {
    for (const blob of [
      new Blob(['fake image bytes'], { type: 'image/jpeg' }),
      new File(['fake image bytes'], 'shelf.jpg', { type: 'image/jpeg' }),
    ]) {
      const readers = [
        vi.spyOn(blob, 'arrayBuffer'),
        vi.spyOn(blob, 'text'),
        vi.spyOn(blob, 'stream'),
        vi.spyOn(blob, 'slice'),
      ];
      const r = toDemoRequest(
        '/api/photos',
        { method: 'post', body: blob, headers: { 'x-filename': 'shelf.jpg' } },
        ORIGIN,
      );
      expect(r.body).toBeNull();
      expect(r.method).toBe('POST');
      expect(r.url.pathname).toBe('/api/photos');
      expect(r.headers.get('x-filename')).toBe('shelf.jpg');
      for (const spy of readers) expect(spy).not.toHaveBeenCalled();
    }
  });

  it('passes a string body through', () => {
    const r = toDemoRequest(
      new URL('/api/spines/s1/fields', ORIGIN),
      { method: 'PATCH', body: '{"field":"artist"}' },
      ORIGIN,
    );
    expect(r).toMatchObject({ method: 'PATCH', body: '{"field":"artist"}' });
    expect(r.url.href).toBe(`${ORIGIN}/api/spines/s1/fields`);
  });

  it('defaults to GET and resolves relative URLs with the query', () => {
    const r = toDemoRequest('/api/spines?status=failed', undefined, ORIGIN);
    expect(r.method).toBe('GET');
    expect(r.body).toBeNull();
    expect(r.url.searchParams.get('status')).toBe('failed');
  });

  it('reads method and headers from a Request input', () => {
    const r = toDemoRequest(
      new Request(`${ORIGIN}/api/discogs/test`, {
        method: 'POST',
        headers: { 'x-a': '1' },
      }),
      undefined,
      ORIGIN,
    );
    expect(r.method).toBe('POST');
    expect(r.headers.get('x-a')).toBe('1');
    expect(r.body).toBeNull();
  });
});
