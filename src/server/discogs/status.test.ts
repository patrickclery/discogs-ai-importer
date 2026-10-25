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
// Plan 04-09: imports.left counts queued + running add_to_collection jobs
// (part of the backlog) and imports.failed counts active or orphaned spines
// whose latest import reads failed (IMP-04, UI-SPEC Header status).

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

function job(lane: string, status: string, type = 'x'): string {
  const id = newId();
  const now = Date.now();
  db()
    .prepare(
      `INSERT INTO jobs (id, lane, type, payload, status, run_after,
         created_at, updated_at)
       VALUES (@id, @lane, @type, '{}', @status, @now, @now, @now)`,
    )
    .run({ id, lane, type, status, now });
  return id;
}

/** An imports row; jobStatus null leaves job_id empty. */
function importRow(
  spineId: string,
  status: string,
  jobStatus: string | null = null,
): void {
  clock += 1000;
  const jobId = jobStatus
    ? job('discogs', jobStatus, 'add_to_collection')
    : null;
  db()
    .prepare(
      `INSERT INTO imports (id, spine_id, release_id, folder_id, status,
         job_id, created_at, updated_at)
       VALUES (@id, @spineId, 1031, 1, @status, @jobId, @createdAt,
         @createdAt)`,
    )
    .run({ id: newId(), spineId, status, jobId, createdAt: clock });
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

  it('imports.left counts queued plus running add_to_collection jobs only', () => {
    job('discogs', 'queued', 'add_to_collection');
    job('discogs', 'running', 'add_to_collection');
    job('discogs', 'failed', 'add_to_collection');
    job('discogs', 'succeeded', 'add_to_collection');
    job('discogs', 'queued', 'search_spine');
    const s = discogsStatus(db());
    expect(s).toMatchObject({ backlog: 3, imports: { left: 2 } });
  });

  it('imports.left counts queued and running resolve_pressing jobs too', () => {
    job('discogs', 'queued', 'resolve_pressing');
    job('discogs', 'running', 'add_to_collection');
    job('discogs', 'failed', 'resolve_pressing');
    expect(discogsStatus(db()).imports?.left).toBe(2);
  });

  it('imports.failed counts a spine whose latest import failed', () => {
    importRow(spine(), 'failed');
    importRow(spine(), 'imported', 'succeeded');
    importRow(spine(), 'pending', 'queued');
    importRow(spine(), 'importing', 'running');
    expect(discogsStatus(db()).imports?.failed).toBe(1);
  });

  it('imports.failed counts a pending or importing import whose job failed, was cancelled or is missing', () => {
    importRow(spine(), 'pending', 'failed');
    importRow(spine(), 'importing', 'cancelled');
    importRow(spine(), 'pending', null);
    expect(discogsStatus(db()).imports?.failed).toBe(3);
  });

  it('imports.failed follows the latest import only', () => {
    const retried = spine();
    importRow(retried, 'failed');
    importRow(retried, 'imported', 'succeeded');
    const again = spine();
    importRow(again, 'imported', 'succeeded');
    importRow(again, 'failed');
    expect(discogsStatus(db()).imports?.failed).toBe(1);
  });

  it('imports.failed counts orphaned spines and skips superseded, dismissed or marked ones', () => {
    importRow(spine('orphaned'), 'failed');
    importRow(spine('superseded'), 'failed');
    importRow(spine('dismissed'), 'failed');
    const marked = spine();
    importRow(marked, 'failed');
    db()
      .prepare('UPDATE spines SET not_on_discogs = 1 WHERE id = ?')
      .run(marked);
    expect(discogsStatus(db()).imports?.failed).toBe(1);
  });

  it('imports carries counts only', () => {
    expect(discogsStatus(db()).imports).toEqual({ left: 0, failed: 0 });
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
