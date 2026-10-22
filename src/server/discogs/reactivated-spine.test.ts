import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { matchesAction } from '@/components/discogs-matches';
import {
  type Output,
  orphanScenario,
  parsingRun,
  persist,
  rescanOutput,
  spineRow,
} from '../../../test/helpers/scan-runs';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';
import { getDb } from '../db/client';
import { maintenance } from '../jobs/handlers/index';
import { runSearchSpine } from '../jobs/handlers/search-spine';
import { complete, listJobs } from '../jobs/queue';
import { updateSpineField } from '../scan/fields';
import { reattachSpine } from '../scan/orphans';
import { SECRET_ENV_NAMES, saveSecrets } from '../secrets';
import { clearAuthInvalid, saveDiscogsAuth } from './auth';
import { enqueueAutoSearch } from './enqueue';
import { resetDiscogsGateForTests } from './gate';
import { inputHash, loadSpineInputs } from './inputs';
import { discogsForSpines } from './queries';

// CR-01 end to end for re-activated spines (DISC-03, D-08, D-11): the real
// search_spine handler, re-scan merge, Re-attach and the lease-tick
// maintenance hooks. Every request goes to a stub fetch on a fake clock:
// never a live API, never a real sleep.

const FIXTURES = path.join(process.cwd(), 'test/fixtures/discogs');

function useTempSecrets(): void {
  let dir = '';
  const names = [
    'SECRETS_FILE',
    'DISCOGS_API_BASE',
    ...Object.values(SECRET_ENV_NAMES),
  ];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const n of names) {
      saved[n] = process.env[n];
      delete process.env[n];
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-reactivated-'));
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

type SearchRow = {
  id: string;
  status: string;
  job_id: string | null;
  input_hash: string | null;
};

function autoSearches(spineId: string): SearchRow[] {
  return getDb()
    .$client.prepare(
      `SELECT id, status, job_id, input_hash FROM discogs_searches
       WHERE kind = 'auto' AND spine_id = @spineId
       ORDER BY created_at, id`,
    )
    .all({ spineId }) as SearchRow[];
}

function searchById(id: string): SearchRow {
  return getDb()
    .$client.prepare(
      'SELECT id, status, job_id, input_hash FROM discogs_searches WHERE id = ?',
    )
    .get(id) as SearchRow;
}

function dedupeKeyOf(jobId: string): string | null {
  return (
    getDb()
      .$client.prepare('SELECT dedupe_key FROM jobs WHERE id = ?')
      .get(jobId) as { dedupe_key: string | null }
  ).dedupe_key;
}

function cardOf(id: string) {
  return discogsForSpines(getDb().$client, [{ id }]).get(id);
}

/** Every lease-tick maintenance hook, in order, as the worker runs them. */
function runMaintenance(): void {
  for (const hook of maintenance) hook();
}

function fakeClock() {
  const clock = {
    t: 1_800_000_000_000,
    now: () => clock.t,
    sleep: async (ms: number) => {
      clock.t += ms;
    },
  };
  return clock;
}

type Respond = () => Response;

const noRequest: Respond = () => {
  throw new Error('no request expected');
};

function fixtureResponse(file: string): Respond {
  const body = fs.readFileSync(path.join(FIXTURES, file), 'utf8');
  return () =>
    new Response(body, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-discogs-ratelimit': '60',
        'x-discogs-ratelimit-remaining': '59',
      },
    });
}

const empty = fixtureResponse('search-empty.json');
const hit = fixtureResponse('search-hit.json');

/**
 * Runs one search's own job through the real handler. Only that job is
 * marked running, so the other queued discogs jobs are left alone.
 */
async function runSearchJob(searchId: string, respond: Respond) {
  const db = getDb().$client;
  const { job_id: jobId } = searchById(searchId);
  if (!jobId) throw new Error(`search ${searchId} has no job`);
  db.prepare(
    `UPDATE jobs SET status = 'running', attempts = attempts + 1,
       locked_at = @now, updated_at = @now
     WHERE id = @id`,
  ).run({ id: jobId, now: Date.now() });
  const job = listJobs(10_000).find((j) => j.id === jobId);
  if (!job) throw new Error(`job ${jobId} not found`);
  const fetchImpl = (async () => respond()) as unknown as typeof fetch;
  await runSearchSpine(
    { searchId },
    { job, signal: new AbortController().signal, isCurrent: () => true },
    { fetch: { fetchImpl, gate: resetDiscogsGateForTests(fakeClock()) } },
  );
  complete(jobId);
}

function withTitle(out: Output, index: number, title: string): Output {
  return {
    ...out,
    spines: out.spines.map((s) =>
      s.index === index ? { ...s, title: { ...s.title, value: title } } : s,
    ),
  };
}

describe('re-activated spines (CR-01)', () => {
  useTempDataDir();
  useTempSecrets();

  /** The orphan's auto search, queued before the re-scan, ran skipped. */
  async function skippedOrphan() {
    const sc = await orphanScenario();
    connect();
    const db = getDb().$client;
    expect(enqueueAutoSearch(db, sc.orphanId)).toBe(true);
    const [queued] = autoSearches(sc.orphanId);
    await runSearchJob(queued.id, noRequest);
    const skipped = searchById(queued.id);
    expect(skipped.status).toBe('skipped');
    expect(dedupeKeyOf(skipped.job_id ?? '')).toBeNull();
    return { ...sc, skippedId: queued.id };
  }

  it('CR-01: queued auto search, orphaned, skipped, re-attached, then the maintenance hook queues a new auto search that finds candidates', async () => {
    const sc = await skippedOrphan();
    expect(reattachSpine(sc.orphanId, sc.vId).status).toBe('ok');
    expect(cardOf(sc.orphanId)?.state).toBe('not_searched');

    runMaintenance();
    const after = autoSearches(sc.orphanId);
    expect(after.map((r) => r.status)).toEqual(['skipped', 'queued']);
    expect(cardOf(sc.orphanId)?.state).toBe('queued');

    await runSearchJob(after[1].id, hit);
    expect(searchById(after[1].id).status).toBe('done');
    const card = cardOf(sc.orphanId);
    expect(card?.state).toBe('done');
    expect(card?.candidateCount).toBeGreaterThanOrEqual(1);

    runMaintenance();
    expect(autoSearches(sc.orphanId)).toHaveLength(2);
  });

  it('CR-01: an orphan found again by a later re-scan is auto-searched in the same transaction', async () => {
    const sc = await skippedOrphan();
    persist(
      parsingRun(sc.photoId, 3),
      rescanOutput((s) => s),
    );
    expect(spineRow(sc.orphanId).state).toBe('active');
    expect(autoSearches(sc.orphanId).map((r) => r.status)).toEqual([
      'skipped',
      'queued',
    ]);
  });

  it('a re-attach before the queued auto search runs lets it run normally', async () => {
    const sc = await orphanScenario();
    connect();
    expect(enqueueAutoSearch(getDb().$client, sc.orphanId)).toBe(true);
    expect(reattachSpine(sc.orphanId, sc.vId).status).toBe('ok');
    const [queued] = autoSearches(sc.orphanId);
    await runSearchJob(queued.id, hit);
    expect(searchById(queued.id).status).toBe('done');
  });

  it('a re-activated spine whose baseline already searched its current inputs shows that result, not waiting its turn', async () => {
    const sc = await orphanScenario();
    connect();
    const db = getDb().$client;
    const s0 = sc.spineIds[0];
    // Not a search input; the edit makes a later re-scan orphan s0.
    updateSpineField(s0, 'label', 'Owner label');

    expect(enqueueAutoSearch(db, s0)).toBe(true);
    const [a] = autoSearches(s0);
    await runSearchJob(a.id, empty);
    expect(searchById(a.id).status).toBe('no_match');
    const aHash = searchById(a.id).input_hash;

    // Run 3 reads a new title for spine 0: search B is queued.
    persist(
      parsingRun(sc.photoId, 3),
      withTitle(
        rescanOutput((s) => s),
        0,
        'Retitled Read',
      ),
    );
    const b = autoSearches(s0)[1];
    expect(b?.status).toBe('queued');

    // Run 4 drops spine 0: it is orphaned before B runs.
    persist(
      parsingRun(sc.photoId, 4),
      rescanOutput((s) => (s.index === 0 ? null : s)),
    );
    expect(spineRow(s0).state).toBe('orphaned');
    expect(autoSearches(s0).map((r) => r.status)).toEqual([
      'no_match',
      'queued',
    ]);
    await runSearchJob(b.id, noRequest);
    expect(searchById(b.id).status).toBe('skipped');
    // Not active: the maintenance hook leaves the orphan alone.
    runMaintenance();
    expect(autoSearches(s0)).toHaveLength(2);

    // Run 5 finds spine 0 again with the original title: A's inputs.
    persist(
      parsingRun(sc.photoId, 5),
      rescanOutput((s) => s),
    );
    expect(spineRow(s0).state).toBe('active');
    expect(inputHash(loadSpineInputs(db, s0))).toBe(aHash);

    runMaintenance();
    expect(autoSearches(s0).map((r) => [r.id, r.status])).toEqual([
      [a.id, 'no_match'],
      [b.id, 'skipped'],
    ]);
    const discogs = cardOf(s0) ?? null;
    expect(discogs?.state).toBe('no_match');
    expect(discogs).toMatchObject({ state: 'no_match', fieldsChanged: false });
    expect(matchesAction({ discogs })).toBeNull();
  });
});
