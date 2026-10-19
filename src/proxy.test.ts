import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from './proxy';

function call(
  method: string,
  headers: Record<string, string>,
): { status: number } {
  const req = new NextRequest('http://127.0.0.1:3000/api/dev/jobs', {
    method,
    headers,
  });
  return proxy(req);
}

const HOST = '127.0.0.1:3000';

describe('proxy loopback guard', () => {
  it('passes a same-origin POST and an Origin-less POST', () => {
    expect(call('POST', { host: HOST, origin: `http://${HOST}` }).status).toBe(
      200,
    );
    expect(
      call('POST', { host: 'localhost:3000', origin: 'http://LOCALHOST:3000' })
        .status,
    ).toBe(200);
    expect(call('POST', { host: HOST }).status).toBe(200);
  });

  it('refuses a POST from another localhost port or scheme (WR-01)', () => {
    for (const origin of [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'https://127.0.0.1:3000',
      'http://localhost:3000',
      'http://evil.test',
      'null',
      'not a url',
    ]) {
      expect(call('POST', { host: HOST, origin }).status, origin).toBe(403);
    }
  });

  it('refuses cross-site and same-site fetch metadata on mutations', () => {
    for (const site of ['cross-site', 'same-site']) {
      expect(
        call('POST', { host: HOST, 'sec-fetch-site': site }).status,
        site,
      ).toBe(403);
    }
    for (const site of ['same-origin', 'none']) {
      expect(
        call('POST', {
          host: HOST,
          origin: `http://${HOST}`,
          'sec-fetch-site': site,
        }).status,
        site,
      ).toBe(200);
    }
  });

  it('does not Origin-check GET, but still checks Host', () => {
    expect(
      call('GET', { host: HOST, origin: 'http://localhost:5173' }).status,
    ).toBe(200);
    expect(call('GET', { host: 'evil.test' }).status).toBe(403);
  });
});
