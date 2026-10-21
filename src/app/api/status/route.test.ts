import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTempDataDir } from '../../../../test/helpers/temp-data-dir';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

import type { StatusResponse } from '@/lib/status-types';
import { getDb } from '@/server/db/client';
import { saveDiscogsAuth } from '@/server/discogs/auth';
import { resetDiscogsGateForTests } from '@/server/discogs/gate';
import { claimNext, enqueue } from '@/server/jobs/queue';
import { SECRET_ENV_NAMES, saveSecrets } from '@/server/secrets';
import { GET } from './route';

// GET /api/status, Discogs part (D-07, DISC-02): the discogs-lane backlog
// (queued + running only), the gate's pausedUntil, and a connected flag;
// never a username or token (T-03-28).

const START = 1_800_000_000_000;
const CANARY_TOKEN = 'CANARYTOKEN-0123456789efgh';
const CANARY_TOKEN_SECRET = 'CANARYTOKENSECRET-0123456789ijkl';

async function status(): Promise<StatusResponse> {
  const res = await GET();
  expect(res.status).toBe(200);
  const text = await res.text();
  for (const canary of [CANARY_TOKEN, CANARY_TOKEN_SECRET, 'fake-owner']) {
    expect(text).not.toContain(canary);
  }
  return JSON.parse(text) as StatusResponse;
}

describe('GET /api/status (discogs)', () => {
  useTempDataDir();
  let dir = '';
  const names = ['SECRETS_FILE', ...Object.values(SECRET_ENV_NAMES)];
  const saved: Record<string, string | undefined> = {};
  let t = START;

  beforeEach(() => {
    for (const n of names) {
      saved[n] = process.env[n];
      delete process.env[n];
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-status-route-'));
    process.env.SECRETS_FILE = path.join(dir, 'secrets.json');
    t = START;
    resetDiscogsGateForTests({
      now: () => t,
      sleep: async (ms: number) => {
        t += ms;
      },
    });
  });

  afterEach(() => {
    for (const n of names) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('empty: backlog 0, not paused, not connected', async () => {
    const body = await status();
    expect(body.discogs).toMatchObject({
      connected: false,
      backlog: 0,
      pausedUntil: null,
    });
  });

  it('backlog counts queued and running discogs jobs only', async () => {
    for (let i = 0; i < 3; i += 1) {
      enqueue({ lane: 'discogs', type: 'search_spine', runAfter: 0 });
    }
    enqueue({ lane: 'anthropic', type: 'scan_photo', runAfter: 0 });
    const done = enqueue({
      lane: 'discogs',
      type: 'search_spine',
      runAfter: 0,
    });
    getDb()
      .$client.prepare("UPDATE jobs SET status = 'succeeded' WHERE id = ?")
      .run(done.id);
    expect(claimNext('discogs')).toBeDefined();
    const body = await status();
    expect(body.discogs.backlog).toBe(3);
  });

  it('pausedUntil is the gate resume time while paused, and connected follows the stored sign-in', async () => {
    saveSecrets({
      discogsConsumerKey: 'CANARYDISCOGSKEY-0123456789wxyz',
      discogsConsumerSecret: 'CANARYDISCOGSSECRET-0123456789abcd',
    });
    saveDiscogsAuth({
      token: CANARY_TOKEN,
      tokenSecret: CANARY_TOKEN_SECRET,
      username: 'fake-owner',
    });
    resetDiscogsGateForTests({
      now: () => t,
      sleep: async (ms: number) => {
        t += ms;
      },
    }).pause(42_000);
    const body = await status();
    expect(body.discogs.connected).toBe(true);
    expect(body.discogs.pausedUntil).toBe(START + 42_000);
    t = START + 42_001;
    expect((await status()).discogs.pausedUntil).toBeNull();
  });
});
