import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

import {
  getDiscogsAuth,
  hasPendingConnect,
  isAuthInvalid,
  markAuthInvalid,
  saveDiscogsAuth,
  setPendingConnect,
} from '@/server/discogs/auth';
import { SECRET_ENV_NAMES, saveSecrets } from '@/server/secrets';
import { POST } from './route';

// POST /api/discogs/disconnect (D-02, T-03-10): JSON only (415); success
// deletes the three token keys locally (Discogs has no revoke endpoint) and
// any pending connect; a write failure is a 500 without the file content.

const CANARY_KEY = 'CANARYDISCOGSKEY-0123456789wxyz';
const CANARY_SECRET = 'CANARYDISCOGSSECRET-0123456789abcd';
const CANARY_TOKEN = 'CANARYTOKEN-0123456789efgh';
const CANARY_TOKEN_SECRET = 'CANARYTOKENSECRET-0123456789ijkl';
const TOKEN_KEYS = [
  'discogsOAuthToken',
  'discogsOAuthTokenSecret',
  'discogsUsername',
];

function post(body: unknown = {}, contentType = 'application/json'): Request {
  return new Request('http://127.0.0.1:3000/api/discogs/disconnect', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: JSON.stringify(body),
  });
}

describe('POST /api/discogs/disconnect', () => {
  let dir = '';
  const file = () => path.join(dir, 'secrets.json');
  const readFile = () =>
    JSON.parse(fs.readFileSync(file(), 'utf8')) as Record<string, string>;
  const names = ['SECRETS_FILE', ...Object.values(SECRET_ENV_NAMES)];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const n of names) {
      saved[n] = process.env[n];
      delete process.env[n];
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-discogs-disconnect-'));
    process.env.SECRETS_FILE = file();
    saveSecrets({
      discogsConsumerKey: CANARY_KEY,
      discogsConsumerSecret: CANARY_SECRET,
    });
    saveDiscogsAuth({
      token: CANARY_TOKEN,
      tokenSecret: CANARY_TOKEN_SECRET,
      username: 'fake-owner',
    });
  });

  afterEach(() => {
    for (const n of names) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('415 for text/plain, and the connection stays', async () => {
    const res = await POST(post({}, 'text/plain'));
    expect(res.status).toBe(415);
    expect(getDiscogsAuth()).not.toBeNull();
  });

  it('400 for a body with extra keys, and the connection stays', async () => {
    const res = await POST(post({ all: true }));
    expect(res.status).toBe(400);
    expect(getDiscogsAuth()).not.toBeNull();
  });

  it('200 ok: the three token keys and the pending connect are gone', async () => {
    setPendingConnect('fake-rt-1', {
      secret: 'fake-rts-1',
      callback: 'http://127.0.0.1:3000/api/discogs/callback',
      expiresAt: Date.now() + 60_000,
    });
    markAuthInvalid();
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(getDiscogsAuth()).toBeNull();
    const stored = readFile();
    for (const k of TOKEN_KEYS) expect(stored).not.toHaveProperty(k);
    // The consumer credentials are untouched.
    expect(stored.discogsConsumerKey).toBe(CANARY_KEY);
    expect(stored.discogsConsumerSecret).toBe(CANARY_SECRET);
    expect(hasPendingConnect()).toBe(false);
    expect(isAuthInvalid()).toBe(false);
  });

  it('500 failed without the file content when secrets.json is broken', async () => {
    fs.writeFileSync(
      file(),
      `{"discogsOAuthTokenSecret": "${CANARY_TOKEN_SECRET}"`,
      { mode: 0o600 },
    );
    const res = await POST(post());
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain(CANARY_TOKEN_SECRET);
    const body = JSON.parse(text) as { error: string; message: string };
    expect(body.error).toBe('failed');
    expect(body.message.length).toBeGreaterThan(0);
    expect(body.message.length).toBeLessThanOrEqual(160);
  });
});
