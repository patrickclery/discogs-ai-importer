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
// Later plans add their own named steps; step letters are stable.
// Run: node scripts/verify-review-queue.ts   (VERIFY_SKIP_BUILD=1 reuses the
// build). It builds and starts from NEXT_DIST_DIR, default .next/verify, so
// a long-running `next start` on the default .next keeps working.
import { REVIEW_STATUSES, type ReviewStatus } from '../src/lib/import-types.ts';
import type { SpinesResponse } from '../src/lib/scan-types.ts';
import {
  candidatesOf,
  confirm,
  connectAndScan,
  type ImportCtx,
  spineByArtist,
  spineByCatno,
  startImportStack,
  TRACER,
  waitImport,
} from './lib/import-flow.ts';
import { assert, check, step } from './lib/jobs.ts';
import { runMain } from './lib/server.ts';

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

runMain('verify-review-queue', async (onCleanup) => {
  const ctx = await startImportStack('verify-review-queue', onCleanup);
  const photoId = await stepInitialCounts(ctx);
  await stepImportedFilter(ctx, photoId);
  await stepPage(ctx);
  // Later plans insert their steps here.

  step('stop');
  await ctx.server.stop('SIGTERM');
});
