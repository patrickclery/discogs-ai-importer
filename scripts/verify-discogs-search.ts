// Automatic Discogs search proof against test/fixtures/fake-discogs.mjs and
// the fake Claude CLI (never a live API, never the owner's secrets.json).
// Plan 03-03: (a) the live app.db has the Phase 3 tables and every
// migration, (b) a connected owner's tracer-shelf scan finishes and its
// Discogs searches drain, (c) one auto search per CD spine with the right
// cascade stage, candidates and exact-catno pin, (d) every search request is
// signed, CD-only, ten per page and paced through the one gate.
// Plan 03-05: (e) a 429 mid-batch pauses the lane and every search still
// finishes without spending an attempt, (f) a revoked sign-in costs at most
// one request for a whole batch. (f) stays the last step: later plans insert
// their steps before it.
// Plans 03-05, 03-08, 03-09, 03-10, 03-11 and 03-12 add their own named
// steps here; step letters are stable across plans.
// Run: node scripts/verify-discogs-search.ts   (VERIFY_SKIP_BUILD=1 reuses
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
  type FakeLogEntry,
  PROJECT_USER_AGENT,
  startFakeDiscogs,
  tempSecretsFile,
} from './lib/discogs.ts';
import { assert, check, step } from './lib/jobs.ts';
import {
  fakeVisionEnv,
  type Ctx as ScanCtx,
  stepStart as startScanServer,
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
const PHASE3_TABLES = ['discogs_searches', 'discogs_candidates'];
/** Fake limit 600/min gives a 112 ms gate interval; allow network jitter. */
const MIN_GAP_MS = 100;
/** Retry-After the fake sends with its injected 429 in step (e). */
const RETRY_AFTER_S = 2;
/** Timer and clock granularity allowed when measuring the pause. */
const PAUSE_JITTER_MS = 5;

type Ctx = ScanCtx & { tmp: string; fake: FakeDiscogs };

type SpineSearch = {
  spineId: string;
  artist: string | null;
  catno: string | null;
  searches: { kind: string; status: string; stage: string | null }[];
  candidates: {
    release_id: number;
    rank: number;
    catno: string | null;
    catno_match: number;
    stage: string | null;
    source: string;
  }[];
};

function fakeLog(ctx: Ctx): FakeLogEntry[] {
  if (!fs.existsSync(ctx.fake.logFile)) return [];
  return fs
    .readFileSync(ctx.fake.logFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as FakeLogEntry);
}

function searchRequests(ctx: Ctx): FakeLogEntry[] {
  return fakeLog(ctx).filter(
    (e) => e.surface === 'api' && e.path === '/database/search',
  );
}

/** Every active spine of the photo with its fields, searches and candidates. */
function spineSearches(ctx: Ctx, photoId: string): SpineSearch[] {
  return withDb(ctx, (db) => {
    const spines = db
      .prepare(
        `SELECT s.id,
           (SELECT value FROM spine_fields f
            WHERE f.spine_id = s.id AND f.field = 'artist') AS artist,
           (SELECT value FROM spine_fields f
            WHERE f.spine_id = s.id AND f.field = 'catalog_number') AS catno
         FROM spines s
         JOIN spine_detections d ON d.id = s.current_detection_id
         WHERE s.photo_id = ? AND s.state = 'active'
         ORDER BY d.idx`,
      )
      .all(photoId) as {
      id: string;
      artist: string | null;
      catno: string | null;
    }[];
    return spines.map((s) => ({
      spineId: s.id,
      artist: s.artist,
      catno: s.catno,
      searches: db
        .prepare(
          `SELECT kind, status, stage FROM discogs_searches
           WHERE spine_id = ? ORDER BY created_at, id`,
        )
        .all(s.id) as SpineSearch['searches'],
      candidates: db
        .prepare(
          `SELECT release_id, rank, catno, catno_match, stage, source
           FROM discogs_candidates WHERE spine_id = ? ORDER BY rank`,
        )
        .all(s.id) as SpineSearch['candidates'],
    }));
  });
}

// (a) boot applied every migration, including Phase 3's, to the live app.db.
function stepSchema(ctx: Ctx): void {
  step('(a) live app.db has the Discogs tables and every migration');
  const sqlFiles = fs
    .readdirSync(path.join(process.cwd(), 'drizzle'))
    .filter((f) => f.endsWith('.sql')).length;
  withDb(ctx, (db) => {
    const tables = new Set(
      (
        db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all() as { name: string }[]
      ).map((r) => r.name),
    );
    for (const t of PHASE3_TABLES) {
      assert(tables.has(t), `table ${t} missing from live app.db`);
    }
    const n = (
      db.prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations').get() as {
        n: number;
      }
    ).n;
    assert(
      n === sqlFiles,
      `__drizzle_migrations has ${n} rows, expected ${sqlFiles}`,
    );
  });
  check(`${PHASE3_TABLES.join(' and ')} exist, ${sqlFiles} migrations applied`);
}

function discogsBacklog(ctx: Ctx): { total: number; open: number } {
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

// (b) connect, scan the tracer shelf, and let the Discogs lane drain.
async function stepConnectAndScan(ctx: Ctx): Promise<string> {
  step('(b) connect, scan the tracer shelf, wait for the searches');
  const location = await connectViaApi(ctx);
  assert(
    location === `${ctx.origin}/settings?discogs=connected`,
    `connect ended at ${location}`,
  );
  assert(discogsBacklog(ctx).total === 0, 'a Discogs job exists before a scan');
  const jpeg = new Uint8Array((await makeSyntheticShelf(TRACER)).jpeg);
  const up = await upload(ctx, jpeg);
  assert(up.status === 201, `upload returned ${up.status}`);
  const photoId = String(up.body.photoId);
  const photo = await waitPhotoDone(ctx, photoId);
  assert(
    photo.spineCount === TRACER.spines.length,
    `spineCount ${photo.spineCount}, expected ${TRACER.spines.length}`,
  );
  // The searches are enqueued in the same transaction that set the run done.
  const queued = discogsBacklog(ctx).total;
  assert(
    queued === TRACER.spines.length,
    `${queued} Discogs jobs once the scan was done, expected ${TRACER.spines.length}`,
  );
  await waitFor(
    'the Discogs lane to drain',
    async () => (discogsBacklog(ctx).open === 0 ? true : undefined),
    { timeoutMs: 60_000, intervalMs: 250 },
  );
  const failed = withDb(ctx, (db) =>
    db
      .prepare(
        `SELECT type, status, last_error FROM jobs
         WHERE lane = 'discogs' AND status != 'succeeded'`,
      )
      .all(),
  );
  assert(
    failed.length === 0,
    `Discogs jobs did not succeed: ${JSON.stringify(failed)}`,
  );
  check(`connected; scan done; ${queued} search_spine jobs succeeded`);
  return photoId;
}

function expectSpine(
  s: SpineSearch,
  want: {
    status: string;
    stage: string | null;
    releases: number[];
    pinned?: number;
  },
): void {
  const label = `spine ${s.artist} (${s.catno})`;
  assert(
    s.searches.length === 1,
    `${label} has ${s.searches.length} searches, expected 1`,
  );
  const [search] = s.searches;
  assert(search.kind === 'auto', `${label} search kind ${search.kind}`);
  assert(
    search.status === want.status,
    `${label} search status ${search.status}, expected ${want.status}`,
  );
  assert(
    search.stage === want.stage,
    `${label} stage ${search.stage}, expected ${want.stage}`,
  );
  const got = s.candidates.map((c) => c.release_id);
  assert(
    JSON.stringify(got) === JSON.stringify(want.releases),
    `${label} candidates ${JSON.stringify(got)}, expected ${JSON.stringify(want.releases)}`,
  );
  for (const [i, c] of s.candidates.entries()) {
    assert(c.rank === i, `${label} rank ${c.rank} at position ${i}`);
    assert(c.source === 'auto', `${label} candidate source ${c.source}`);
    assert(c.stage === want.stage, `${label} candidate stage ${c.stage}`);
    const pinned = want.pinned !== undefined && c.release_id === want.pinned;
    assert(
      c.catno_match === (pinned ? 1 : 0),
      `${label} release ${c.release_id} catno_match ${c.catno_match}`,
    );
  }
}

// (c) one auto search per CD spine, with the expected stage and candidates.
function stepCandidates(ctx: Ctx, photoId: string): void {
  step('(c) one auto search per CD spine; stages, candidates, catno pin');
  const spines = spineSearches(ctx, photoId);
  assert(
    spines.length === TRACER.spines.length,
    `${spines.length} active spines, expected ${TRACER.spines.length}`,
  );
  const autoRows = withDb(
    ctx,
    (db) =>
      db
        .prepare(
          `SELECT COUNT(*) AS n, COUNT(DISTINCT spine_id) AS spines
           FROM discogs_searches WHERE kind = 'auto'`,
        )
        .get() as { n: number; spines: number },
  );
  assert(
    autoRows.n === 6 && autoRows.spines === 6,
    `${autoRows.n} auto searches over ${autoRows.spines} spines, expected 6 over 6`,
  );
  const byCatno = (c: string) => spines.filter((s) => s.catno === c);
  const tr200 = byCatno('TR-200');
  assert(tr200.length === 2, `${tr200.length} TR-200 spines, expected 2`);
  for (const s of tr200) {
    expectSpine(s, {
      status: 'done',
      stage: 'catno',
      releases: [1001, 1002],
      pinned: 1001,
    });
  }
  expectSpine(byCatno('TR-201')[0], {
    status: 'done',
    stage: 'catno',
    releases: [1011],
    pinned: 1011,
  });
  expectSpine(byCatno('TR-203')[0], {
    status: 'done',
    stage: 'artist_title',
    releases: [1031, 1032, 1033],
  });
  expectSpine(byCatno('TR-204')[0], {
    status: 'done',
    stage: 'text',
    releases: [1041],
  });
  expectSpine(byCatno('TR-205')[0], {
    status: 'no_match',
    stage: null,
    releases: [],
  });
  const stored = withDb(
    ctx,
    (db) =>
      db
        .prepare(
          `SELECT title, artist, year, country, labels_json, formats_json,
             thumb_url, master_id
           FROM discogs_candidates WHERE release_id = 1001 LIMIT 1`,
        )
        .get() as {
        title: string;
        artist: string | null;
        year: number | null;
        country: string | null;
        labels_json: string;
        formats_json: string;
        thumb_url: string | null;
        master_id: number | null;
      },
  );
  assert(
    stored.title === 'Nova Lane - Blue Hour',
    `title ${stored.title} is not the verbatim combined title`,
  );
  assert(stored.artist === 'Nova Lane', `artist ${stored.artist}`);
  assert(stored.year === 1999, `year ${stored.year}, expected 1999`);
  assert(stored.country === 'UK', `country ${stored.country}`);
  assert(
    stored.labels_json === JSON.stringify(['Fake Label', 'Other Imprint']),
    `labels ${stored.labels_json} are not deduped`,
  );
  const formats = JSON.parse(stored.formats_json) as { name: string }[];
  assert(formats[0]?.name === 'CD', `formats ${stored.formats_json}`);
  assert(
    stored.thumb_url === `${ctx.fake.baseUrl}/img/1001.jpeg`,
    `thumb_url ${stored.thumb_url}`,
  );
  assert(stored.master_id === 51001, `master_id ${stored.master_id}`);
  check(
    'TR-200 x2: catno, 1001 pinned before 1002; TR-201: catno; Juniper Vale: artist_title (3); Static Bloom: text (1); Owen Ashby: no_match',
  );
}

// (d) the requests themselves: signed, CD-only, ten per page, paced.
function stepRequests(ctx: Ctx): void {
  step('(d) every search request is signed, CD-only and paced');
  const searches = searchRequests(ctx);
  // 2 x TR-200 (1 each), TR-201 (1), Juniper Vale (2), Static Bloom (3),
  // Owen Ashby (3): the cascade stops at the first stage with results.
  assert(
    searches.length === 11,
    `${searches.length} /database/search requests, expected 11`,
  );
  for (const e of searches) {
    const q = e.query;
    assert(
      q.type === 'release' &&
        q.format === 'CD' &&
        q.per_page === '10' &&
        q.page === '1',
      `search query ${JSON.stringify(q)} lacks type=release, format=CD, per_page=10, page=1`,
    );
    assert(!('master' in q), 'a search asked for masters');
    assert(e.userAgent === PROJECT_USER_AGENT, `User-Agent ${e.userAgent}`);
    assert(
      e.signatureMethod === 'PLAINTEXT' &&
        e.oauthParams.includes('oauth_token'),
      `search not signed with the access token: ${JSON.stringify(e.oauthParams)}`,
    );
  }
  // Owen Ashby falls through all three stages, in cascade order.
  const owen = searches.filter(
    (e) =>
      e.query.catno === 'TR-205' ||
      e.query.artist === 'Owen Ashby' ||
      e.query.q === 'Owen Ashby - North Light',
  );
  const order = owen.map((e) =>
    e.query.catno ? 'catno' : e.query.artist ? 'artist_title' : 'text',
  );
  assert(
    order.join(',') === 'catno,artist_title,text',
    `Owen Ashby stages ran as ${order.join(',')}`,
  );
  assert(
    owen[1]?.query.release_title === 'North Light',
    'the artist_title stage did not send release_title',
  );
  const api = fakeLog(ctx)
    .filter((e) => e.surface === 'api')
    .sort((a, b) => a.t - b.t);
  let minGap = Number.POSITIVE_INFINITY;
  for (let i = 1; i < api.length; i += 1) {
    minGap = Math.min(minGap, api[i].t - api[i - 1].t);
  }
  assert(
    minGap >= MIN_GAP_MS,
    `two API requests only ${minGap} ms apart, expected >= ${MIN_GAP_MS}`,
  );
  check(
    `11 signed CD-only searches; ${api.length} API requests at least ${minGap} ms apart`,
  );
}

type DiscogsJob = {
  id: string;
  status: string;
  attempts: number;
  last_error: string | null;
  dedupe_key: string | null;
};

/** The search_spine jobs of one photo's searches. */
function photoJobs(ctx: Ctx, photoId: string): DiscogsJob[] {
  return withDb(
    ctx,
    (db) =>
      db
        .prepare(
          `SELECT j.id, j.status, j.attempts, j.last_error, j.dedupe_key
           FROM jobs j
           JOIN discogs_searches ds ON ds.job_id = j.id
           JOIN spines s ON s.id = ds.spine_id
           WHERE s.photo_id = ? AND j.lane = 'discogs'`,
        )
        .all(photoId) as DiscogsJob[],
  );
}

/** Uploads another tracer-layout photo (distinct bytes) and drains Discogs. */
async function scanAnotherShelf(ctx: Ctx, quality: number): Promise<string> {
  const jpeg = new Uint8Array(
    (await makeSyntheticShelf(TRACER, { quality })).jpeg,
  );
  const up = await upload(ctx, jpeg);
  assert(up.status === 201, `upload returned ${up.status}`);
  const photoId = String(up.body.photoId);
  await waitPhotoDone(ctx, photoId);
  await waitFor(
    'the Discogs lane to drain',
    async () => (discogsBacklog(ctx).open === 0 ? true : undefined),
    { timeoutMs: 60_000, intervalMs: 250 },
  );
  return photoId;
}

// (e) a 429 in the middle of a batch: the lane waits out Retry-After and
// every search still finishes, with no attempt spent on the 429 (D-06).
async function step429Resume(ctx: Ctx): Promise<void> {
  step('(e) a 429 mid-batch pauses the lane and resumes without losing work');
  const before = fakeLog(ctx).length;
  await ctx.fake.control({ at429: 2, retryAfter: RETRY_AFTER_S });
  const photoId = await scanAnotherShelf(ctx, 80);

  const spines = spineSearches(ctx, photoId);
  assert(
    spines.length === TRACER.spines.length,
    `${spines.length} active spines, expected ${TRACER.spines.length}`,
  );
  for (const s of spines) {
    assert(
      s.searches.length === 1 &&
        ['done', 'no_match'].includes(s.searches[0].status),
      `spine ${s.artist} searches ${JSON.stringify(s.searches)}, expected one done or no_match`,
    );
  }
  const jobs = photoJobs(ctx, photoId);
  assert(
    jobs.length === TRACER.spines.length,
    `${jobs.length} search jobs, expected ${TRACER.spines.length}`,
  );
  for (const j of jobs) {
    assert(
      j.status === 'succeeded' && j.attempts === 1,
      `job ${j.id} ${j.status} with attempts ${j.attempts}, expected succeeded with 1`,
    );
  }
  const deferred = jobs.filter((j) => j.last_error?.startsWith('deferred'));
  assert(deferred.length >= 1, 'no job records the 429 deferral');

  const api = fakeLog(ctx)
    .slice(before)
    .filter((e) => e.surface === 'api')
    .sort((a, b) => a.t - b.t);
  const hits = api.filter((e) => e.status === 429);
  assert(hits.length === 1, `${hits.length} 429 answers, expected 1`);
  const at = hits[0].t;
  const next = api.find((e) => e.t > at);
  assert(next, 'no API request after the 429');
  const gap = next.t - at;
  assert(
    gap >= RETRY_AFTER_S * 1000 - PAUSE_JITTER_MS,
    `an API request ${gap} ms after the 429, expected none for ${RETRY_AFTER_S * 1000} ms`,
  );
  check(
    `6 searches finished, 6 jobs succeeded on attempt 1, ${deferred.length} deferred; next request ${gap} ms after the 429`,
  );
}

// (f) a revoked sign-in mid-backlog: one 401, then every remaining search
// short-circuits to auth_failed without a request (RESEARCH Pitfall 7).
// Keep this step last: it leaves the app needing a reconnect.
async function stepRevoked(ctx: Ctx): Promise<void> {
  step('(f) a revoked sign-in costs at most one request for the batch');
  const before = fakeLog(ctx).length;
  await ctx.fake.control({ revoked: true });
  const photoId = await scanAnotherShelf(ctx, 70);

  const spines = spineSearches(ctx, photoId);
  for (const s of spines) {
    assert(
      s.searches.length === 1 && s.searches[0].status === 'auth_failed',
      `spine ${s.artist} searches ${JSON.stringify(s.searches)}, expected one auth_failed`,
    );
  }
  const signed = fakeLog(ctx)
    .slice(before)
    .filter((e) => e.surface === 'api' && e.path === '/database/search');
  assert(
    signed.length <= 1,
    `${signed.length} search requests after the revoke, expected at most 1`,
  );
  const jobs = photoJobs(ctx, photoId);
  assert(
    jobs.length === TRACER.spines.length,
    `${jobs.length} search jobs, expected ${TRACER.spines.length}`,
  );
  for (const j of jobs) {
    assert(
      j.status === 'succeeded',
      `job ${j.id} is ${j.status}, expected succeeded (none queued or failed)`,
    );
    assert(j.dedupe_key === null, `job ${j.id} kept its dedupe key`);
  }
  check(
    `${spines.length} searches auth_failed with ${signed.length} search request; no job queued or failed; keys released`,
  );
}

runMain('verify-discogs-search', async (onCleanup) => {
  const tmp = await makeTempDir('verify-discogs-search');
  onCleanup(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const dataDir = path.join(tmp, 'data');
  const port = await getFreePort();

  step('build');
  await buildApp({ NEXT_DIST_DIR: DIST_DIR });

  step('start the fake Discogs');
  const fake = await startFakeDiscogs({ tmp });
  onCleanup(() => fake.stop());

  fs.mkdirSync(path.dirname(tempSecretsFile(tmp)), { recursive: true });
  const server = await startScanServer(dataDir, port, {
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

  stepSchema(ctx);
  const photoId = await stepConnectAndScan(ctx);
  stepCandidates(ctx, photoId);
  stepRequests(ctx);
  await step429Resume(ctx);
  // Later plans insert their steps here, before (f).
  await stepRevoked(ctx);

  step('stop');
  await server.stop('SIGTERM');
});
