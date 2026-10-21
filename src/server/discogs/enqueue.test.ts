import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fieldOf, orphanScenario } from '../../../test/helpers/scan-runs';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';
import { getDb } from '../db/client';
import { runSearchSpine } from '../jobs/handlers/search-spine';
import { claimNext, releaseDedupeKey } from '../jobs/queue';
import { updateSpineField } from '../scan/fields';
import { reattachSpine } from '../scan/orphans';
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
  enqueueExplicitSearch,
  enqueueMissingSearches,
} from './enqueue';
import { resetDiscogsGateForTests } from './gate';
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

  describe('enqueueExplicitSearch (Search again / Retry, Pitfall 1)', () => {
    type Explicit = {
      id: string;
      kind: string;
      input_hash: string;
      job_id: string;
      dedupe_key: string;
    };
    function explicitSearches(spineId: string): Explicit[] {
      return getDb()
        .$client.prepare(
          `SELECT s.id, s.kind, s.input_hash, s.job_id, j.dedupe_key
           FROM discogs_searches s JOIN jobs j ON j.id = s.job_id
           WHERE s.spine_id = @spineId AND s.kind = 'again'
           ORDER BY s.created_at, s.id`,
        )
        .all({ spineId }) as Explicit[];
    }
    function finishJob(searchId: string, jobId: string): void {
      const db = getDb().$client;
      finishSearch(db, searchId, { status: 'done' });
      db.prepare("UPDATE jobs SET status = 'succeeded' WHERE id = ?").run(
        jobId,
      );
    }

    it('two calls with identical inputs create two searches and two jobs', async () => {
      const sc = await scanned();
      connect();
      const db = getDb().$client;
      const a = enqueueExplicitSearch(db, { spineId: sc.cd[0], kind: 'again' });
      expect(a.status).toBe('ok');
      const [first] = explicitSearches(sc.cd[0]);
      finishJob(first.id, first.job_id);
      const b = enqueueExplicitSearch(db, { spineId: sc.cd[0], kind: 'again' });
      expect(b.status).toBe('ok');
      const rows = explicitSearches(sc.cd[0]);
      expect(rows).toHaveLength(2);
      expect(rows[0].input_hash).toBe(rows[1].input_hash);
      expect(rows[0].job_id).not.toBe(rows[1].job_id);
      expect(rows.map((r) => r.dedupe_key)).toEqual(
        rows.map((r) => `search:${r.id}`),
      );
      expect(discogsJobs()).toBe(2);
    });

    it('refuses while the latest search is queued, and for unknown or superseded spines', async () => {
      const sc = await scanned();
      connect();
      const db = getDb().$client;
      expect(enqueueAutoSearch(db, sc.cd[1])).toBe(true);
      expect(
        enqueueExplicitSearch(db, { spineId: sc.cd[1], kind: 'again' }),
      ).toEqual({ status: 'busy' });
      expect(
        enqueueExplicitSearch(db, { spineId: 'nope', kind: 'again' }),
      ).toEqual({ status: 'not_found' });
      expect(
        enqueueExplicitSearch(db, { spineId: sc.supersededId, kind: 'again' }),
      ).toEqual({ status: 'not_searchable' });
      expect(
        enqueueExplicitSearch(db, { spineId: sc.orphanId, kind: 'again' })
          .status,
      ).toBe('ok');
      expect(discogsJobs()).toBe(2);
    });

    it('a failed latest search can be retried', async () => {
      const sc = await scanned();
      connect();
      const db = getDb().$client;
      expect(enqueueAutoSearch(db, sc.cd[2])).toBe(true);
      endSearch(sc.cd[2], 'failed');
      expect(
        enqueueExplicitSearch(db, { spineId: sc.cd[2], kind: 'again' }).status,
      ).toBe('ok');
      expect(explicitSearches(sc.cd[2])).toHaveLength(1);
    });
  });

  // Nyquist gap audit (Phase 3, CR-01 / WR-01). These assert the CORRECT
  // behaviour from 03-REVIEW.md; they are it.fails while the open findings
  // stand, and turn red (flip to it) once the fix lands.
  describe('skipped searches and the single baseline rule (CR-01, WR-01)', () => {
    /** Ends a queued auto search skipped and releases its key (the CR-01 fix). */
    function endSkippedReleased(spineId: string): void {
      const db = getDb().$client;
      const [s] = autoSearches(spineId).filter((r) => r.status === 'queued');
      expect(s).toBeDefined();
      finishSearch(db, s.id, { status: 'skipped' });
      db.prepare("UPDATE jobs SET status = 'succeeded' WHERE id = ?").run(
        s.job_id,
      );
      releaseDedupeKey(s.job_id);
    }

    it('CR-01: the backfill re-picks a spine whose latest search ended skipped', async () => {
      const sc = await scanned();
      connect();
      const db = getDb().$client;
      expect(enqueueAutoSearch(db, sc.cd[0])).toBe(true);
      endSkippedReleased(sc.cd[0]);
      enqueueMissingSearches({ includeAuthFailed: false });
      expect(autoSearches(sc.cd[0]).map((r) => r.status)).toEqual([
        'skipped',
        'queued',
      ]);
    });

    it('CR-01: a skipped latest search is no baseline for enqueueAutoSearch', async () => {
      const sc = await scanned();
      connect();
      const db = getDb().$client;
      expect(enqueueAutoSearch(db, sc.cd[0])).toBe(true);
      endSkippedReleased(sc.cd[0]);
      expect(enqueueAutoSearch(db, sc.cd[0])).toBe(true);
    });

    it('CR-01 end to end: auto queued, spine orphaned, job runs, re-attach, a new auto search is queued', async () => {
      const sc = await scanned();
      connect();
      const db = getDb().$client;
      // The orphan's auto search was queued before the re-scan orphaned it.
      expect(enqueueAutoSearch(db, sc.orphanId)).toBe(true);
      const job = claimNext('discogs');
      if (!job) throw new Error('no job claimed');
      const [queued] = autoSearches(sc.orphanId);
      const fetchImpl = (async () => {
        throw new Error('no request expected');
      }) as unknown as typeof fetch;
      await runSearchSpine(
        { searchId: queued.id },
        { job, signal: new AbortController().signal, isCurrent: () => true },
        { fetch: { fetchImpl, gate: resetDiscogsGateForTests() } },
      );
      expect(autoSearches(sc.orphanId).map((r) => r.status)).toEqual([
        'skipped',
      ]);
      expect(reattachSpine(sc.orphanId, sc.vId).status).toBe('ok');
      // The lease-tick safety net (or any later enqueue point) must queue it.
      enqueueMissingSearches({ includeAuthFailed: false });
      expect(autoSearches(sc.orphanId).map((r) => r.status)).toEqual([
        'skipped',
        'queued',
      ]);
    });

    it.fails('WR-01: a backfill no-op (baseline already equals the current inputs) takes no write lock', async () => {
      const sc = await scanned();
      connect();
      const db = getDb().$client;
      enqueueMissingSearches({ includeAuthFailed: false });
      endSearch(sc.cd[0], 'done');
      const original = fieldOf(sc.cd[0], 'title').value ?? '';
      updateSpineField(sc.cd[0], 'title', 'Some Other Title');
      expect(enqueueAutoSearch(db, sc.cd[0])).toBe(true);
      endSearch(sc.cd[0], 'not_connected');
      updateSpineField(sc.cd[0], 'title', original);
      let transactions = 0;
      const counted = new Proxy(db, {
        get(target, prop) {
          if (prop === 'transaction') transactions += 1;
          const v = Reflect.get(target, prop);
          return typeof v === 'function' ? v.bind(target) : v;
        },
      });
      expect(
        enqueueMissingSearches({ includeAuthFailed: false }, counted),
      ).toBe(0);
      expect(transactions).toBe(0);
    });
  });
});
