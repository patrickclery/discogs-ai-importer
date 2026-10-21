import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { orphanScenario } from '../../../test/helpers/scan-runs';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';
import { getDb } from '../db/client';
import { releaseDedupeKey } from '../jobs/queue';
import { updateSpineField } from '../scan/fields';
import { SECRET_ENV_NAMES, saveSecrets } from '../secrets';
import {
  clearAuthInvalid,
  clearDiscogsAuth,
  markAuthInvalid,
  saveDiscogsAuth,
} from './auth';
import {
  enqueueAutoSearch,
  enqueueAutoSearchesForPhoto,
  enqueueMissingSearches,
} from './enqueue';
import { finishSearch } from './store';

// Every automatic enqueue point (D-08, RESEARCH Pattern 5): one search per
// active CD spine per set of inputs, the connect backfill and its
// maintenance safety net, and the rules that keep a revoked sign-in or a
// failed search from looping (T-03-17, D-06). No request is ever made.

function useTempSecrets(): void {
  let dir = '';
  const names = ['SECRETS_FILE', ...Object.values(SECRET_ENV_NAMES)];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const n of names) {
      saved[n] = process.env[n];
      delete process.env[n];
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-enqueue-'));
    process.env.SECRETS_FILE = path.join(dir, 'secrets.json');
    saveSecrets({
      discogsConsumerKey: 'CANARYDISCOGSKEY-0123456789wxyz',
      discogsConsumerSecret: 'CANARYDISCOGSSECRET-0123456789abcd',
    });
  });
  afterEach(() => {
    clearAuthInvalid();
    for (const n of names) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

function connect(): void {
  saveDiscogsAuth({
    token: 'CANARYTOKEN-0123456789efgh',
    tokenSecret: 'CANARYTOKENSECRET-0123456789ijkl',
    username: 'fake-owner',
  });
}

type Row = { id: string; spine_id: string; status: string; job_id: string };

function autoSearches(spineId?: string): Row[] {
  return getDb()
    .$client.prepare(
      `SELECT id, spine_id, status, job_id FROM discogs_searches
       WHERE kind = 'auto' AND (@spineId IS NULL OR spine_id = @spineId)
       ORDER BY created_at, id`,
    )
    .all({ spineId: spineId ?? null }) as Row[];
}

function discogsJobs(): number {
  return (
    getDb()
      .$client.prepare("SELECT COUNT(*) AS n FROM jobs WHERE lane = 'discogs'")
      .get() as { n: number }
  ).n;
}

function setMediaKind(spineId: string, kind: string): void {
  getDb()
    .$client.prepare(
      `UPDATE spine_detections SET media_kind = @kind
       WHERE id = (SELECT current_detection_id FROM spines WHERE id = @spineId)`,
    )
    .run({ kind, spineId });
}

/** Ends a spine's only queued auto search the way search_spine would. */
function endSearch(
  spineId: string,
  status: 'not_connected' | 'auth_failed' | 'failed' | 'done',
): void {
  const db = getDb().$client;
  const [s] = autoSearches(spineId).filter((r) => r.status === 'queued');
  expect(s).toBeDefined();
  finishSearch(db, s.id, { status });
  const jobStatus = status === 'failed' ? 'failed' : 'succeeded';
  db.prepare('UPDATE jobs SET status = @jobStatus WHERE id = @id').run({
    jobStatus,
    id: s.job_id,
  });
  // search_spine releases the key only for the two unauthed outcomes.
  if (status === 'not_connected' || status === 'auth_failed') {
    releaseDedupeKey(s.job_id);
  }
}

/**
 * The orphan scenario scanned while disconnected, with spine 3 turned
 * unsure: active CD spines are 0, 1, 2 and V; 3 is unsure, 4 orphaned and
 * 5 superseded.
 */
async function scanned() {
  const sc = await orphanScenario();
  const [s0, s1, s2, s3] = sc.spineIds;
  setMediaKind(s3, 'unsure');
  return { ...sc, cd: [s0, s1, s2, sc.vId], unsureId: s3 };
}

describe('discogs enqueue', () => {
  useTempDataDir();
  useTempSecrets();

  describe('enqueueAutoSearchesForPhoto', () => {
    it('one search per active CD spine; unsure, orphaned and superseded get none', async () => {
      const sc = await scanned();
      expect(autoSearches()).toHaveLength(0);
      connect();
      expect(enqueueAutoSearchesForPhoto(getDb().$client, sc.photoId)).toBe(4);
      expect(new Set(autoSearches().map((r) => r.spine_id))).toEqual(
        new Set(sc.cd),
      );
      for (const id of [sc.unsureId, sc.orphanId, sc.supersededId]) {
        expect(autoSearches(id)).toHaveLength(0);
      }
      expect(discogsJobs()).toBe(4);
    });

    it('a second call with unchanged fields creates nothing', async () => {
      const sc = await scanned();
      connect();
      const db = getDb().$client;
      enqueueAutoSearchesForPhoto(db, sc.photoId);
      expect(enqueueAutoSearchesForPhoto(db, sc.photoId)).toBe(0);
      expect(autoSearches()).toHaveLength(4);
      expect(discogsJobs()).toBe(4);
    });

    it("changing one spine's title enqueues only that spine", async () => {
      const sc = await scanned();
      connect();
      const db = getDb().$client;
      enqueueAutoSearchesForPhoto(db, sc.photoId);
      expect(updateSpineField(sc.cd[2], 'title', 'A New Title').ok).toBe(true);
      expect(enqueueAutoSearchesForPhoto(db, sc.photoId)).toBe(1);
      expect(autoSearches(sc.cd[2])).toHaveLength(2);
      expect(autoSearches()).toHaveLength(5);
    });

    it('a whitespace-only edit is not a change', async () => {
      const sc = await scanned();
      connect();
      const db = getDb().$client;
      updateSpineField(sc.cd[0], 'title', 'Same Title');
      enqueueAutoSearchesForPhoto(db, sc.photoId);
      updateSpineField(sc.cd[0], 'title', '  Same   Title ');
      expect(enqueueAutoSearchesForPhoto(db, sc.photoId)).toBe(0);
    });

    it('nothing is enqueued when not connected or when auth is invalid', async () => {
      const sc = await scanned();
      const db = getDb().$client;
      expect(enqueueAutoSearchesForPhoto(db, sc.photoId)).toBe(0);
      connect();
      markAuthInvalid();
      expect(enqueueAutoSearchesForPhoto(db, sc.photoId)).toBe(0);
      expect(enqueueMissingSearches({ includeAuthFailed: true })).toBe(0);
      clearAuthInvalid();
      clearDiscogsAuth();
      expect(enqueueMissingSearches({ includeAuthFailed: true })).toBe(0);
      expect(autoSearches()).toHaveLength(0);
      expect(discogsJobs()).toBe(0);
    });
  });

  describe('enqueueAutoSearch', () => {
    it('the same spine twice with identical inputs creates one job', async () => {
      const sc = await scanned();
      connect();
      const db = getDb().$client;
      expect(enqueueAutoSearch(db, sc.cd[0])).toBe(true);
      expect(enqueueAutoSearch(db, sc.cd[0])).toBe(false);
      expect(autoSearches(sc.cd[0])).toHaveLength(1);
      expect(discogsJobs()).toBe(1);
    });

    it('two spines with identical fields both get jobs', async () => {
      const sc = await scanned();
      connect();
      const db = getDb().$client;
      for (const id of [sc.cd[0], sc.cd[1]]) {
        for (const [field, value] of [
          ['artist', 'Twin Artist'],
          ['title', 'Twin Title'],
          ['catalog_number', 'TW-1'],
          ['raw_text', 'Twin Artist - Twin Title TW-1'],
        ] as const) {
          updateSpineField(id, field, value);
        }
      }
      expect(enqueueAutoSearch(db, sc.cd[0])).toBe(true);
      expect(enqueueAutoSearch(db, sc.cd[1])).toBe(true);
      expect(discogsJobs()).toBe(2);
    });

    it('a not_connected or auth_failed latest search is no baseline', async () => {
      const sc = await scanned();
      connect();
      const db = getDb().$client;
      enqueueAutoSearch(db, sc.cd[0]);
      endSearch(sc.cd[0], 'auth_failed');
      expect(enqueueAutoSearch(db, sc.cd[0])).toBe(true);
      endSearch(sc.cd[0], 'not_connected');
      expect(enqueueAutoSearch(db, sc.cd[0])).toBe(true);
      expect(autoSearches(sc.cd[0]).map((r) => r.status)).toEqual([
        'auth_failed',
        'not_connected',
        'queued',
      ]);
    });

    it('a failed or done latest search with the same inputs is a baseline', async () => {
      const sc = await scanned();
      connect();
      const db = getDb().$client;
      enqueueAutoSearch(db, sc.cd[0]);
      endSearch(sc.cd[0], 'failed');
      expect(enqueueAutoSearch(db, sc.cd[0])).toBe(false);
      enqueueAutoSearch(db, sc.cd[1]);
      endSearch(sc.cd[1], 'done');
      expect(enqueueAutoSearch(db, sc.cd[1])).toBe(false);
    });
  });

  describe('enqueueMissingSearches', () => {
    it('backfills every active CD spine once; a second call enqueues nothing', async () => {
      const sc = await scanned();
      connect();
      expect(enqueueMissingSearches({ includeAuthFailed: true })).toBe(4);
      expect(new Set(autoSearches().map((r) => r.spine_id))).toEqual(
        new Set(sc.cd),
      );
      expect(enqueueMissingSearches({ includeAuthFailed: true })).toBe(0);
      expect(enqueueMissingSearches({ includeAuthFailed: false })).toBe(0);
      expect(discogsJobs()).toBe(4);
    });

    it('skips spines already searched', async () => {
      const sc = await scanned();
      connect();
      const db = getDb().$client;
      enqueueAutoSearch(db, sc.cd[0]);
      endSearch(sc.cd[0], 'done');
      expect(enqueueMissingSearches({ includeAuthFailed: false })).toBe(3);
      expect(autoSearches(sc.cd[0])).toHaveLength(1);
    });

    it('re-picks a not_connected latest search with or without includeAuthFailed', async () => {
      const sc = await scanned();
      connect();
      enqueueMissingSearches({ includeAuthFailed: false });
      endSearch(sc.cd[0], 'not_connected');
      expect(enqueueMissingSearches({ includeAuthFailed: false })).toBe(1);
      endSearch(sc.cd[1], 'not_connected');
      expect(enqueueMissingSearches({ includeAuthFailed: true })).toBe(1);
    });

    it('re-picks an auth_failed latest search only with includeAuthFailed', async () => {
      const sc = await scanned();
      connect();
      enqueueMissingSearches({ includeAuthFailed: true });
      endSearch(sc.cd[0], 'auth_failed');
      expect(enqueueMissingSearches({ includeAuthFailed: false })).toBe(0);
      expect(enqueueMissingSearches({ includeAuthFailed: false })).toBe(0);
      expect(enqueueMissingSearches({ includeAuthFailed: true })).toBe(1);
      expect(autoSearches(sc.cd[0]).map((r) => r.status)).toEqual([
        'auth_failed',
        'queued',
      ]);
      expect(enqueueMissingSearches({ includeAuthFailed: true })).toBe(0);
    });

    it('never re-enqueues a spine whose latest search failed', async () => {
      const sc = await scanned();
      connect();
      enqueueMissingSearches({ includeAuthFailed: true });
      endSearch(sc.cd[0], 'failed');
      expect(enqueueMissingSearches({ includeAuthFailed: true })).toBe(0);
      expect(enqueueMissingSearches({ includeAuthFailed: false })).toBe(0);
      expect(autoSearches(sc.cd[0])).toHaveLength(1);
    });

    it('an auth_failed search over a done one with the same inputs is not repeated', async () => {
      const sc = await scanned();
      connect();
      const db = getDb().$client;
      enqueueAutoSearch(db, sc.cd[0]);
      endSearch(sc.cd[0], 'done');
      // An owner's Search again that a revoked sign-in ended auth_failed.
      db.prepare(
        `INSERT INTO discogs_searches (id, spine_id, kind, input_hash,
           inputs_json, status, created_at)
         SELECT 'again-1', spine_id, 'again', input_hash, inputs_json,
           'auth_failed', created_at + 1
         FROM discogs_searches WHERE spine_id = @spineId`,
      ).run({ spineId: sc.cd[0] });
      const before = discogsJobs();
      enqueueMissingSearches({ includeAuthFailed: true });
      expect(autoSearches(sc.cd[0])).toHaveLength(1);
      expect(discogsJobs()).toBe(before + 3);
    });
  });
});
