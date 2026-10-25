// Bulk import proof against test/fixtures/fake-discogs.mjs and the fake
// Claude CLI (never a live API, never the owner's secrets.json or
// data/app.db; the app is built into NEXT_DIST_DIR, default .next/verify,
// and served on an ephemeral port, never 3000 or 3001).
// Plan 06-10: (a) the live app.db has bulk_runs, bulk_items,
// bulk_items_spine_open_idx and the 0004 migration row; (b) a connected
// owner's tracer-shelf scan finishes and its searches drain, with the fake
// limit at 60/min so the shared gate paces about one request a second;
// (c) every eligible spine is bulk-imported with its top candidate: each
// spine's Canadian CD version is added when its master lists one; TR-201,
// whose master lists none, gets its US CD version (Plan 06-16: the run
// snapshots fallback_country 'US', the default, and the outcome is
// fallback_country); each release exactly once (the second TR-200 spine is
// skipped as a duplicate); every looked-up spine makes exactly one
// GET /masters/{m}/versions with country Canada and format CD, plus exactly
// one with country US and format CD for master 51011 only, after its Canada
// request; consecutive Discogs requests during the run are at least 900 ms
// apart; no stored error names the username.
// Each later step scans a fresh, re-encoded photo of the same shelf, marks
// the earlier photos' spines superseded in SQL (so their imports are no
// local duplicates, D-09) and empties the fake collection (so no add is
// held as already in the collection, D-05). (d) a second start while the
// run is going answers 409 bulk_running and writes no run (T-06-16).
// (e) Phase 4 D-07, BULK-11: the fake holds the run's first add POST after
// carrying it out (hang-after-commit); the app is SIGKILLed and restarted
// on the same data; the run finishes with every release added exactly
// once, the held POST's copy adopted and never posted again.
// Run: node scripts/verify-bulk-import.ts   (VERIFY_SKIP_BUILD=1 reuses
// the build). The setup helpers live in scripts/lib/import-flow.ts.
import fs from 'node:fs';
import path from 'node:path';
import type { SpinesResponse } from '../src/lib/scan-types.ts';
import type { BulkItemDbRow } from '../src/server/bulk/store.ts';
import { makeSyntheticShelf } from '../test/fixtures/vision/synthetic-shelf.mjs';
import {
  connectAndScan,
  discogsIdle,
  FAKE_USERNAME,
  type FakePostMode,
  fakeLog,
  fakeState,
  type ImportCtx,
  type ImportDbRow,
  type ImportFakeState,
  startImportStack,
  TRACER,
  withWritableDb,
} from './lib/import-flow.ts';
import { assert, check, step } from './lib/jobs.ts';
import { upload, waitPhotoDone, withDb } from './lib/scan.ts';
import { runMain, waitFor } from './lib/server.ts';

/** The fake's Canadian version of search release r is r + this. */
const CANADIAN_OFFSET = 700_000;
/** The one tracer release whose master lists no Canadian version. */
const NO_CANADIAN = 1011;
/** The fake's US version of NO_CANADIAN is NO_CANADIAN + this. */
const US_OFFSET = 800_000;
/** Spacing the gate keeps at 60/min is 1112 ms; allow some jitter. */
const MIN_GAP_MS = 900;
const RUN_TIMEOUT_MS = 180_000;

type Pick = {
  spineId: string;
  candidateId: string;
  releaseId: number;
  masterId: number | null;
};

type StartAnswer = { status: number; body: Record<string, unknown> };

// ---------------------------------------------------------------------------
// Helpers.

async function getSpines(ctx: ImportCtx): Promise<SpinesResponse> {
  const res = await fetch(`${ctx.baseUrl}/api/spines`, { cache: 'no-store' });
  assert(res.status === 200, `GET /api/spines answered ${res.status}`);
  return (await res.json()) as SpinesResponse;
}

/** POST /api/spines/bulk-import from the app's own origin. */
async function startBulk(
  ctx: ImportCtx,
  items: Array<{ spineId: string; candidateId: string }>,
): Promise<StartAnswer> {
  const res = await fetch(`${ctx.baseUrl}/api/spines/bulk-import`, {
    method: 'POST',
    headers: { origin: ctx.origin, 'content-type': 'application/json' },
    // The body is strict: spine and candidate ids only.
    body: JSON.stringify({
      items: items.map(({ spineId, candidateId }) => ({
        spineId,
        candidateId,
      })),
    }),
  });
  const text = await res.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

/** Every eligible spine (optionally on one photo) with its top candidate. */
async function eligiblePicks(
  ctx: ImportCtx,
  photoId?: string,
): Promise<Pick[]> {
  const data = await getSpines(ctx);
  const spines = data.spines.filter(
    (s) => s.bulk?.eligible === true && (!photoId || s.photoId === photoId),
  );
  return spines.map((s) => {
    const top = s.discogs?.topCandidates[0];
    assert(top, `eligible spine ${s.id} has no top candidate`);
    const row = withDb(ctx, (db) =>
      db
        .prepare('SELECT master_id FROM discogs_candidates WHERE id = @id')
        .get({ id: top.id }),
    ) as { master_id: number | null } | undefined;
    return {
      spineId: s.id,
      candidateId: top.id,
      releaseId: top.releaseId,
      masterId: row?.master_id ?? null,
    };
  });
}

/** Waits until the run is the latest and no longer running. */
async function waitRunDone(ctx: ImportCtx, runId: string) {
  return waitFor(
    `bulk run ${runId} to finish`,
    async () => {
      const data = await getSpines(ctx);
      return data.bulk?.id === runId && !data.bulk.running
        ? data.bulk
        : undefined;
    },
    { timeoutMs: RUN_TIMEOUT_MS, intervalMs: 500 },
  );
}

function runItems(ctx: ImportCtx, runId: string): BulkItemDbRow[] {
  return withDb(
    ctx,
    (db) =>
      db
        .prepare(
          'SELECT * FROM bulk_items WHERE run_id = @runId ORDER BY created_at',
        )
        .all({ runId }) as BulkItemDbRow[],
  );
}

function importById(
  ctx: ImportCtx,
  id: string | null,
): ImportDbRow | undefined {
  return withDb(
    ctx,
    (db) =>
      db.prepare('SELECT * FROM imports WHERE id = @id').get({ id }) as
        | ImportDbRow
        | undefined,
  );
}

/** The release the fake makes the bulk run add for this top match. */
const expectedRelease = (topReleaseId: number) =>
  topReleaseId === NO_CANADIAN
    ? topReleaseId + US_OFFSET
    : topReleaseId + CANADIAN_OFFSET;

/**
 * Each pick's item: the first pick of a release resolves to the expected
 * release and outcome and its import is imported; later picks of the same
 * release are skipped as duplicates. Answers the resolved items.
 */
function assertRunItems(
  ctx: ImportCtx,
  runId: string,
  picks: Pick[],
): BulkItemDbRow[] {
  const items = runItems(ctx, runId);
  assert(
    items.length === picks.length,
    `${items.length} bulk items, expected ${picks.length}`,
  );
  const seen = new Set<number>();
  const resolved: BulkItemDbRow[] = [];
  for (const pick of picks) {
    const item = items.find((i) => i.spine_id === pick.spineId);
    assert(item, `no bulk item for spine ${pick.spineId}`);
    assert(
      item.candidate_id === pick.candidateId,
      `item ${item.id} names candidate ${item.candidate_id}`,
    );
    const want = expectedRelease(pick.releaseId);
    if (seen.has(want)) {
      assert(
        item.status === 'skipped' && item.skip_reason === 'duplicate',
        `a second pick of ${want} is ${item.status} ${item.skip_reason}`,
      );
      continue;
    }
    seen.add(want);
    assert(
      item.status === 'resolved',
      `item for top ${pick.releaseId} is ${item.status}: ${item.error_kind} ${item.error}`,
    );
    assert(
      item.release_id === want,
      `item for top ${pick.releaseId} chose ${item.release_id}, expected ${want}`,
    );
    const outcome =
      pick.releaseId === NO_CANADIAN ? 'fallback_country' : 'preferred';
    const country = pick.releaseId === NO_CANADIAN ? 'US' : 'Canada';
    assert(
      item.outcome === outcome && item.country === country,
      `item for top ${pick.releaseId}: outcome ${item.outcome}, country ${item.country}`,
    );
    const imp = importById(ctx, item.import_id);
    assert(
      imp?.status === 'imported' && imp.release_id === want,
      `the import of ${want} is ${imp?.status} ${imp?.release_id}: ${imp?.error_kind} ${imp?.error}`,
    );
    resolved.push(item);
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Steps.

// (a) boot applied migration 0004 to the live app.db.
function stepSchema(ctx: ImportCtx): void {
  step('(a) live app.db has the bulk tables and the 0004 migration');
  const journal = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), 'drizzle', 'meta', '_journal.json'),
      'utf8',
    ),
  ) as { entries: { tag: string; when: number }[] };
  const bulk = journal.entries.find((e) => e.tag === '0004_bulk_import');
  assert(bulk, 'the journal has no 0004_bulk_import entry');
  withDb(ctx, (db) => {
    const names = new Set(
      (
        db
          .prepare(
            `SELECT name FROM sqlite_master WHERE type IN ('table', 'index')`,
          )
          .all() as { name: string }[]
      ).map((r) => r.name),
    );
    for (const n of ['bulk_runs', 'bulk_items', 'bulk_items_spine_open_idx']) {
      assert(names.has(n), `${n} missing from live app.db`);
    }
    const row = db
      .prepare(
        'SELECT COUNT(*) AS n FROM __drizzle_migrations WHERE created_at = @when',
      )
      .get({ when: bulk.when }) as { n: number };
    assert(row.n === 1, `0004 migration rows: ${row.n}`);
    const total = (
      db.prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations').get() as {
        n: number;
      }
    ).n;
    assert(
      total === journal.entries.length,
      `__drizzle_migrations has ${total} rows, expected ${journal.entries.length}`,
    );
  });
  check(
    `bulk_runs, bulk_items and bulk_items_spine_open_idx exist; 0004 applied; ${journal.entries.length} migrations`,
  );
}

// (b) connect and scan at 60 requests a minute, so the gate paces ~1.1 s.
async function stepConnectAndScan(ctx: ImportCtx): Promise<string> {
  step('(b) connect at a 60/min limit, scan the tracer shelf, drain searches');
  const state = (await ctx.fake.control({ limit: 60 })) as { limit?: number };
  assert(state.limit === 60, `the fake's limit is ${state.limit}`);
  const photoId = await connectAndScan(ctx);
  const runs = withDb(
    ctx,
    (db) =>
      (db.prepare('SELECT COUNT(*) AS n FROM bulk_runs').get() as { n: number })
        .n,
  );
  assert(runs === 0, `${runs} bulk runs before any start`);
  check('connected; scan done; searches drained; no bulk run yet');
  return photoId;
}

// (c) D-01..D-04: a bulk run of every eligible spine adds each spine's
// Canadian CD version (or its top match) exactly once, one versions
// request per looked-up spine, paced by the shared gate.
async function stepBulkRun(ctx: ImportCtx): Promise<void> {
  step('(c) a bulk run adds the Canadian pressings once each, paced');
  const data = await getSpines(ctx);
  assert(
    data.discogs.preferredCountry === 'Canada',
    `preferred country ${data.discogs.preferredCountry}`,
  );
  const picks = await eligiblePicks(ctx);
  assert(picks.length >= 2, `only ${picks.length} eligible spines`);
  assert(
    picks.some((p) => p.releaseId === NO_CANADIAN),
    'TR-201 (release 1011) is not eligible',
  );
  for (const p of picks) {
    assert(
      p.masterId === p.releaseId + 50_000,
      `top ${p.releaseId} has master ${p.masterId}`,
    );
  }
  const before = await fakeState(ctx);
  const runStart = Date.now();
  const answer = await startBulk(ctx, picks);
  assert(
    answer.status === 201 &&
      typeof answer.body.runId === 'string' &&
      answer.body.started === picks.length &&
      answer.body.skipped === 0,
    `start answered ${answer.status} ${JSON.stringify(answer.body)}`,
  );
  const runId = answer.body.runId as string;
  const fallbackCountry = withDb(
    ctx,
    (db) =>
      (
        db
          .prepare('SELECT fallback_country FROM bulk_runs WHERE id = @runId')
          .get({ runId }) as { fallback_country: string | null } | undefined
      )?.fallback_country,
  );
  assert(
    fallbackCountry === 'US',
    `the run's fallback_country is ${fallbackCountry}`,
  );
  const summary = await waitRunDone(ctx, runId);
  const runEnd = Date.now();

  const resolved = assertRunItems(ctx, runId, picks);
  const state = await fakeState(ctx);
  for (const item of resolved) {
    const id = String(item.release_id);
    const copies = state.collection[id] ?? [];
    assert(copies.length === 1, `${copies.length} copies of ${id}`);
    const posted =
      (state.postsByRelease[id] ?? 0) - (before.postsByRelease[id] ?? 0);
    assert(posted === 1, `${posted} add POSTs of ${id} during the run`);
  }
  assert(
    state.posts - before.posts === resolved.length,
    `${state.posts - before.posts} add POSTs for ${resolved.length} imports`,
  );
  // Nothing outside the run's releases was added.
  const added = Object.entries(state.collection)
    .filter(([, list]) => list.length > 0)
    .map(([id]) => Number(id));
  const wanted = new Set(resolved.map((i) => i.release_id));
  assert(
    added.every((id) => wanted.has(id)),
    `the fake collection holds ${added.join(', ')}`,
  );

  const log = fakeLog(ctx).filter(
    (e) => e.surface === 'api' && e.t >= runStart && e.t <= runEnd,
  );
  const versions = log.filter((e) => /^\/masters\/\d+\/versions$/.test(e.path));
  assert(
    versions.length === picks.length + 1,
    `${versions.length} versions requests for ${picks.length} looked-up spines plus one US request`,
  );
  for (const v of versions) {
    assert(
      v.method === 'GET' && v.status === 200,
      `versions request ${v.method} ${v.path} answered ${v.status}`,
    );
    assert(
      (v.query.country === 'Canada' || v.query.country === 'US') &&
        v.query.format === 'CD',
      `versions query ${JSON.stringify(v.query)}`,
    );
  }
  // G-06-side-1: one US request, for the no-Canadian master only, sent
  // after its Canada answer came back empty.
  const noCanadianPath = `/masters/${NO_CANADIAN + 50_000}/versions`;
  const us = versions.filter((v) => v.query.country === 'US');
  assert(
    us.length === 1 && us[0].path === noCanadianPath,
    `US versions requests: ${us.map((v) => v.path).join(', ') || 'none'}`,
  );
  const canadaFirst = versions.find(
    (v) => v.path === noCanadianPath && v.query.country === 'Canada',
  );
  assert(
    canadaFirst && versions.indexOf(canadaFirst) < versions.indexOf(us[0]),
    `the US request for ${noCanadianPath} was not logged after its Canada request`,
  );
  const byMaster = new Map<string, number>();
  for (const v of versions) {
    if (v.query.country !== 'Canada') continue;
    byMaster.set(v.path, (byMaster.get(v.path) ?? 0) + 1);
  }
  for (const p of picks) {
    const want = picks.filter((q) => q.masterId === p.masterId).length;
    const got = byMaster.get(`/masters/${p.masterId}/versions`) ?? 0;
    assert(
      got === want,
      `${got} versions requests for master ${p.masterId}, expected ${want}`,
    );
  }

  const times = log.map((e) => e.t).sort((a, b) => a - b);
  assert(times.length >= 2, `${times.length} Discogs requests during the run`);
  let minGap = Number.POSITIVE_INFINITY;
  for (let i = 1; i < times.length; i++) {
    minGap = Math.min(minGap, times[i] - times[i - 1]);
  }
  assert(
    minGap >= MIN_GAP_MS,
    `two Discogs requests during the run were ${minGap} ms apart`,
  );

  const leaks = withDb(ctx, (db) =>
    db
      .prepare(
        `SELECT 'bulk_items' AS t, error AS e FROM bulk_items WHERE error LIKE @u
         UNION ALL
         SELECT 'imports', error FROM imports WHERE error LIKE @u
         UNION ALL
         SELECT 'jobs', last_error FROM jobs WHERE last_error LIKE @u`,
      )
      .all({ u: `%${FAKE_USERNAME}%` }),
  );
  assert(
    leaks.length === 0,
    `stored errors name the username: ${leaks.length}`,
  );
  check(
    `${picks.length} picks: ${resolved.length} added once each (${resolved
      .map((i) => `${i.release_id} ${i.outcome}`)
      .join(
        ', ',
      )}), ${picks.length - resolved.length} duplicate skipped; ${versions.length} versions requests (one country Canada per looked-up spine plus one country US for ${noCanadianPath}, format CD); fallback_country ${fallbackCountry}; ${times.length} requests at least ${minGap} ms apart; run summary added ${summary.added}, fallbacks ${summary.fallbacks}`,
  );
}

async function setPostMode(ctx: ImportCtx, postMode: FakePostMode) {
  const state = (await ctx.fake.control({ postMode })) as { postMode?: string };
  assert(
    state.postMode === postMode,
    `the fake's postMode is ${state.postMode}`,
  );
}

function runCount(ctx: ImportCtx): number {
  return withDb(
    ctx,
    (db) =>
      (db.prepare('SELECT COUNT(*) AS n FROM bulk_runs').get() as { n: number })
        .n,
  );
}

/**
 * Scans another tracer photo (re-encoded, so a new hash), waits for its
 * searches, then retires every other photo's spines and empties the fake
 * collection, so the new photo's spines are eligible and their releases
 * are neither local duplicates nor already in the collection. The photo id.
 */
async function freshShelf(
  ctx: ImportCtx,
  quality: number,
  filename: string,
): Promise<string> {
  const jpeg = new Uint8Array(
    (await makeSyntheticShelf(TRACER, { quality })).jpeg,
  );
  const up = await upload(ctx, jpeg, { filename });
  assert(up.status === 201, `upload returned ${up.status}`);
  const photoId = String(up.body.photoId);
  const photo = await waitPhotoDone(ctx, photoId);
  assert(
    photo.spineCount === TRACER.spines.length,
    `spineCount ${photo.spineCount}, expected ${TRACER.spines.length}`,
  );
  await waitFor(
    'the Discogs lane to drain',
    async () => (discogsIdle(ctx) ? true : undefined),
    { timeoutMs: 120_000, intervalMs: 250 },
  );
  withWritableDb(ctx, (db) =>
    db
      .prepare(
        `UPDATE spines SET state = 'superseded'
         WHERE photo_id <> @photoId AND state IN ('active', 'orphaned')`,
      )
      .run({ photoId }),
  );
  const state = await fakeState(ctx);
  const emptied = (await ctx.fake.control({
    collection: Object.fromEntries(
      Object.keys(state.collection).map((id) => [id, []]),
    ),
  })) as ImportFakeState;
  assert(
    Object.values(emptied.collection).every((l) => l.length === 0),
    'the fake collection is not empty',
  );
  return photoId;
}

/** Each resolved release has exactly one copy, posted once since before. */
async function assertOneCopyEach(
  ctx: ImportCtx,
  resolved: BulkItemDbRow[],
  before: { postsByRelease: Record<string, number> },
): Promise<void> {
  const state = await fakeState(ctx);
  for (const item of resolved) {
    const id = String(item.release_id);
    const copies = state.collection[id] ?? [];
    assert(copies.length === 1, `${copies.length} copies of ${id}`);
    const posted =
      (state.postsByRelease[id] ?? 0) - (before.postsByRelease[id] ?? 0);
    assert(posted === 1, `${posted} add POSTs of ${id} during the run`);
  }
  assert(state.postsHeld === 0, `${state.postsHeld} add POSTs still held`);
}

// (d) T-06-16: one run at a time; a second start is refused and writes
// nothing while the first is going.
async function stepOneRunAtATime(ctx: ImportCtx): Promise<void> {
  step('(d) a second start while the run is going answers 409 bulk_running');
  // Pacing was proven in (c); the rest of the script runs at the default.
  await ctx.fake.control({ limit: 600 });
  const photoId = await freshShelf(ctx, 84, 'bulk-shelf-2.jpg');
  const picks = await eligiblePicks(ctx, photoId);
  assert(picks.length >= 2, `only ${picks.length} eligible spines`);
  const before = await fakeState(ctx);
  const runsBefore = runCount(ctx);
  const first = await startBulk(ctx, picks);
  const second = await startBulk(ctx, picks);
  assert(
    first.status === 201 && typeof first.body.runId === 'string',
    `the first start answered ${first.status} ${JSON.stringify(first.body)}`,
  );
  assert(
    second.status === 409 && second.body.error === 'bulk_running',
    `the second start answered ${second.status} ${JSON.stringify(second.body)}`,
  );
  assert(
    runCount(ctx) === runsBefore + 1,
    `${runCount(ctx) - runsBefore} runs written by two starts`,
  );
  const runId = first.body.runId as string;
  await waitRunDone(ctx, runId);
  const resolved = assertRunItems(ctx, runId, picks);
  await assertOneCopyEach(ctx, resolved, before);
  check(
    `first start 201, second 409 bulk_running with one run written; the run added ${resolved.length} releases once each`,
  );
}

// (e) Phase 4 D-07, BULK-11: the app dies while Discogs holds an add it
// already carried out; after a restart the run finishes and nothing is
// added twice.
async function stepCrashMidRun(ctx: ImportCtx): Promise<void> {
  step('(e) SIGKILL mid-run while an add POST is held; restart; once each');
  const photoId = await freshShelf(ctx, 83, 'bulk-shelf-3.jpg');
  const picks = await eligiblePicks(ctx, photoId);
  assert(picks.length >= 2, `only ${picks.length} eligible spines`);
  const before = await fakeState(ctx);
  await setPostMode(ctx, 'hang-after-commit');
  const answer = await startBulk(ctx, picks);
  assert(
    answer.status === 201 && typeof answer.body.runId === 'string',
    `start answered ${answer.status} ${JSON.stringify(answer.body)}`,
  );
  const runId = answer.body.runId as string;
  const held = await waitFor(
    "the fake to hold the run's first add POST",
    async () => {
      const s = await fakeState(ctx);
      return s.postsHeld === 1 ? s : undefined;
    },
    { timeoutMs: 60_000, intervalMs: 100 },
  );
  const heldRelease = Object.keys(held.postsByRelease).find(
    (id) =>
      (held.postsByRelease[id] ?? 0) - (before.postsByRelease[id] ?? 0) === 1,
  );
  assert(heldRelease, 'no add POST was carried out before the hold');
  const midRun = await getSpines(ctx);
  assert(
    midRun.bulk?.id === runId && midRun.bulk.running,
    `the run is not going at the hold: ${JSON.stringify(midRun.bulk)}`,
  );
  const killed = await ctx.server.stop('SIGKILL');
  assert(
    killed.signal === 'SIGKILL',
    `server exited ${JSON.stringify(killed)}`,
  );
  await setPostMode(ctx, 'ok');
  await waitFor(
    'the fake to drop the held add',
    async () => ((await fakeState(ctx)).postsHeld === 0 ? true : undefined),
    { timeoutMs: 10_000, intervalMs: 100 },
  );
  await ctx.restart('SIGKILL');
  const summary = await waitRunDone(ctx, runId);
  const resolved = assertRunItems(ctx, runId, picks);
  await assertOneCopyEach(ctx, resolved, before);
  const heldItem = resolved.find((i) => String(i.release_id) === heldRelease);
  assert(heldItem, `no resolved item imports the held ${heldRelease}`);
  const imp = importById(ctx, heldItem.import_id);
  assert(
    imp?.status === 'imported' && imp.adopted === 1 && imp.post_count === 1,
    `the held import is ${JSON.stringify(imp)}`,
  );
  const state = await fakeState(ctx);
  assert(
    imp.instance_id === state.collection[heldRelease]?.[0]?.instance_id,
    `instance ${imp.instance_id}, the fake's copy is ${JSON.stringify(state.collection[heldRelease])}`,
  );
  check(
    `killed with ${heldRelease} held mid-run; after the restart the run finished (added ${summary.added}, duplicates ${summary.duplicates}); ${resolved.length} releases one copy and one add POST each; ${heldRelease} adopted with post_count 1`,
  );
}

runMain('verify-bulk-import', async (onCleanup) => {
  const ctx = await startImportStack('verify-bulk-import', onCleanup);
  stepSchema(ctx);
  await stepConnectAndScan(ctx);
  await stepBulkRun(ctx);
  await stepOneRunAtATime(ctx);
  await stepCrashMidRun(ctx);

  step('stop');
  await ctx.server.stop('SIGTERM');
  console.log('verify-bulk-import: all steps passed');
});
