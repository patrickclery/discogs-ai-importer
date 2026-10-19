import { describe, expect, it, vi } from 'vitest';
import { useTempDataDir } from '../../../../../test/helpers/temp-data-dir';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

import { POST } from './route';

function post(body: unknown, contentType?: string): Request {
  const headers: Record<string, string> = {};
  if (contentType) headers['content-type'] = contentType;
  return new Request('http://127.0.0.1:3000/api/dev/jobs', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /api/dev/jobs', () => {
  useTempDataDir();

  it('refuses a non-JSON content type with 415 (no-preflight form POST, WR-01)', async () => {
    for (const type of [
      'text/plain',
      'text/plain;charset=UTF-8',
      'application/x-www-form-urlencoded',
      undefined,
    ]) {
      const res = await POST(post({ payload: { ms: 0 } }, type));
      expect(res.status, String(type)).toBe(415);
    }
  });

  it('accepts application/json', async () => {
    const res = await POST(
      post({ payload: { ms: 0 } }, 'application/json; charset=utf-8'),
    );
    expect(res.status).toBe(201);
  });
});
