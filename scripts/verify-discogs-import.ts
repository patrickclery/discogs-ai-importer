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
// Plan 04-10: (c2) GET /api/spines gives the imported spine its import
// (phase imported, copy number, folder) and the folder label, every other
// spine no import, and /spines renders the Imported badge. The setup
// helpers live in scripts/lib/import-flow.ts.
// Plan 04-02 (IMP-04, D-07): (d) the app is SIGKILLed while the fake holds
// an add POST it already carried out (postMode hang-after-commit); after a
// restart on the same data the import adopts that copy, so the collection
// has exactly one. (e) the fake answers 502 after carrying out the add
// (502-after-commit); the worker's retry adopts the copy instead of posting
// again. (f) a release that already has a copy no import records is held
// already_in_collection with no add POST (D-05), its job ends succeeded with
// its dedupe key freed, and /api/spines reads Already in your collection.
// Plan 04-04 (IMP-03, IMP-04, D-04): (g) a second, re-encoded photo of the
// same shelf is scanned; its first TR-200 spine's 1001 import lands; a
// confirm of 1001 on its second TR-200 spine answers 409 duplicate naming
// the first (done, #1) and writes nothing; resent with allowDuplicate it
// is added as a second copy with its own instance id, never held as already
// in the collection (the first spine's copy is the app's own). (h) Link
// existing copy on the first shelf's held 1002 spine (from f) records the
// seeded copy, linked, with no add POST and no Discogs write. (i) a copy of
// 1033 is seeded; the second shelf's Juniper Vale 1033 import is held
// already in the collection; Add another copy re-enqueues it with
// allow_duplicate and it adds exactly one more copy.
// Later plans add their own named steps; step letters are stable.
// Run: node scripts/verify-discogs-import.ts   (VERIFY_SKIP_BUILD=1 reuses
// the build). It builds and starts from NEXT_DIST_DIR, default .next/verify,
// so a long-running `next start` on the default .next keeps working.
import fs from 'node:fs';
import path from 'node:path';
import type { SpinesResponse } from '../src/lib/scan-types.ts';
import {
  LAYOUTS,
  makeSyntheticShelf,
} from '../test/fixtures/vision/synthetic-shelf.mjs';
import { type FakeLogEntry, PROJECT_USER_AGENT } from './lib/discogs.ts';
import {
  type ConfirmAnswer,
  candidatesOf,
  confirm,
  connectAndScan,
  discogsIdle,
  FAKE_USERNAME,
  type FakePostMode,
  fakeLog,
  fakeState,
  type ImportCtx,
  type ImportDbRow,
  type ImportFakeState,
  importRow,
  spineByArtist,
  spineByCatno,
  startImportStack,
  waitImport,
  withWritableDb,
} from './lib/import-flow.ts';
import { assert, check, step } from './lib/jobs.ts';
import { upload, waitPhotoDone, withDb } from './lib/scan.ts';
import { runMain, waitFor } from './lib/server.ts';

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

// (c2) the /spines read model shows the import (IMP-01, IMP-02, IMP-04,
// D-03): the imported spine carries its copy number and folder, every other
// spine has no import, and the card reads Imported.
async function stepReadModel(
  ctx: ImportCtx,
  importedSpineId: string,
): Promise<void> {
  step('(c2) /api/spines and /spines show the TR-201 import');
  const row = importRow(ctx, importedSpineId);
  assert(row?.status === 'imported', 'TR-201 is not imported');
  const res = await fetch(`${ctx.baseUrl}/api/spines`, { cache: 'no-store' });
  assert(res.status === 200, `GET /api/spines answered ${res.status}`);
  const data = (await res.json()) as SpinesResponse;
  const folder = data.discogs.folder;
  assert(
    folder?.id === 1 && folder.name === 'Uncategorized',
    `discogs.folder is ${JSON.stringify(folder)}`,
  );
  const spine = data.spines.find((s) => s.id === importedSpineId);
  assert(spine, 'TR-201 is not listed');
  const imp = spine.import;
  assert(imp?.phase === 'imported', `TR-201 import is ${JSON.stringify(imp)}`);
  assert(
    imp.instanceId === row.instance_id,
    `import.instanceId ${imp.instanceId}, stored ${row.instance_id}`,
  );
  assert(
    imp.folderId === 1 && imp.folderName === 'Uncategorized',
    `import folder ${imp.folderId} ${imp.folderName}`,
  );
  assert(imp.releaseId === 1011, `import.releaseId ${imp.releaseId}`);
  assert(
    imp.failure === null && !imp.canRetry && !imp.canChangeMatch,
    `imported import offers ${JSON.stringify(imp)}`,
  );
  assert(spine.notOnDiscogs === false, 'TR-201 reads not on Discogs');
  const others = data.spines.filter((s) => s.id !== importedSpineId);
  assert(others.length > 0, 'no other spine listed');
  const withImport = others.filter((s) => s.import !== null);
  assert(
    withImport.length === 0,
    `${withImport.length} other spines carry an import`,
  );
  assert(
    others.every((s) => s.notOnDiscogs === false),
    'another spine reads not on Discogs',
  );
  const page = await fetch(`${ctx.baseUrl}/spines`, { cache: 'no-store' });
  assert(page.status === 200, `GET /spines answered ${page.status}`);
  const html = await page.text();
  assert(html.includes('Imported'), "/spines HTML has no 'Imported'");
  check(
    `TR-201 reads imported with instance ${imp.instanceId} in Uncategorized; ${others.length} other spines have no import; discogs.folder is 1 Uncategorized; /spines shows Imported`,
  );
}

async function setPostMode(ctx: ImportCtx, postMode: FakePostMode) {
  const state = (await ctx.fake.control({ postMode })) as { postMode?: string };
  assert(
    state.postMode === postMode,
    `the fake's postMode is ${state.postMode}`,
  );
}

type JobDbRow = {
  status: string;
  attempts: number;
  last_error: string | null;
  dedupe_key: string | null;
};

function jobOf(ctx: ImportCtx, jobId: string | null): JobDbRow | undefined {
  return withDb(ctx, (db) =>
    db
      .prepare(
        'SELECT status, attempts, last_error, dedupe_key FROM jobs WHERE id = @id',
      )
      .get({ id: jobId }),
  ) as JobDbRow | undefined;
}

/** Confirms the spine's candidate for releaseId; the import id. */
async function confirmRelease(
  ctx: ImportCtx,
  spineId: string,
  releaseId: number,
): Promise<string> {
  const candidate = candidatesOf(ctx, spineId).find(
    (c) => c.release_id === releaseId,
  );
  assert(candidate, `spine has no candidate for release ${releaseId}`);
  const answer = await confirm(ctx, spineId, { candidateId: candidate.id });
  assert(
    answer.status === 201 && typeof answer.body.importId === 'string',
    `confirm of ${releaseId} answered ${answer.status} ${JSON.stringify(answer.body)}`,
  );
  return answer.body.importId as string;
}

/** One copy of the release, posted once, recorded and marked adopted. */
async function assertAdoptedOnce(
  ctx: ImportCtx,
  spineId: string,
  releaseId: number,
): Promise<{ row: ImportDbRow; job: JobDbRow }> {
  const row = importRow(ctx, spineId);
  assert(row?.status === 'imported', `import is ${row?.status}`);
  const state = await fakeState(ctx);
  const copies = state.collection[String(releaseId)] ?? [];
  assert(
    copies.length === 1,
    `${copies.length} copies of ${releaseId} in the fake, expected 1`,
  );
  const posted = state.postsByRelease[String(releaseId)] ?? 0;
  assert(posted === 1, `${posted} add POSTs of ${releaseId}, expected 1`);
  assert(row.adopted === 1, `adopted ${row.adopted}, expected 1`);
  assert(row.post_count === 1, `post_count ${row.post_count}, expected 1`);
  assert(
    row.instance_id === copies[0].instance_id,
    `instance_id ${row.instance_id}, the fake's copy is ${copies[0].instance_id}`,
  );
  assert(state.postsHeld === 0, `${state.postsHeld} add POSTs still held`);
  const job = jobOf(ctx, row.job_id);
  assert(job?.status === 'succeeded', `the job is ${JSON.stringify(job)}`);
  return { row, job };
}

// (d) IMP-04, D-07, Pitfalls 1 and 7: the app dies while Discogs holds an
// add it already carried out; the restarted app adopts that copy.
async function stepKillMidPost(ctx: ImportCtx): Promise<void> {
  step('(d) SIGKILL while the add POST is held; the restart adopts the copy');
  const spineId = spineByArtist(ctx, 'Juniper Vale');
  await setPostMode(ctx, 'hang-after-commit');
  await confirmRelease(ctx, spineId, 1031);
  await waitFor(
    'the fake to hold the 1031 add and the import to be importing',
    async () => {
      const state = await fakeState(ctx);
      const row = importRow(ctx, spineId);
      return state.postsHeld === 1 &&
        row?.status === 'importing' &&
        row.intent_at !== null
        ? true
        : undefined;
    },
    { timeoutMs: 30_000, intervalMs: 200 },
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
  const row = await waitImport(ctx, spineId, ['imported', 'failed'], 60_000);
  assert(
    row.status === 'imported',
    `import ended ${row.status}: ${row.error_kind} ${row.error}`,
  );
  const { row: done } = await assertAdoptedOnce(ctx, spineId, 1031);
  check(
    `killed mid-POST, restarted: one 1031 copy, one add POST, instance ${done.instance_id} adopted with post_count 1, job succeeded`,
  );
}

// (e) D-07, D-09: Discogs answers 502 after it created the copy; the
// worker's retry adopts it instead of posting again.
async function stepBadGatewayAfterCommit(ctx: ImportCtx): Promise<void> {
  step('(e) a 502 after the add is retried and the retry adopts the copy');
  const spineId = spineByArtist(ctx, 'Static Bloom');
  await setPostMode(ctx, '502-after-commit');
  await confirmRelease(ctx, spineId, 1041);
  const row = await waitImport(ctx, spineId, ['imported', 'failed'], 60_000);
  assert(
    row.status === 'imported',
    `import ended ${row.status}: ${row.error_kind} ${row.error}`,
  );
  const { row: done, job } = await assertAdoptedOnce(ctx, spineId, 1041);
  assert(job.attempts === 2, `the job ran ${job.attempts} times, expected 2`);
  assert(
    !(job.last_error ?? '').includes(FAKE_USERNAME),
    'the job error names the username',
  );
  assert(
    (await fakeState(ctx)).postMode === 'ok',
    'postMode did not return to ok',
  );
  check(
    `502 after commit: retried once, one 1041 copy, one add POST, instance ${done.instance_id} adopted with post_count 1; last_error ${JSON.stringify(job.last_error)}`,
  );
}

// (f) D-05, IMP-03: a copy the owner already has stops the add before any
// write, and the owner decides.
async function stepAlreadyInCollection(ctx: ImportCtx): Promise<void> {
  step('(f) a release already in the collection is held with no add POST');
  const seeded = {
    instance_id: 4242,
    folder_id: 1,
    date_added: '2015-11-30T10:54:13-08:00',
  };
  const state = (await ctx.fake.control({
    collection: { 1002: [seeded] },
  })) as ImportFakeState;
  assert(
    JSON.stringify(state.collection['1002']) === JSON.stringify([seeded]),
    `the fake holds ${JSON.stringify(state.collection['1002'])}`,
  );
  const spineId = spineByCatno(ctx, 'TR-200');
  await confirmRelease(ctx, spineId, 1002);
  const row = await waitImport(ctx, spineId, [
    'already_in_collection',
    'imported',
    'failed',
  ]);
  assert(
    row.status === 'already_in_collection',
    `import ended ${row.status}: ${row.error_kind} ${row.error}`,
  );
  const after = await fakeState(ctx);
  const posted = after.postsByRelease['1002'] ?? 0;
  assert(posted === 0, `${posted} add POSTs of 1002, expected 0`);
  assert(
    (after.collection['1002'] ?? []).length === 1,
    'the fake collection changed',
  );
  const existing = JSON.parse(row.existing_json ?? 'null') as unknown;
  assert(
    JSON.stringify(existing) ===
      JSON.stringify([
        {
          instanceId: seeded.instance_id,
          folderId: seeded.folder_id,
          dateAdded: seeded.date_added,
        },
      ]),
    `existing_json is ${row.existing_json}`,
  );
  assert(
    row.post_count === 0 && row.intent_at === null && row.instance_id === null,
    `held import wrote an intent: ${JSON.stringify(row)}`,
  );
  const job = jobOf(ctx, row.job_id);
  assert(
    job?.status === 'succeeded' && job.dedupe_key === null,
    `the job is ${JSON.stringify(job)}`,
  );
  const res = await fetch(`${ctx.baseUrl}/api/spines`, { cache: 'no-store' });
  assert(res.status === 200, `GET /api/spines answered ${res.status}`);
  const data = (await res.json()) as SpinesResponse;
  const imp = data.spines.find((s) => s.id === spineId)?.import;
  assert(
    imp?.phase === 'already_in_collection' && imp.existing?.count === 1,
    `the spine's import is ${JSON.stringify(imp)}`,
  );
  check(
    `held already_in_collection: no 1002 add POST, existing_json is the seeded copy ${seeded.instance_id}, job succeeded with its dedupe key freed, /api/spines existing.count 1`,
  );
}

/**
 * Uploads another tracer-layout photo (re-encoded, so its bytes and hash
 * differ: an overlapping photo of the same shelf), waits for the scan and
 * for the Discogs lane to drain; the photo id. A local copy of
 * verify-discogs-search's scanAnotherShelf.
 */
async function scanAnotherShelf(
  ctx: ImportCtx,
  quality: number,
  filename: string,
): Promise<string> {
  const jpeg = new Uint8Array(
    (await makeSyntheticShelf(LAYOUTS.tracerShelf, { quality })).jpeg,
  );
  const up = await upload(ctx, jpeg, { filename });
  assert(up.status === 201, `upload returned ${up.status}`);
  const photoId = String(up.body.photoId);
  const photo = await waitPhotoDone(ctx, photoId);
  assert(
    photo.spineCount === LAYOUTS.tracerShelf.spines.length,
    `spineCount ${photo.spineCount}, expected ${LAYOUTS.tracerShelf.spines.length}`,
  );
  await waitFor(
    'the Discogs lane to drain',
    async () => (discogsIdle(ctx) ? true : undefined),
    { timeoutMs: 60_000, intervalMs: 250 },
  );
  return photoId;
}

/** The photo's active spines with that field value, in spine order. */
function spinesOnPhoto(
  ctx: ImportCtx,
  photoId: string,
  field: 'catalog_number' | 'artist',
  value: string,
): string[] {
  return withDb(ctx, (db) =>
    (
      db
        .prepare(
          `SELECT s.id FROM spines s
           JOIN spine_fields f ON f.spine_id = s.id AND f.field = @field
           JOIN spine_detections d ON d.id = s.current_detection_id
           WHERE s.photo_id = @photoId AND s.state = 'active'
             AND f.value = @value
           ORDER BY d.idx`,
        )
        .all({ photoId, field, value }) as { id: string }[]
    ).map((r) => r.id),
  );
}

/** Waits for the import to finish, noting every status it passed through. */
async function waitImportSeen(
  ctx: ImportCtx,
  spineId: string,
  statuses: string[],
): Promise<{ row: ImportDbRow; seen: Set<string> }> {
  const seen = new Set<string>();
  const row = await waitFor(
    `the import of spine ${spineId} to reach ${statuses.join(' or ')}`,
    async () => {
      const r = importRow(ctx, spineId);
      if (r) seen.add(r.status);
      return r && statuses.includes(r.status) ? r : undefined;
    },
    { timeoutMs: 30_000, intervalMs: 50 },
  );
  return { row, seen };
}

// (g) D-04, IMP-03, IMP-04 adjacency: an overlapping photo of the same
// shelf. A second copy of a CD already imported from another spine is
// refused with that spine's details and goes in only on the owner's word.
async function stepLocalDuplicate(ctx: ImportCtx): Promise<string> {
  step('(g) a confirm of a release another spine imported answers duplicate');
  const photoId = await scanAnotherShelf(ctx, 85, 'shelf-2.jpg');
  const tr200 = spinesOnPhoto(ctx, photoId, 'catalog_number', 'TR-200');
  assert(
    tr200.length === 2,
    `${tr200.length} TR-200 spines on the second shelf`,
  );
  const [first, second] = tr200;
  await confirmRelease(ctx, first, 1001);
  const firstRow = await waitImport(ctx, first, ['imported', 'failed']);
  assert(
    firstRow.status === 'imported',
    `the first 1001 import ended ${firstRow.status}: ${firstRow.error_kind} ${firstRow.error}`,
  );

  const candidate = candidatesOf(ctx, second).find(
    (c) => c.release_id === 1001,
  );
  assert(candidate, 'the second TR-200 spine has no 1001 candidate');
  const countRows = () =>
    withDb(ctx, (db) =>
      db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM imports WHERE spine_id = @second) AS imports,
             (SELECT COUNT(*) FROM jobs WHERE type = 'add_to_collection') AS jobs`,
        )
        .get({ second }),
    ) as { imports: number; jobs: number };
  const before = countRows();
  const dup = await confirm(ctx, second, { candidateId: candidate.id });
  assert(
    dup.status === 409 && dup.body.error === 'duplicate',
    `the second 1001 confirm answered ${dup.status} ${JSON.stringify(dup.body)}`,
  );
  assert(
    dup.body.done === true &&
      dup.body.spineNumber === 1 &&
      dup.body.photo === 'shelf-2.jpg' &&
      typeof dup.body.cropUrl === 'string' &&
      dup.body.cropUrl.startsWith('/api/files/') &&
      dup.body.message ===
        'This release is already going into your collection from another spine.',
    `the duplicate body is ${JSON.stringify(dup.body)}`,
  );
  const crop = await fetch(`${ctx.baseUrl}${dup.body.cropUrl}`, {
    cache: 'no-store',
  });
  assert(crop.status === 200, `the duplicate crop URL answered ${crop.status}`);
  const after = countRows();
  assert(
    after.imports === before.imports && after.jobs === before.jobs,
    `the refused confirm wrote ${after.imports - before.imports} imports and ${after.jobs - before.jobs} jobs`,
  );

  const again = await confirm(ctx, second, {
    candidateId: candidate.id,
    allowDuplicate: true,
  });
  assert(
    again.status === 201 && typeof again.body.importId === 'string',
    `the allowDuplicate confirm answered ${again.status} ${JSON.stringify(again.body)}`,
  );
  const { row, seen } = await waitImportSeen(ctx, second, [
    'imported',
    'already_in_collection',
    'failed',
  ]);
  assert(
    row.status === 'imported',
    `the second 1001 import ended ${row.status}: ${row.error_kind} ${row.error}`,
  );
  assert(
    !seen.has('already_in_collection') && row.existing_json === null,
    `the second import was held: seen ${[...seen].join(', ')}, existing_json ${row.existing_json}`,
  );
  assert(
    row.adopted === 0 && row.post_count === 1 && row.allow_duplicate === 0,
    `the second import adopted ${row.adopted}, post_count ${row.post_count}, allow_duplicate ${row.allow_duplicate}`,
  );
  const state = await fakeState(ctx);
  const copies = state.collection['1001'] ?? [];
  const ids = new Set(copies.map((c) => c.instance_id));
  assert(
    copies.length === 2 && ids.size === 2,
    `the fake holds ${JSON.stringify(copies)} for 1001`,
  );
  assert(
    firstRow.instance_id !== null &&
      row.instance_id !== null &&
      firstRow.instance_id !== row.instance_id &&
      ids.has(firstRow.instance_id) &&
      ids.has(row.instance_id),
    `instance ids ${firstRow.instance_id} and ${row.instance_id}, the fake holds ${[...ids].join(', ')}`,
  );
  const posted = state.postsByRelease['1001'] ?? 0;
  assert(posted === 2, `${posted} add POSTs of 1001, expected 2`);
  check(
    `409 duplicate (shelf-2.jpg, #1, done, crop served) wrote nothing; allowDuplicate added a second copy: instances ${firstRow.instance_id} and ${row.instance_id}, adopted 0, post_count 1, never held`,
  );
  return photoId;
}

/** POST an owner decision route from the app's own origin (empty body). */
async function postDecision(
  ctx: ImportCtx,
  spineId: string,
  route: 'link-existing' | 'another',
): Promise<ConfirmAnswer> {
  const res = await fetch(
    `${ctx.baseUrl}/api/spines/${encodeURIComponent(spineId)}/import/${route}`,
    {
      method: 'POST',
      headers: { origin: ctx.origin, 'content-type': 'application/json' },
      body: '{}',
    },
  );
  const text = await res.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

function addJobCount(ctx: ImportCtx): number {
  return withDb(
    ctx,
    (db) =>
      (
        db
          .prepare(
            `SELECT COUNT(*) AS n FROM jobs WHERE type = 'add_to_collection'`,
          )
          .get() as { n: number }
      ).n,
  );
}

// (h) D-05, IMP-04: Link existing copy binds the held spine to the copy the
// owner already has, with no write to Discogs.
async function stepLinkExisting(
  ctx: ImportCtx,
  shelf1PhotoId: string,
): Promise<void> {
  step('(h) Link existing copy records the seeded 1002 copy with no add');
  const [spineId] = spinesOnPhoto(
    ctx,
    shelf1PhotoId,
    'catalog_number',
    'TR-200',
  );
  assert(spineId, 'the first shelf has no TR-200 spine');
  const held = importRow(ctx, spineId);
  assert(
    held?.status === 'already_in_collection' && held.release_id === 1002,
    `the first shelf's TR-200 import is ${held?.status} ${held?.release_id}`,
  );
  const jobsBefore = addJobCount(ctx);
  const logBefore = fakeLog(ctx).length;
  const answer = await postDecision(ctx, spineId, 'link-existing');
  assert(
    answer.status === 200 &&
      answer.body.importId === held.id &&
      answer.body.instanceId === 4242,
    `link-existing answered ${answer.status} ${JSON.stringify(answer.body)}`,
  );
  const row = importRow(ctx, spineId);
  assert(
    row?.id === held.id &&
      row.status === 'imported' &&
      row.linked === 1 &&
      row.instance_id === 4242 &&
      row.folder_id === 1 &&
      row.post_count === 0 &&
      row.adopted === 0,
    `the linked row is ${JSON.stringify(row)}`,
  );
  const state = await fakeState(ctx);
  const posted = state.postsByRelease['1002'] ?? 0;
  assert(posted === 0, `${posted} add POSTs of 1002, expected 0`);
  assert(
    (state.collection['1002'] ?? []).length === 1,
    'the fake collection of 1002 changed',
  );
  assert(addJobCount(ctx) === jobsBefore, 'linking enqueued a job');
  const requests = fakeLog(ctx)
    .slice(logBefore)
    .filter((e) => e.surface === 'api' && e.path.includes('/collection/'));
  assert(
    requests.length === 0,
    `linking made ${requests.length} collection requests`,
  );
  const res = await fetch(`${ctx.baseUrl}/api/spines`, { cache: 'no-store' });
  const data = (await res.json()) as SpinesResponse;
  const imp = data.spines.find((s) => s.id === spineId)?.import;
  assert(
    imp?.phase === 'imported' && imp.instanceId === 4242,
    `the linked spine's import is ${JSON.stringify(imp)}`,
  );
  check(
    'link-existing 200: the held 1002 row is imported, linked 1, instance 4242 in folder 1; no add POST, no collection request, no job; /api/spines reads imported',
  );
}

// (i) D-05, IMP-03: the owner owns two, so Add another copy turns the hold
// into exactly one more copy.
async function stepAddAnotherCopy(
  ctx: ImportCtx,
  shelf2PhotoId: string,
): Promise<void> {
  step('(i) Add another copy turns a held 1033 import into one more copy');
  const seeded = {
    instance_id: 4343,
    folder_id: 1,
    date_added: '2016-02-01T09:00:00-08:00',
  };
  await ctx.fake.control({ collection: { 1033: [seeded] } });
  const [spineId] = spinesOnPhoto(ctx, shelf2PhotoId, 'artist', 'Juniper Vale');
  assert(spineId, 'the second shelf has no Juniper Vale spine');
  const importId = await confirmRelease(ctx, spineId, 1033);
  const held = await waitImport(ctx, spineId, [
    'already_in_collection',
    'imported',
    'failed',
  ]);
  assert(
    held.status === 'already_in_collection' && held.id === importId,
    `the 1033 import ended ${held.status}: ${held.error_kind} ${held.error}`,
  );
  assert(
    ((await fakeState(ctx)).postsByRelease['1033'] ?? 0) === 0,
    'the held 1033 import posted',
  );
  const answer = await postDecision(ctx, spineId, 'another');
  assert(
    answer.status === 201 && answer.body.importId === importId,
    `another answered ${answer.status} ${JSON.stringify(answer.body)}`,
  );
  const row = await waitImport(ctx, spineId, ['imported', 'failed'], 30_000);
  assert(
    row.status === 'imported' && row.id === importId,
    `the 1033 import ended ${row.status}: ${row.error_kind} ${row.error}`,
  );
  assert(
    row.allow_duplicate === 1 &&
      row.post_count === 1 &&
      row.adopted === 0 &&
      row.linked === 0,
    `the 1033 row is ${JSON.stringify(row)}`,
  );
  const state = await fakeState(ctx);
  const copies = state.collection['1033'] ?? [];
  assert(copies.length === 2, `${copies.length} copies of 1033, expected 2`);
  assert(
    row.instance_id !== null &&
      row.instance_id !== seeded.instance_id &&
      copies.some((c) => c.instance_id === row.instance_id),
    `instance ${row.instance_id}, the fake holds ${JSON.stringify(copies)}`,
  );
  const posted = state.postsByRelease['1033'] ?? 0;
  assert(posted === 1, `${posted} add POSTs of 1033, expected 1`);
  check(
    `held 1033 then another 201: one add POST, two 1033 copies (4343 and ${row.instance_id}), allow_duplicate 1, post_count 1, same row`,
  );
}

runMain('verify-discogs-import', async (onCleanup) => {
  const ctx = await startImportStack('verify-discogs-import', onCleanup);
  stepSchema(ctx);
  const shelf1PhotoId = await stepConnectAndScan(ctx);
  const importedSpineId = await stepConfirmImports(ctx);
  await stepConfirmRefusals(ctx, importedSpineId);
  await stepReadModel(ctx, importedSpineId);
  await stepKillMidPost(ctx);
  await stepBadGatewayAfterCommit(ctx);
  await stepAlreadyInCollection(ctx);
  const shelf2PhotoId = await stepLocalDuplicate(ctx);
  await stepLinkExisting(ctx, shelf1PhotoId);
  await stepAddAnotherCopy(ctx, shelf2PhotoId);
  // Later plans insert their steps here.

  step('stop');
  await ctx.server.stop('SIGTERM');
});
