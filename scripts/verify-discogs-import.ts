// Import proof against test/fixtures/fake-discogs.mjs and the fake Claude
// CLI (never a live API, never the owner's secrets.json or data/app.db).
// Plan 04-01: (a) the live app.db has the imports table, both partial
// unique indexes, spines.not_on_discogs and every migration; (b) a connected
// owner's tracer-shelf scan finishes and its searches drain; (c) confirming
// one candidate adds exactly one copy of that release to the fake
// collection's folder 1, after one read of the owner's copies, and the
// imports row records the copy number; no stored error names the username;
// two confirms sent at once make one import. (c1) every other confirm (wrong
// content type, a body that is not exactly { candidateId }, a candidate not
// listed for that spine, a spine already confirmed or marked not on
// Discogs) is refused and writes no row, no job and no add.
// Later plans add their own named steps; step letters are stable.
// Run: node scripts/verify-discogs-import.ts   (VERIFY_SKIP_BUILD=1 reuses
// the build). It builds and starts from NEXT_DIST_DIR, default .next/verify,
// so a long-running `next start` on the default .next keeps working.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  LAYOUTS,
  makeSyntheticShelf,
} from '../test/fixtures/vision/synthetic-shelf.mjs';
import {
  connectViaApi,
  discogsEnv,
  type FakeDiscogs,
  type FakeLogEntry,
  type FakeState,
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
  type ServerHandle,
  waitFor,
} from './lib/server.ts';

// ---------------------------------------------------------------------------
// Setup helpers. They depend on no step below, so Plan 04-10 can move them
// unchanged into scripts/lib/import-flow.ts for the later verify scripts.

/** Build output dir (next.config.ts accepts .next or .next/<name>). */
const DIST_DIR = process.env.NEXT_DIST_DIR || '.next/verify';
const TRACER = LAYOUTS.tracerShelf;
/** The fake's default username; no stored error text may contain it. */
const FAKE_USERNAME = 'fake-owner';

type ImportInstance = {
  instance_id: number;
  folder_id: number;
  date_added: string;
};

/** The fake's state with the collection fields Plan 04-01 added. */
type ImportFakeState = FakeState & {
  collection: Record<string, ImportInstance[]>;
  posts: number;
};

export type ImportCtx = ScanCtx & {
  tmp: string;
  fake: FakeDiscogs;
  server: ServerHandle;
  /** Stops the server (SIGKILL or SIGTERM) and starts it on the same data. */
  restart(signal?: NodeJS.Signals): Promise<void>;
};

export type ImportDbRow = {
  id: string;
  spine_id: string;
  candidate_id: string | null;
  release_id: number;
  folder_id: number;
  status: string;
  allow_duplicate: number;
  adopted: number;
  linked: number;
  instance_id: number | null;
  intent_at: number | null;
  snapshot_json: string | null;
  existing_json: string | null;
  candidate_json: string | null;
  post_count: number;
  error_kind: string | null;
  error: string | null;
  job_id: string | null;
};

export type ConfirmAnswer = { status: number; body: Record<string, unknown> };

export async function startImportStack(
  name: string,
  onCleanup: (f: () => Promise<void> | void) => void,
): Promise<ImportCtx> {
  const tmp = await makeTempDir(name);
  onCleanup(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const dataDir = path.join(tmp, 'data');
  const port = await getFreePort();

  step('build');
  await buildApp({ NEXT_DIST_DIR: DIST_DIR });

  step('start the fake Discogs');
  const fake = await startFakeDiscogs({ tmp });
  onCleanup(() => fake.stop());

  fs.mkdirSync(path.dirname(tempSecretsFile(tmp)), { recursive: true });
  const env = {
    NEXT_DIST_DIR: DIST_DIR,
    ...fakeVisionEnv(tmp, TRACER),
    ...discogsEnv(fake, tmp),
  };
  const server = await startScanServer(dataDir, port, env);
  const ctx: ImportCtx = {
    port,
    tmp,
    dataDir,
    baseUrl: server.baseUrl,
    origin: `http://127.0.0.1:${port}`,
    claudeLog: path.join(tmp, 'fake-claude.jsonl'),
    fake,
    server,
    async restart(signal: NodeJS.Signals = 'SIGKILL') {
      await ctx.server.stop(signal);
      ctx.server = await startScanServer(dataDir, port, env);
    },
  };
  onCleanup(async () => {
    await ctx.server.stop('SIGKILL');
  });
  return ctx;
}

/** Read-write access for steps that set up a case directly in SQL. */
export function withWritableDb<T>(
  ctx: Pick<ScanCtx, 'dataDir'>,
  fn: (db: Database.Database) => T,
): T {
  const db = new Database(path.join(ctx.dataDir, 'app.db'), {
    fileMustExist: true,
  });
  db.pragma('busy_timeout = 5000');
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

export function fakeLog(ctx: ImportCtx): FakeLogEntry[] {
  if (!fs.existsSync(ctx.fake.logFile)) return [];
  return fs
    .readFileSync(ctx.fake.logFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as FakeLogEntry);
}

export async function fakeState(ctx: ImportCtx): Promise<ImportFakeState> {
  return (await ctx.fake.state()) as ImportFakeState;
}

export function discogsIdle(ctx: ImportCtx): boolean {
  return withDb(
    ctx,
    (db) =>
      (
        db
          .prepare(
            `SELECT COUNT(*) AS n FROM jobs
             WHERE lane = 'discogs' AND status IN ('queued', 'running')`,
          )
          .get() as { n: number }
      ).n === 0,
  );
}

/** Connect, scan the tracer shelf and wait for its searches; the photo id. */
export async function connectAndScan(ctx: ImportCtx): Promise<string> {
  const location = await connectViaApi(ctx);
  assert(
    location === `${ctx.origin}/settings?discogs=connected`,
    `connect ended at ${location}`,
  );
  const jpeg = new Uint8Array((await makeSyntheticShelf(TRACER)).jpeg);
  const up = await upload(ctx, jpeg);
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
  return photoId;
}

function spineByField(ctx: ImportCtx, field: string, value: string): string {
  const row = withDb(ctx, (db) =>
    db
      .prepare(
        `SELECT s.id FROM spines s
         JOIN spine_fields f ON f.spine_id = s.id AND f.field = @field
         JOIN spine_detections d ON d.id = s.current_detection_id
         WHERE s.state = 'active' AND f.value = @value
         ORDER BY d.idx LIMIT 1`,
      )
      .get({ field, value }),
  ) as { id: string } | undefined;
  assert(row, `no active spine with ${field} ${value}`);
  return row.id;
}

export function spineByCatno(ctx: ImportCtx, catno: string): string {
  return spineByField(ctx, 'catalog_number', catno);
}

export function spineByArtist(ctx: ImportCtx, artist: string): string {
  return spineByField(ctx, 'artist', artist);
}

/** The spine's candidates in rank order. */
export function candidatesOf(
  ctx: ImportCtx,
  spineId: string,
): { id: string; release_id: number }[] {
  return withDb(
    ctx,
    (db) =>
      db
        .prepare(
          `SELECT id, release_id FROM discogs_candidates
           WHERE spine_id = @spineId ORDER BY rank, id`,
        )
        .all({ spineId }) as { id: string; release_id: number }[],
  );
}

/** POST /api/spines/{id}/import from the app's own origin. */
export async function confirm(
  ctx: ImportCtx,
  spineId: string,
  body: unknown,
  init: { contentType?: string; rawBody?: string } = {},
): Promise<ConfirmAnswer> {
  const res = await fetch(
    `${ctx.baseUrl}/api/spines/${encodeURIComponent(spineId)}/import`,
    {
      method: 'POST',
      headers: {
        origin: ctx.origin,
        'content-type': init.contentType ?? 'application/json',
      },
      body: init.rawBody ?? JSON.stringify(body),
    },
  );
  const text = await res.text();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    parsed = { raw: text };
  }
  return { status: res.status, body: parsed };
}

/** The spine's newest imports row, or undefined. */
export function importRow(
  ctx: ImportCtx,
  spineId: string,
): ImportDbRow | undefined {
  return withDb(
    ctx,
    (db) =>
      db
        .prepare(
          `SELECT * FROM imports WHERE spine_id = @spineId
           ORDER BY created_at DESC, id DESC LIMIT 1`,
        )
        .get({ spineId }) as ImportDbRow | undefined,
  );
}

/** Waits until the spine's newest import has one of the statuses. */
export function waitImport(
  ctx: ImportCtx,
  spineId: string,
  statuses: string[],
  timeoutMs = 30_000,
): Promise<ImportDbRow> {
  return waitFor(
    `the import of spine ${spineId} to reach ${statuses.join(' or ')}`,
    async () => {
      const row = importRow(ctx, spineId);
      return row && statuses.includes(row.status) ? row : undefined;
    },
    { timeoutMs, intervalMs: 200 },
  );
}

// ---------------------------------------------------------------------------
// Steps.

// (a) boot applied migration 0003 to the live app.db.
function stepSchema(ctx: ImportCtx): void {
  step('(a) live app.db has the imports table and every migration');
  const sqlFiles = fs
    .readdirSync(path.join(process.cwd(), 'drizzle'))
    .filter((f) => f.endsWith('.sql')).length;
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
    for (const n of [
      'imports',
      'imports_spine_open_idx',
      'imports_instance_idx',
    ]) {
      assert(names.has(n), `${n} missing from live app.db`);
    }
    const cols = (
      db.prepare('PRAGMA table_info(spines)').all() as { name: string }[]
    ).map((c) => c.name);
    assert(
      cols.includes('not_on_discogs'),
      'spines.not_on_discogs missing from live app.db',
    );
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
  check(
    `imports with both partial unique indexes and spines.not_on_discogs exist, ${sqlFiles} migrations applied`,
  );
}

// (b) connect, scan the tracer shelf, and let the searches drain.
async function stepConnectAndScan(ctx: ImportCtx): Promise<string> {
  step('(b) connect, scan the tracer shelf, wait for the searches');
  const photoId = await connectAndScan(ctx);
  const imports = withDb(
    ctx,
    (db) =>
      (db.prepare('SELECT COUNT(*) AS n FROM imports').get() as { n: number })
        .n,
  );
  assert(imports === 0, `${imports} imports rows before any confirm`);
  assert((await fakeState(ctx)).posts === 0, 'an add POST before any confirm');
  check('connected; scan done; searches drained; no import and no add yet');
  return photoId;
}

const COLLECTION_GET = (releaseId: number) =>
  `/users/${FAKE_USERNAME}/collection/releases/${releaseId}`;
const ADD_POST = (folderId: number, releaseId: number) =>
  `/users/${FAKE_USERNAME}/collection/folders/${folderId}/releases/${releaseId}`;

function assertSigned(e: FakeLogEntry, what: string): void {
  assert(
    e.userAgent === PROJECT_USER_AGENT,
    `${what} sent User-Agent ${e.userAgent}`,
  );
  assert(
    e.signatureMethod === 'PLAINTEXT' && e.oauthParams.includes('oauth_token'),
    `${what} is not signed with the access token`,
  );
}

// (c) one confirm becomes one add of that release to folder 1.
async function stepConfirmImports(ctx: ImportCtx): Promise<string> {
  step('(c) confirming TR-201 adds release 1011 to folder 1 exactly once');
  const spineId = spineByCatno(ctx, 'TR-201');
  const candidate = candidatesOf(ctx, spineId).find(
    (c) => c.release_id === 1011,
  );
  assert(candidate, 'TR-201 has no candidate for release 1011');
  // D-08, Pitfall 8: a double click or two tabs send the confirm twice at
  // once; the IMMEDIATE transaction lets exactly one through.
  const answers = await Promise.all([
    confirm(ctx, spineId, { candidateId: candidate.id }),
    confirm(ctx, spineId, { candidateId: candidate.id }),
  ]);
  const won = answers.filter((a) => a.status === 201);
  const lost = answers.filter(
    (a) => a.status === 409 && a.body.error === 'already_confirmed',
  );
  assert(
    won.length === 1 && lost.length === 1,
    `two confirms at once answered ${JSON.stringify(answers)}`,
  );
  const answer = won[0];
  assert(
    typeof answer.body.importId === 'string',
    `confirm answered ${JSON.stringify(answer.body)}`,
  );
  const made = withDb(ctx, (db) =>
    db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM imports WHERE spine_id = @spineId) AS imports,
           (SELECT COUNT(*) FROM jobs WHERE type = 'add_to_collection') AS jobs`,
      )
      .get({ spineId }),
  ) as { imports: number; jobs: number };
  assert(
    made.imports === 1 && made.jobs === 1,
    `two confirms at once made ${made.imports} imports and ${made.jobs} jobs`,
  );

  const row = await waitImport(ctx, spineId, ['imported', 'failed']);
  assert(
    row.status === 'imported',
    `import ended ${row.status}: ${row.error_kind} ${row.error}`,
  );
  assert(row.id === answer.body.importId, 'the imported row is another row');
  assert(row.release_id === 1011, `release_id ${row.release_id}`);
  assert(row.candidate_id === candidate.id, 'candidate_id not recorded');
  assert(row.folder_id === 1, `folder_id ${row.folder_id}, expected 1`);
  assert(row.post_count === 1, `post_count ${row.post_count}, expected 1`);
  assert(row.intent_at !== null, 'intent_at not set');
  assert(row.adopted === 0, 'the copy was adopted, not posted');
  const state = await fakeState(ctx);
  const copies = state.collection['1011'] ?? [];
  assert(copies.length === 1, `${copies.length} copies of 1011 in the fake`);
  assert(state.posts === 1, `${state.posts} add POSTs, expected 1`);
  assert(
    row.instance_id === copies[0].instance_id,
    `instance_id ${row.instance_id}, the fake's copy is ${copies[0].instance_id}`,
  );
  assert(
    copies[0].folder_id === 1,
    `the copy is in folder ${copies[0].folder_id}`,
  );

  const log = fakeLog(ctx).filter((e) => e.surface === 'api');
  const gets = log.filter(
    (e) => e.method === 'GET' && e.path === COLLECTION_GET(1011),
  );
  const posts = log.filter(
    (e) => e.method === 'POST' && e.path.includes('/collection/'),
  );
  assert(gets.length === 1, `${gets.length} reads of the 1011 copies`);
  assert(
    posts.length === 1 && posts[0].path === ADD_POST(1, 1011),
    `add POSTs: ${JSON.stringify(posts.map((p) => p.path))}`,
  );
  assert(posts[0].status === 201, `the add POST answered ${posts[0].status}`);
  assert(gets[0].t <= posts[0].t, 'the add POST came before the read');
  assertSigned(gets[0], 'the copies read');
  assertSigned(posts[0], 'the add POST');

  const job = withDb(ctx, (db) =>
    db
      .prepare('SELECT status, type FROM jobs WHERE id = @id')
      .get({ id: row.job_id }),
  ) as { status: string; type: string } | undefined;
  assert(
    job?.type === 'add_to_collection' && job.status === 'succeeded',
    `the import job is ${JSON.stringify(job)}`,
  );
  const leaks = withDb(ctx, (db) =>
    db
      .prepare(
        `SELECT 'jobs' AS t, last_error AS e FROM jobs WHERE last_error LIKE @u
         UNION ALL
         SELECT 'imports', error FROM imports WHERE error LIKE @u`,
      )
      .all({ u: `%${FAKE_USERNAME}%` }),
  );
  assert(
    leaks.length === 0,
    `stored errors name the username: ${leaks.length}`,
  );
  check(
    `two confirms at once made one import (201 and 409 already_confirmed); one read then one signed add POST to folder 1; imports row imported with instance ${row.instance_id}, post_count 1`,
  );
  return spineId;
}

async function expectRefused(
  answer: Promise<ConfirmAnswer>,
  status: number,
  error: string,
  what: string,
): Promise<void> {
  const a = await answer;
  assert(
    a.status === status && a.body.error === error,
    `${what}: answered ${a.status} ${JSON.stringify(a.body)}, expected ${status} ${error}`,
  );
}

// (c1) a confirm that names anything but one listed candidate of an
// importable spine with no open import is refused and writes nothing
// (IMP-01, D-01, D-08).
async function stepConfirmRefusals(
  ctx: ImportCtx,
  importedSpineId: string,
): Promise<void> {
  step('(c1) every other confirm is refused and writes nothing');
  const bloom = spineByArtist(ctx, 'Static Bloom');
  const owen = spineByArtist(ctx, 'Owen Ashby');
  const bloomCandidate = candidatesOf(ctx, bloom)[0];
  assert(bloomCandidate, 'Static Bloom has no candidate');
  const imported = candidatesOf(ctx, importedSpineId);
  assert(imported.length > 0, 'TR-201 has no candidate');
  // TR-201 lists one release in the fake, so its "second candidate" is
  // another spine's listed candidate; already_confirmed is checked first.
  const second = imported[1] ?? bloomCandidate;

  await expectRefused(
    confirm(
      ctx,
      bloom,
      {},
      {
        contentType: 'text/plain',
        rawBody: JSON.stringify({ candidateId: bloomCandidate.id }),
      },
    ),
    415,
    'unsupported_type',
    'a text/plain confirm',
  );
  for (const [what, body] of [
    ['an empty body', {}],
    ['an empty candidateId', { candidateId: '' }],
    [
      'a body naming a release',
      { candidateId: bloomCandidate.id, releaseId: 1041 },
    ],
  ] as const) {
    await expectRefused(confirm(ctx, bloom, body), 400, 'invalid_body', what);
  }
  await expectRefused(
    confirm(ctx, bloom, { candidateId: '01UNKNOWNCANDIDATE0000000' }),
    404,
    'no_candidate',
    'an unknown candidate',
  );
  await expectRefused(
    confirm(ctx, bloom, { candidateId: imported[0].id }),
    404,
    'no_candidate',
    "another spine's candidate",
  );
  await expectRefused(
    confirm(ctx, importedSpineId, { candidateId: second.id }),
    409,
    'already_confirmed',
    'a second candidate on an imported spine',
  );
  await expectRefused(
    confirm(ctx, importedSpineId, { candidateId: imported[0].id }),
    409,
    'already_confirmed',
    'the same candidate again',
  );
  withWritableDb(ctx, (db) =>
    db
      .prepare('UPDATE spines SET not_on_discogs = 1 WHERE id = @id')
      .run({ id: owen }),
  );
  try {
    await expectRefused(
      confirm(ctx, owen, { candidateId: bloomCandidate.id }),
      409,
      'not_on_discogs',
      'a spine marked not on Discogs',
    );
  } finally {
    withWritableDb(ctx, (db) =>
      db
        .prepare('UPDATE spines SET not_on_discogs = 0 WHERE id = @id')
        .run({ id: owen }),
    );
  }

  const after = withDb(ctx, (db) =>
    db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM imports) AS imports,
           (SELECT COUNT(*) FROM jobs WHERE type = 'add_to_collection') AS jobs,
           (SELECT COUNT(*) FROM imports WHERE spine_id = @bloom) AS bloom`,
      )
      .get({ bloom }),
  ) as { imports: number; jobs: number; bloom: number };
  assert(
    after.imports === 1 && after.jobs === 1,
    `after the refusals: ${after.imports} imports, ${after.jobs} jobs`,
  );
  assert(after.bloom === 0, 'Static Bloom has an imports row');
  const posts = (await fakeState(ctx)).posts;
  assert(posts === 1, `${posts} add POSTs after the refusals, expected 1`);
  check(
    '415 text/plain; 400 empty, blank and release-naming bodies; 404 no_candidate for unknown and foreign candidates; 409 already_confirmed twice; 409 not_on_discogs; still one import, one job, one add',
  );
}

runMain('verify-discogs-import', async (onCleanup) => {
  const ctx = await startImportStack('verify-discogs-import', onCleanup);
  stepSchema(ctx);
  await stepConnectAndScan(ctx);
  const importedSpineId = await stepConfirmImports(ctx);
  await stepConfirmRefusals(ctx, importedSpineId);
  // Later plans insert their steps here.

  step('stop');
  await ctx.server.stop('SIGTERM');
});
