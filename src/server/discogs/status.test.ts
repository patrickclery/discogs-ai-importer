import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';
import { getDb } from '../db/client';
import { newId } from '../ids';
import { SECRET_ENV_NAMES } from '../secrets';
import { clearDiscogsAuth, saveDiscogsAuth } from './auth';
import { resetDiscogsGateForTests } from './gate';
import { discogsStatus } from './status';

// The Discogs part of /api/status (D-07, Pitfall 8): backlog is queued +
// running discogs jobs; failedSpines counts active or orphaned spines whose
// latest auto or again search failed, so a successful retry stops counting.

let clock = 1_800_000_000_000;

function db() {
  return getDb().$client;
}

function seedPhoto(): void {
  const now = Date.now();
  db()
    .prepare(
      `INSERT INTO photos (id, sha256, original_name, mime, bytes, original_path,
         created_at, updated_at)
       VALUES ('photo-1', 'abc', 'shelf.jpg', 'image/jpeg', 1, 'photos/x.jpg',
         @now, @now)
       ON CONFLICT DO NOTHING`,
    )
    .run({ now });
}

function spine(state = 'active'): string {
  seedPhoto();
  const id = newId();
  const now = Date.now();
  db()
    .prepare(
      `INSERT INTO spines (id, photo_id, state, created_at, updated_at)
       VALUES (@id, 'photo-1', @state, @now, @now)`,
    )
    .run({ id, state, now });
  return id;
}

function job(lane: string, status: string): string {
  const id = newId();
  const now = Date.now();
  db()
    .prepare(
      `INSERT INTO jobs (id, lane, type, payload, status, run_after,
         created_at, updated_at)
       VALUES (@id, @lane, 'x', '{}', @status, @now, @now, @now)`,
    )
    .run({ id, lane, status, now });
  return id;
}

function search(
  spineId: string,
  kind: string,
  status: string,
  jobStatus: string | null = null,
): void {
  clock += 1000;
  const jobId = jobStatus ? job('discogs', jobStatus) : null;
  db()
    .prepare(
      `INSERT INTO discogs_searches (id, spine_id, kind, inputs_json, status,
         job_id, created_at)
       VALUES (@id, @spineId, @kind, '{}', @status, @jobId, @createdAt)`,
    )
    .run({ id: newId(), spineId, kind, status, jobId, createdAt: clock });
}

/** A throwaway secrets file: never the owner's real secrets.json. */
function useTempSecrets(): void {
  let dir = '';
  const names = ['SECRETS_FILE', ...Object.values(SECRET_ENV_NAMES)];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const n of names) {
      saved[n] = process.env[n];
      delete process.env[n];
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-discogs-status-'));
    process.env.SECRETS_FILE = path.join(dir, 'secrets.json');
  });
  afterEach(() => {
    for (const n of names) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

describe('discogsStatus', () => {
  useTempDataDir();
  useTempSecrets();
  beforeEach(() => {
    resetDiscogsGateForTests();
  });

  it('backlog counts queued plus running discogs jobs only', () => {
    job('discogs', 'queued');
    job('discogs', 'queued');
    job('discogs', 'running');
    job('discogs', 'failed');
    job('discogs', 'succeeded');
    job('anthropic', 'queued');
    expect(discogsStatus(db()).backlog).toBe(3);
  });

  it('counts a spine whose latest auto search failed or auth_failed', () => {
    search(spine(), 'auto', 'failed');
    search(spine(), 'auto', 'auth_failed');
    search(spine(), 'auto', 'done');
    expect(discogsStatus(db()).failedSpines).toBe(2);
  });

  it('counts a still-queued search whose job failed', () => {
    search(spine(), 'auto', 'queued', 'failed');
    search(spine(), 'auto', 'queued', 'queued');
    expect(discogsStatus(db()).failedSpines).toBe(1);
  });

  it('does not count a spine whose newer again search succeeded', () => {
    const s = spine();
    search(s, 'auto', 'failed');
    search(s, 'again', 'done');
    expect(discogsStatus(db()).failedSpines).toBe(0);
  });

  it('counts a spine whose newer again search failed after an auto success', () => {
    const s = spine();
    search(s, 'auto', 'done');
    search(s, 'again', 'failed');
    expect(discogsStatus(db()).failedSpines).toBe(1);
  });

  it('ignores manual and release searches when picking the latest', () => {
    const s = spine();
    search(s, 'auto', 'failed');
    search(s, 'manual', 'done');
    search(s, 'release', 'done');
    expect(discogsStatus(db()).failedSpines).toBe(1);
  });

  it('counts orphaned spines and skips superseded or dismissed ones', () => {
    search(spine('orphaned'), 'auto', 'failed');
    search(spine('superseded'), 'auto', 'failed');
    search(spine('dismissed'), 'auto', 'failed');
    expect(discogsStatus(db()).failedSpines).toBe(1);
  });

  it('reports not connected and no pause with no sign-in stored', () => {
    const s = discogsStatus(db());
    expect(s.connected).toBe(false);
    expect(s.pausedUntil).toBeNull();
  });

  it('reports connected while a sign-in is stored', () => {
    saveDiscogsAuth({
      token: 'CANARYTOKEN-0123456789efgh',
      tokenSecret: 'CANARYTOKENSECRET-0123456789ijkl',
      username: 'fake-owner',
    });
    expect(discogsStatus(db()).connected).toBe(true);
    clearDiscogsAuth();
    expect(discogsStatus(db()).connected).toBe(false);
  });

  it('reports not connected, without throwing, when the secrets file is unreadable', () => {
    fs.writeFileSync(process.env.SECRETS_FILE as string, '{not json');
    expect(discogsStatus(db()).connected).toBe(false);
  });

  it('reports the gate pause time while Discogs has asked to slow down', () => {
    const t = { now: 1_000_000 };
    const gate = resetDiscogsGateForTests({
      now: () => t.now,
      sleep: async () => {},
    });
    gate.pause(12_000);
    expect(discogsStatus(db()).pausedUntil).toBe(1_012_000);
    t.now = 1_012_000;
    expect(discogsStatus(db()).pausedUntil).toBeNull();
  });
});
