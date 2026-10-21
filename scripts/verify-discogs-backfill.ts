// Connect backfill proof (Plan 03-07, D-08) against
// test/fixtures/fake-discogs.mjs and the fake Claude CLI (never a live API,
// never the owner's secrets.json): (a) a shelf scanned while Discogs is not
// connected queues no search, (b) connecting looks up every active CD spine
// exactly once, (c) lease ticks and a second connect add nothing, (d) a
// revoked sign-in leaves a photo's searches auth_failed, the maintenance
// hook never re-queues them, and reconnecting searches each spine once more.
// Run: node scripts/verify-discogs-backfill.ts   (VERIFY_SKIP_BUILD=1 reuses
// the build). It builds and starts from NEXT_DIST_DIR, default .next/verify,
// so a long-running `next start` on the default .next keeps working.
import fs from 'node:fs';
import path from 'node:path';
import {
  LAYOUTS,
  makeSyntheticShelf,
} from '../test/fixtures/vision/synthetic-shelf.mjs';
import {
  connectViaApi,
  discogsEnv,
  type FakeDiscogs,
  startFakeDiscogs,
  tempSecretsFile,
} from './lib/discogs.ts';
import { assert, check, sleep, step } from './lib/jobs.ts';
import {
  countRows,
  fakeVisionEnv,
  type Ctx as ScanCtx,
  stepStart,
  upload,
  waitPhotoDone,
  withDb,
} from './lib/scan.ts';
import {
  buildApp,
  getFreePort,
  makeTempDir,
  runMain,
  waitFor,
} from './lib/server.ts';

/** Build output dir (next.config.ts accepts .next or .next/<name>). */
const DIST_DIR = process.env.NEXT_DIST_DIR || '.next/verify';
const TRACER = LAYOUTS.tracerShelf;
const CD_SPINES = TRACER.spines.length;
/** Two 5 s lease ticks plus slack: the maintenance hook has run twice. */
const TWO_TICKS_MS = 11_000;

type Ctx = ScanCtx & { tmp: string; fake: FakeDiscogs };

type SearchRow = { spine_id: string; kind: string; status: string };

function discogsJobs(ctx: Ctx): { total: number; open: number } {
  return withDb(
    ctx,
    (db) =>
      db
        .prepare(
          `SELECT COUNT(*) AS total,
             COALESCE(SUM(status IN ('queued', 'running')), 0) AS open
           FROM jobs WHERE lane = 'discogs'`,
        )
        .get() as { total: number; open: number },
  );
}

/** Every auto search, optionally only for one photo's spines. */
function autoSearches(ctx: Ctx, photoId?: string): SearchRow[] {
  return withDb(
    ctx,
    (db) =>
      db
        .prepare(
          `SELECT ds.spine_id, ds.kind, ds.status FROM discogs_searches ds
           JOIN spines s ON s.id = ds.spine_id
           WHERE ds.kind = 'auto' AND (@photoId IS NULL OR s.photo_id = @photoId)
           ORDER BY ds.created_at, ds.id`,
        )
        .all({ photoId: photoId ?? null }) as SearchRow[],
  );
}

/** Active CD spine ids of a photo. */
function cdSpines(ctx: Ctx, photoId: string): string[] {
  return withDb(ctx, (db) =>
    (
      db
        .prepare(
          `SELECT s.id FROM spines s
           JOIN spine_detections d ON d.id = s.current_detection_id
           WHERE s.photo_id = ? AND s.state = 'active' AND d.media_kind = 'cd'`,
        )
        .all(photoId) as { id: string }[]
    ).map((r) => r.id),
  );
}

async function drain(ctx: Ctx): Promise<void> {
  await waitFor(
    'the Discogs lane to drain',
    async () => (discogsJobs(ctx).open === 0 ? true : undefined),
    { timeoutMs: 60_000, intervalMs: 250 },
  );
}

async function connect(ctx: Ctx): Promise<void> {
  const location = await connectViaApi(ctx);
  assert(
    location === `${ctx.origin}/settings?discogs=connected`,
    `connect ended at ${location}`,
  );
}

/** Uploads a tracer-layout photo (quality picks distinct bytes). */
async function scanShelf(ctx: Ctx, quality?: number): Promise<string> {
  const jpeg = new Uint8Array(
    (await makeSyntheticShelf(TRACER, { quality })).jpeg,
  );
  const up = await upload(ctx, jpeg);
  assert(up.status === 201, `upload returned ${up.status}`);
  const photoId = String(up.body.photoId);
  const photo = await waitPhotoDone(ctx, photoId);
  assert(
    photo.spineCount === CD_SPINES,
    `spineCount ${photo.spineCount}, expected ${CD_SPINES}`,
  );
  return photoId;
}

/** Each spine has exactly `n` auto searches, the last one done or no_match. */
function expectSearched(
  ctx: Ctx,
  photoId: string,
  n: number,
  label: string,
): void {
  const rows = autoSearches(ctx, photoId);
  for (const spineId of cdSpines(ctx, photoId)) {
    const mine = rows.filter((r) => r.spine_id === spineId);
    assert(
      mine.length === n,
      `${label}: spine ${spineId} has ${mine.length} auto searches, expected ${n}`,
    );
    const last = mine[mine.length - 1];
    assert(
      ['done', 'no_match'].includes(last.status),
      `${label}: spine ${spineId} latest search is ${last.status}`,
    );
  }
}

// (a) scanned while disconnected: no search row, no Discogs job.
async function stepScanDisconnected(ctx: Ctx): Promise<string> {
  step('(a) a shelf scanned while Discogs is not connected queues nothing');
  const photoId = await scanShelf(ctx);
  // Give the maintenance hook a tick: it must stay quiet while disconnected.
  await sleep(TWO_TICKS_MS / 2);
  const searches = countRows(ctx, 'discogs_searches');
  const jobs = discogsJobs(ctx).total;
  assert(searches === 0, `${searches} discogs_searches rows, expected 0`);
  assert(jobs === 0, `${jobs} Discogs jobs, expected 0`);
  check(`${CD_SPINES} CD spines scanned; 0 searches, 0 Discogs jobs`);
  return photoId;
}

// (b) connecting backfills one auto search per active CD spine.
async function stepConnectBackfills(ctx: Ctx, photoId: string): Promise<void> {
  step('(b) connecting looks up every already-scanned CD spine once');
  await connect(ctx);
  // The backfill ran inside the callback, before its 303.
  const queued = discogsJobs(ctx).total;
  assert(
    queued === CD_SPINES,
    `${queued} Discogs jobs right after connecting, expected ${CD_SPINES}`,
  );
  await drain(ctx);
  const rows = autoSearches(ctx);
  assert(
    rows.length === CD_SPINES,
    `${rows.length} auto searches, expected ${CD_SPINES}`,
  );
  expectSearched(ctx, photoId, 1, '(b)');
  check(`${CD_SPINES} auto searches, one per CD spine, each done or no_match`);
}

// (c) the backfill is idempotent: lease ticks and a reconnect add nothing.
async function stepIdempotent(ctx: Ctx, photoId: string): Promise<void> {
  step('(c) lease ticks and a second connect enqueue nothing more');
  await sleep(TWO_TICKS_MS);
  let rows = autoSearches(ctx);
  assert(
    rows.length === CD_SPINES,
    `${rows.length} auto searches after two lease ticks, expected ${CD_SPINES}`,
  );
  await connect(ctx);
  await drain(ctx);
  rows = autoSearches(ctx);
  assert(
    rows.length === CD_SPINES,
    `${rows.length} auto searches after reconnecting, expected ${CD_SPINES}`,
  );
  const jobs = discogsJobs(ctx).total;
  assert(jobs === CD_SPINES, `${jobs} Discogs jobs, expected ${CD_SPINES}`);
  expectSearched(ctx, photoId, 1, '(c)');
  check(`still ${CD_SPINES} auto searches and ${jobs} Discogs jobs`);
}

// (d) a revoked sign-in: the maintenance hook never re-queues auth_failed
// spines; only finishing a connect does, once each.
async function stepRevokedThenReconnect(ctx: Ctx): Promise<void> {
  step('(d) auth_failed spines wait for a reconnect, then search once');
  await ctx.fake.control({ revoked: true });
  const photoId = await scanShelf(ctx, 70);
  const spines = cdSpines(ctx, photoId);
  await waitFor(
    'the second photo searches to end auth_failed',
    async () => {
      const rows = autoSearches(ctx, photoId);
      return rows.length === spines.length &&
        rows.every((r) => r.status === 'auth_failed')
        ? true
        : undefined;
    },
    { timeoutMs: 60_000, intervalMs: 250 },
  );
  await drain(ctx);
  const before = autoSearches(ctx).length;
  await sleep(TWO_TICKS_MS);
  const afterTicks = autoSearches(ctx, photoId);
  assert(
    afterTicks.length === spines.length,
    `${afterTicks.length} auto searches for the revoked photo after two lease ticks, expected ${spines.length}`,
  );
  assert(
    autoSearches(ctx).length === before,
    'the maintenance hook enqueued a search while the sign-in was revoked',
  );
  assert(discogsJobs(ctx).open === 0, 'a Discogs job is queued after revoke');

  await ctx.fake.control({ revoked: false });
  await connect(ctx);
  await drain(ctx);
  const rows = autoSearches(ctx, photoId);
  for (const spineId of spines) {
    const mine = rows.filter((r) => r.spine_id === spineId);
    assert(
      mine.length === 2 && mine[0].status === 'auth_failed',
      `spine ${spineId} searches ${JSON.stringify(mine.map((r) => r.status))}, expected auth_failed then one new search`,
    );
  }
  expectSearched(ctx, photoId, 2, '(d)');
  const total = autoSearches(ctx).length;
  assert(
    total === CD_SPINES + 2 * spines.length,
    `${total} auto searches in all, expected ${CD_SPINES + 2 * spines.length}`,
  );
  check(
    `${spines.length} auth_failed searches untouched by two lease ticks; reconnect searched each once more`,
  );
}

runMain('verify-discogs-backfill', async (onCleanup) => {
  const tmp = await makeTempDir('verify-discogs-backfill');
  onCleanup(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const dataDir = path.join(tmp, 'data');
  const port = await getFreePort();

  step('build');
  await buildApp({ NEXT_DIST_DIR: DIST_DIR });

  step('start the fake Discogs');
  const fake = await startFakeDiscogs({ tmp });
  onCleanup(() => fake.stop());

  fs.mkdirSync(path.dirname(tempSecretsFile(tmp)), { recursive: true });
  const server = await stepStart(dataDir, port, {
    NEXT_DIST_DIR: DIST_DIR,
    ...fakeVisionEnv(tmp, TRACER),
    ...discogsEnv(fake, tmp),
  });
  onCleanup(async () => {
    await server.stop('SIGKILL');
  });
  const ctx: Ctx = {
    port,
    tmp,
    dataDir,
    baseUrl: server.baseUrl,
    origin: `http://127.0.0.1:${port}`,
    claudeLog: path.join(tmp, 'fake-claude.jsonl'),
    fake,
  };

  const photoId = await stepScanDisconnected(ctx);
  await stepConnectBackfills(ctx, photoId);
  await stepIdempotent(ctx, photoId);
  await stepRevokedThenReconnect(ctx);

  step('stop');
  await server.stop('SIGTERM');
});
