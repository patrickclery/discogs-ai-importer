// Review queue proof (REV-03, D-10, D-11) against test/fixtures/fake-discogs.mjs
// and the fake Claude CLI (never a live API, never the owner's secrets.json
// or data/app.db).
// Plan 04-05: (a) after a connected scan of the tracer shelf, GET
// /api/spines gives every spine one review status and counts.byStatus reads
// pending 5 and not_found 1 (Owen Ashby, no Discogs result), the others 0,
// summing to counts.all 6. (b) confirming TR-201's top candidate moves it to
// imported: imported 1, pending 4; ?status=imported lists exactly that
// spine; ?status=bogus reads as All; ?status=imported&review=1 returns the
// same counts as no filter, and photoProgress counts the import. (c) the
// /spines page under ?status=imported renders the status filter. (d) marking
// Owen Ashby not on Discogs moves it from not_found to not_on_discogs;
// statusById still names it while ?status=not_found lists none.
// Plan 04-09: (e) after a Discogs outage (the first TR-200 spine's newest
// search failed, Juniper Vale's import failed before any POST) failed reads
// 2; one POST /api/spines/retry-failed {} answers { retried: 2, skipped: 0 },
// and once the lane drains failed is 0, the TR-200 spine is pending again
// and Juniper Vale is imported with exactly one 1031 copy in the fake.
// Later plans add their own named steps; step letters are stable.
// Run: node scripts/verify-review-queue.ts   (VERIFY_SKIP_BUILD=1 reuses the
// build). It builds and starts from NEXT_DIST_DIR, default .next/verify, so
// a long-running `next start` on the default .next keeps working.
import { randomUUID } from 'node:crypto';
import { REVIEW_STATUSES, type ReviewStatus } from '../src/lib/import-types.ts';
import type { SpinesResponse } from '../src/lib/scan-types.ts';
import {
  candidatesOf,
  confirm,
  connectAndScan,
  discogsIdle,
  fakeState,
  type ImportCtx,
  spineByArtist,
  spineByCatno,
  startImportStack,
  TRACER,
  waitImport,
  withWritableDb,
} from './lib/import-flow.ts';
import { assert, check, step } from './lib/jobs.ts';
import { runMain, waitFor } from './lib/server.ts';

async function getSpinesApi(
  ctx: ImportCtx,
  query = '',
): Promise<SpinesResponse> {
  const res = await fetch(`${ctx.baseUrl}/api/spines${query}`, {
    cache: 'no-store',
  });
  assert(res.status === 200, `GET /api/spines${query} answered ${res.status}`);
  return (await res.json()) as SpinesResponse;
}

function describeCounts(byStatus: Record<ReviewStatus, number>): string {
  return REVIEW_STATUSES.map((s) => `${s} ${byStatus[s]}`).join(', ');
}

function assertCounts(
  data: SpinesResponse,
  expected: Partial<Record<ReviewStatus, number>>,
  what: string,
): void {
  const byStatus = data.counts.byStatus;
  assert(byStatus, `${what}: counts.byStatus is missing`);
  for (const s of REVIEW_STATUSES) {
    const want = expected[s] ?? 0;
    assert(
      byStatus[s] === want,
      `${what}: ${s} is ${byStatus[s]}, expected ${want} (${describeCounts(byStatus)})`,
    );
  }
  const sum = REVIEW_STATUSES.reduce((n, s) => n + byStatus[s], 0);
  assert(
    sum === data.counts.all,
    `${what}: byStatus sums to ${sum}, counts.all is ${data.counts.all}`,
  );
}

function assertStatusesMatchMap(data: SpinesResponse, what: string): void {
  for (const s of data.spines) {
    assert(s.reviewStatus !== null, `${what}: spine ${s.id} has no status`);
    assert(
      data.statusById[s.id] === s.reviewStatus,
      `${what}: statusById ${data.statusById[s.id]} vs spine ${s.reviewStatus}`,
    );
  }
}

// (a) every spine has one status and the counts cover the shelf.
async function stepInitialCounts(ctx: ImportCtx): Promise<string> {
  step('(a) after the scan every spine has one status; pending 5, not found 1');
  const photoId = await connectAndScan(ctx);
  const total = TRACER.spines.length;
  const data = await getSpinesApi(ctx);
  assert(
    data.counts.all === total,
    `counts.all ${data.counts.all}, expected ${total}`,
  );
  assert(
    data.spines.length === total,
    `${data.spines.length} spines listed, expected ${total}`,
  );
  assertCounts(data, { pending: 5, not_found: 1 }, '(a)');
  assertStatusesMatchMap(data, '(a)');
  const owen = spineByArtist(ctx, 'Owen Ashby');
  const owenSpine = data.spines.find((s) => s.id === owen);
  assert(
    owenSpine?.reviewStatus === 'not_found',
    `Owen Ashby reads ${owenSpine?.reviewStatus}`,
  );
  assert(
    Object.keys(data.statusById).length === total,
    `statusById names ${Object.keys(data.statusById).length} spines`,
  );
  const progress = data.photoProgress[photoId];
  assert(
    progress?.imported === 0 && progress.total === total,
    `photoProgress is ${JSON.stringify(progress)}`,
  );
  check(
    `byStatus ${describeCounts(data.counts.byStatus)}; sums to counts.all ${total}; Owen Ashby not_found; photoProgress 0 / ${total}`,
  );
  return photoId;
}

// (b) an import moves one spine to imported and ?status= narrows the list.
async function stepImportedFilter(
  ctx: ImportCtx,
  photoId: string,
): Promise<string> {
  step('(b) confirming TR-201 makes it imported; ?status= narrows the list');
  const spineId = spineByCatno(ctx, 'TR-201');
  const top = candidatesOf(ctx, spineId)[0];
  assert(top, 'TR-201 has no candidate');
  const answer = await confirm(ctx, spineId, { candidateId: top.id });
  assert(
    answer.status === 201,
    `confirm answered ${answer.status} ${JSON.stringify(answer.body)}`,
  );
  await waitImport(ctx, spineId, ['imported']);
  const total = TRACER.spines.length;

  const all = await getSpinesApi(ctx);
  assertCounts(all, { imported: 1, pending: 4, not_found: 1 }, '(b) All');
  assertStatusesMatchMap(all, '(b) All');
  assert(
    all.photoProgress[photoId]?.imported === 1 &&
      all.photoProgress[photoId]?.total === total,
    `photoProgress is ${JSON.stringify(all.photoProgress[photoId])}`,
  );

  const imported = await getSpinesApi(ctx, '?status=imported');
  assert(
    imported.spines.length === 1 && imported.spines[0].id === spineId,
    `?status=imported lists ${JSON.stringify(imported.spines.map((s) => s.id))}`,
  );
  assert(
    imported.spines[0].reviewStatus === 'imported',
    `TR-201 reads ${imported.spines[0].reviewStatus}`,
  );
  assert(
    imported.photos.length === 1 && imported.photos[0].id === photoId,
    `?status=imported shows ${imported.photos.length} photos`,
  );
  assertCounts(
    imported,
    { imported: 1, pending: 4, not_found: 1 },
    '(b) ?status=imported',
  );
  assert(
    Object.keys(imported.statusById).length === total,
    `?status=imported statusById names ${Object.keys(imported.statusById).length} spines`,
  );

  const bogus = await getSpinesApi(ctx, '?status=bogus');
  assert(
    bogus.spines.length === total,
    `?status=bogus lists ${bogus.spines.length} spines, expected ${total}`,
  );
  const upper = await getSpinesApi(ctx, '?status=IMPORTED');
  assert(
    upper.spines.length === total,
    `?status=IMPORTED lists ${upper.spines.length} spines, expected ${total}`,
  );

  const both = await getSpinesApi(ctx, '?status=imported&review=1');
  assert(
    JSON.stringify(both.counts.byStatus) ===
      JSON.stringify(all.counts.byStatus),
    `?status=imported&review=1 counts ${JSON.stringify(both.counts.byStatus)} differ from ${JSON.stringify(all.counts.byStatus)}`,
  );
  assert(
    both.counts.all === all.counts.all &&
      both.counts.needsReview === all.counts.needsReview,
    `?status=imported&review=1 counts.all/needsReview ${both.counts.all}/${both.counts.needsReview}`,
  );
  assert(
    both.spines.every((s) => s.reviewStatus === 'imported'),
    '?status=imported&review=1 lists a spine that is not imported',
  );
  check(
    `TR-201 imported: byStatus ${describeCounts(all.counts.byStatus)}; ?status=imported lists only TR-201; ?status=bogus and ?status=IMPORTED list all ${total}; ?status=imported&review=1 keeps the same counts (${both.spines.length} shown); photoProgress 1 / ${total}`,
  );
  return spineId;
}

// (c) the page renders the status filter under ?status=imported.
async function stepPage(ctx: ImportCtx): Promise<void> {
  step('(c) /spines?status=imported renders the status filter');
  const page = await fetch(`${ctx.baseUrl}/spines?status=imported`, {
    cache: 'no-store',
  });
  assert(page.status === 200, `GET /spines answered ${page.status}`);
  const html = await page.text();
  for (const text of ['Filter by status', 'Not on Discogs', 'Needs review']) {
    assert(html.includes(text), `/spines HTML has no '${text}'`);
  }
  check(
    "/spines?status=imported renders 'Filter by status', 'Not on Discogs' and 'Needs review'",
  );
}

// (d) marking a spine moves it between statuses; statusById still names it
// while the old status filter no longer lists it (the moved-out toast's data).
async function stepMarkedMoves(ctx: ImportCtx): Promise<void> {
  step('(d) marking Owen Ashby moves it from not found to not on Discogs');
  const owen = spineByArtist(ctx, 'Owen Ashby');
  const before = await getSpinesApi(ctx, '?status=not_found');
  assert(
    before.spines.length === 1 && before.spines[0].id === owen,
    `?status=not_found lists ${JSON.stringify(before.spines.map((s) => s.id))} before the mark`,
  );
  const changed = withWritableDb(
    ctx,
    (db) =>
      db
        .prepare('UPDATE spines SET not_on_discogs = 1 WHERE id = @id')
        .run({ id: owen }).changes,
  );
  assert(changed === 1, `the mark changed ${changed} rows`);

  const all = await getSpinesApi(ctx);
  assertCounts(all, { imported: 1, pending: 4, not_on_discogs: 1 }, '(d) All');
  const owenSpine = all.spines.find((s) => s.id === owen);
  assert(
    owenSpine?.reviewStatus === 'not_on_discogs',
    `Owen Ashby reads ${owenSpine?.reviewStatus}`,
  );

  const notFound = await getSpinesApi(ctx, '?status=not_found');
  assert(
    notFound.spines.length === 0,
    `?status=not_found still lists ${notFound.spines.length} spines`,
  );
  assert(
    notFound.photos.length === 0,
    `?status=not_found still shows ${notFound.photos.length} photos`,
  );
  assert(
    notFound.statusById[owen] === 'not_on_discogs',
    `?status=not_found statusById names Owen Ashby ${notFound.statusById[owen]}`,
  );
  assertCounts(
    notFound,
    { imported: 1, pending: 4, not_on_discogs: 1 },
    '(d) ?status=not_found',
  );
  check(
    `Owen Ashby marked: byStatus ${describeCounts(all.counts.byStatus)}; ?status=not_found lists none and statusById names it not_on_discogs`,
  );
}

// (e) Retry all failed puts a failed search and a failed import back in line.
async function stepRetryAllFailed(ctx: ImportCtx): Promise<void> {
  step('(e) Retry all failed retries a failed search and a failed import');
  const tr200 = spineByCatno(ctx, 'TR-200');
  const juniper = spineByArtist(ctx, 'Juniper Vale');
  const top = candidatesOf(ctx, juniper)[0];
  assert(top?.release_id === 1031, `Juniper Vale's top is ${top?.release_id}`);
  withWritableDb(ctx, (db) => {
    const now = Date.now();
    db.prepare(
      `INSERT INTO discogs_searches (id, spine_id, kind, input_hash,
         inputs_json, status, error_kind, error, created_at, finished_at)
       VALUES (@id, @spineId, 'again', NULL, '{}', 'failed', 'unavailable',
         'Discogs answered 502', @now, @now)`,
    ).run({ id: randomUUID(), spineId: tr200, now });
    db.prepare(
      `INSERT INTO imports (id, spine_id, candidate_id, release_id, folder_id,
         status, error_kind, error, intent_at, created_at, updated_at)
       VALUES (@id, @spineId, @candidateId, 1031, 1, 'failed', 'unavailable',
         'Discogs answered 502', NULL, @now, @now)`,
    ).run({ id: randomUUID(), spineId: juniper, candidateId: top.id, now });
  });
  const before = await getSpinesApi(ctx);
  assert(
    before.counts.byStatus.failed === 2,
    `failed is ${before.counts.byStatus.failed} before the retry (${describeCounts(before.counts.byStatus)})`,
  );
  assert(
    before.statusById[tr200] === 'failed' &&
      before.statusById[juniper] === 'failed',
    `TR-200 reads ${before.statusById[tr200]}, Juniper Vale ${before.statusById[juniper]}`,
  );

  const res = await fetch(`${ctx.baseUrl}/api/spines/retry-failed`, {
    method: 'POST',
    headers: { origin: ctx.origin, 'content-type': 'application/json' },
    body: '{}',
  });
  const body = (await res.json()) as Record<string, unknown>;
  assert(
    res.status === 200 && body.retried === 2 && body.skipped === 0,
    `retry-failed answered ${res.status} ${JSON.stringify(body)}`,
  );
  await waitImport(ctx, juniper, ['imported']);
  await waitFor(
    'the Discogs lane to drain',
    async () => (discogsIdle(ctx) ? true : undefined),
    { timeoutMs: 60_000, intervalMs: 250 },
  );

  const after = await getSpinesApi(ctx);
  assert(
    after.counts.byStatus.failed === 0,
    `failed is ${after.counts.byStatus.failed} after the retry (${describeCounts(after.counts.byStatus)})`,
  );
  assert(
    after.statusById[tr200] === 'pending',
    `TR-200 reads ${after.statusById[tr200]} after the retry`,
  );
  assert(
    after.statusById[juniper] === 'imported',
    `Juniper Vale reads ${after.statusById[juniper]} after the retry`,
  );
  const imports = withWritableDb(
    ctx,
    (db) =>
      db
        .prepare('SELECT COUNT(*) AS n FROM imports WHERE spine_id = @id')
        .get({ id: juniper }) as { n: number },
  );
  assert(imports.n === 1, `Juniper Vale has ${imports.n} imports rows`);
  const copies = (await fakeState(ctx)).collection['1031'] ?? [];
  assert(copies.length === 1, `the fake holds ${copies.length} 1031 copies`);
  check(
    `retry-failed answered { retried: 2, skipped: 0 }; failed 2 -> 0; TR-200 pending again; Juniper Vale imported on its one row with exactly one 1031 copy (${describeCounts(after.counts.byStatus)})`,
  );
}

runMain('verify-review-queue', async (onCleanup) => {
  const ctx = await startImportStack('verify-review-queue', onCleanup);
  const photoId = await stepInitialCounts(ctx);
  await stepImportedFilter(ctx, photoId);
  await stepPage(ctx);
  await stepMarkedMoves(ctx);
  await stepRetryAllFailed(ctx);
  // Later plans insert their steps here.

  step('stop');
  await ctx.server.stop('SIGTERM');
});
