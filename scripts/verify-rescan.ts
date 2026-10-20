// Re-scan proof (Plan 02-10, INGEST-04, D-13..D-17). Against the fake CLI's
// vision mode (never the live CLI): upload the tracer shelf, edit two
// spines, rewrite the fixture as a second read (boxes shifted, two reads
// changed, two spines gone, one new), re-scan once (201) and at once again
// (409), then check that every spine found again kept its id and the
// owner's edits, the missing ones are superseded or orphaned, the new one is
// active, run 1 is untouched and the fake CLI saw exactly two -p calls.
// Run: node scripts/verify-rescan.ts   (VERIFY_SKIP_BUILD=1 reuses .next)
// Each step is a named, exported function so Plan 02-11 can extend it.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  LAYOUTS,
  makeSyntheticShelf,
  structuredOutputFor,
} from '../test/fixtures/vision/synthetic-shelf.mjs';
import { assert, check, step } from './lib/jobs.ts';
import {
  buildApp,
  getFreePort,
  makeTempDir,
  runMain,
  type ServerHandle,
  startServer,
  waitFor,
} from './lib/server.ts';

const FAKE_CLAUDE = path.join(process.cwd(), 'test/fixtures/fake-claude.mjs');
const TRACER = LAYOUTS.tracerShelf;
const FILENAME = 'rescan-shelf.jpg';

/** Tracer spine indexes with a role in the second read. */
export const ROLES = {
  /** Edited title; its title read changes in run 2. */
  X: 1,
  /** Unedited; its title read changes in run 2. */
  Z: 3,
  /** Unedited; missing from run 2 (superseded). */
  W: 5,
  /** Edited artist; missing from run 2 (orphaned). */
  Y: 4,
} as const;

const X_OWNER_TITLE = 'Glass Rivers (owner fix)';
const Y_OWNER_ARTIST = 'Static Bloom (owner fix)';
const X_NEW_TITLE = 'Glass Rivers (Remastered)';
const Z_NEW_TITLE = 'Low Orbit Deluxe';
const V_TEXT = 'Marlow Reed - Salt and Ember';
const SHIFT = 6;

export type Ctx = {
  baseUrl: string;
  origin: string;
  dataDir: string;
  fixture: string;
  claudeLog: string;
};

type FieldDto = {
  field: string;
  aiValue: string | null;
  value: string | null;
  editBaseAiValue: string | null;
  confidence: number;
};
type SpineApi = {
  id: string;
  photoId: string;
  index: number;
  state: string;
  crop: { url: string } | null;
  fields: FieldDto[];
};
type PhotoApi = {
  id: string;
  status: string;
  runNo: number;
  spineCount: number;
  errorReason: string | null;
};

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function withDb<T>(ctx: Ctx, fn: (db: Database.Database) => T): T {
  const db = new Database(path.join(ctx.dataDir, 'app.db'), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/** -p invocations recorded by the fake CLI (auth and version probes excluded). */
export function visionCalls(ctx: Ctx): number {
  if (!fs.existsSync(ctx.claudeLog)) return 0;
  return fs
    .readFileSync(ctx.claudeLog, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { argv: string[] })
    .filter((e) => e.argv[0] === '-p').length;
}

function field(spine: SpineApi, name: string): FieldDto {
  const f = spine.fields.find((x) => x.field === name);
  assert(f, `spine ${spine.id} has no ${name} field`);
  return f;
}

async function getSpines(ctx: Ctx, photoId: string): Promise<SpineApi[]> {
  const res = await fetch(`${ctx.baseUrl}/api/spines?photo=${photoId}`);
  assert(res.status === 200, `GET /api/spines returned ${res.status}`);
  return ((await res.json()) as { spines: SpineApi[] }).spines;
}

async function getPhoto(ctx: Ctx, photoId: string): Promise<PhotoApi> {
  const res = await fetch(`${ctx.baseUrl}/api/photos`);
  assert(res.status === 200, `GET /api/photos returned ${res.status}`);
  const { photos } = (await res.json()) as { photos: PhotoApi[] };
  const photo = photos.find((p) => p.id === photoId);
  assert(photo, `photo ${photoId} missing from GET /api/photos`);
  return photo;
}

export async function waitRunDone(
  ctx: Ctx,
  photoId: string,
  runNo: number,
): Promise<PhotoApi> {
  return waitFor(
    `run ${runNo} done`,
    async () => {
      const p = await getPhoto(ctx, photoId);
      if (p.runNo === runNo && p.status === 'error') {
        throw new Error(`run ${runNo} failed: ${p.errorReason}`);
      }
      return p.runNo === runNo && p.status === 'done' ? p : undefined;
    },
    { timeoutMs: 60_000, intervalMs: 250 },
  );
}

export async function postRescan(
  ctx: Ctx,
  photoId: string,
  contentType = 'application/json',
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${ctx.baseUrl}/api/photos/${photoId}/rescan`, {
    method: 'POST',
    headers: { origin: ctx.origin, 'content-type': contentType },
    body: '{}',
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

async function patchField(
  ctx: Ctx,
  spineId: string,
  name: string,
  value: string,
): Promise<FieldDto> {
  const res = await fetch(`${ctx.baseUrl}/api/spines/${spineId}/fields`, {
    method: 'PATCH',
    headers: { origin: ctx.origin, 'content-type': 'application/json' },
    body: JSON.stringify({ field: name, value }),
  });
  assert(res.status === 200, `PATCH ${name} returned ${res.status}`);
  return (await res.json()) as FieldDto;
}

// (a) run 1: upload the tracer shelf and wait for every spine.
export async function stepFirstScan(ctx: Ctx): Promise<{
  photoId: string;
  spines: SpineApi[];
}> {
  step('(a) upload the tracer shelf and wait for run 1');
  const jpeg = new Uint8Array((await makeSyntheticShelf(TRACER)).jpeg);
  const res = await fetch(`${ctx.baseUrl}/api/photos`, {
    method: 'POST',
    headers: {
      origin: ctx.origin,
      'content-type': 'image/jpeg',
      'x-filename': encodeURIComponent(FILENAME),
    },
    body: new Blob([jpeg as Uint8Array<ArrayBuffer>]),
  });
  assert(res.status === 201, `upload returned ${res.status}`);
  const { photoId } = (await res.json()) as { photoId: string };
  const photo = await waitRunDone(ctx, photoId, 1);
  assert(
    photo.spineCount === TRACER.spines.length,
    `run 1 spineCount ${photo.spineCount}, expected ${TRACER.spines.length}`,
  );
  const spines = await getSpines(ctx, photoId);
  assert(spines.length === TRACER.spines.length, `${spines.length} spines`);
  spines.forEach((s, i) => {
    assert(s.index === i, `spine ${i} has index ${s.index}`);
  });
  check(`photo ${photoId} done with ${spines.length} spines`);
  return { photoId, spines };
}

// (b) the owner edits X's title and Y's artist.
export async function stepEdits(ctx: Ctx, spines: SpineApi[]): Promise<void> {
  step("(b) PATCH X's title and Y's artist");
  const x = await patchField(ctx, spines[ROLES.X].id, 'title', X_OWNER_TITLE);
  assert(x.value === X_OWNER_TITLE, `X title stored ${x.value}`);
  const y = await patchField(ctx, spines[ROLES.Y].id, 'artist', Y_OWNER_ARTIST);
  assert(y.value === Y_OWNER_ARTIST, `Y artist stored ${y.value}`);
  check('two edits stored beside the AI reads');
}

/** Run 2's answer: shifted boxes, X and Z re-read, W and Y gone, V new. */
export function secondRead(): ReturnType<typeof structuredOutputFor> {
  const base = structuredOutputFor(TRACER);
  const keep = base.spines.filter(
    (s) => s.index !== ROLES.W && s.index !== ROLES.Y,
  );
  const shifted = keep.map((s) => {
    const [x1, y1, x2, y2] = s.bbox;
    const copy = {
      ...s,
      bbox: [x1 + SHIFT, y1 + SHIFT, x2 + SHIFT, y2 + SHIFT],
    };
    if (s.index === ROLES.X) {
      copy.title = { value: X_NEW_TITLE, confidence: 0.9 };
    }
    if (s.index === ROLES.Z) {
      copy.title = { value: Z_NEW_TITLE, confidence: 0.88 };
    }
    return copy;
  });
  const read = (value: string | null) => ({ value, confidence: 0.93 });
  shifted.push({
    index: shifted.length,
    media_kind: 'cd',
    bbox: [40, 500, 700, 580],
    text_orientation: 'horizontal',
    legibility: 'clear',
    raw_text: read(V_TEXT),
    artist: read('Marlow Reed'),
    title: read('Salt and Ember'),
    format: read('CD'),
    label: read(null),
    catalog_number: read('TR-299'),
  });
  return {
    ...base,
    spine_count_estimate: shifted.length,
    spines: shifted.map((s, i) => ({ ...s, index: i })),
  };
}

type Run1Snapshot = {
  detections: string;
  rawSha: string;
  crops: Map<string, string>;
};

/** Run 1's detection rows, raw.json and crop bytes, to prove D-13. */
export function snapshotRun1(ctx: Ctx, photoId: string): Run1Snapshot {
  return withDb(ctx, (db) => {
    const run = db
      .prepare(
        'SELECT id, raw_path FROM vision_runs WHERE photo_id = ? AND run_no = 1',
      )
      .get(photoId) as { id: string; raw_path: string };
    const rows = db
      .prepare('SELECT * FROM spine_detections WHERE run_id = ? ORDER BY id')
      .all(run.id) as { crop_path: string | null }[];
    const crops = new Map<string, string>();
    for (const r of rows) {
      if (!r.crop_path) continue;
      crops.set(
        r.crop_path,
        sha256(fs.readFileSync(path.join(ctx.dataDir, r.crop_path))),
      );
    }
    return {
      detections: JSON.stringify(rows),
      rawSha: sha256(fs.readFileSync(path.join(ctx.dataDir, run.raw_path))),
      crops,
    };
  });
}

// (c) refusals: text/plain 415 and an unknown photo 404, nothing queued.
export async function stepRefusals(ctx: Ctx, photoId: string): Promise<void> {
  step('(c) re-scan refuses text/plain (415) and an unknown photo (404)');
  const plain = await postRescan(ctx, photoId, 'text/plain');
  assert(plain.status === 415, `text/plain returned ${plain.status}`);
  const missing = await postRescan(ctx, 'no-such-photo');
  assert(
    missing.status === 404 && missing.body.error === 'not_found',
    `unknown photo returned ${missing.status} ${JSON.stringify(missing.body)}`,
  );
  const runs = withDb(
    ctx,
    (db) =>
      (
        db
          .prepare('SELECT COUNT(*) AS n FROM vision_runs WHERE photo_id = ?')
          .get(photoId) as { n: number }
      ).n,
  );
  assert(runs === 1, `${runs} runs after refused re-scans, expected 1`);
  check('415 and 404; still one run');
}

// (d) rewrite the fixture, re-scan (201) and at once again (409).
export async function stepRescan(ctx: Ctx, photoId: string): Promise<void> {
  step('(d) POST rescan: 201, then 409 while the run is active');
  fs.writeFileSync(ctx.fixture, JSON.stringify(secondRead()));
  const first = await postRescan(ctx, photoId);
  assert(
    first.status === 201 && first.body.runNo === 2,
    `rescan returned ${first.status} ${JSON.stringify(first.body)}`,
  );
  const second = await postRescan(ctx, photoId);
  assert(
    second.status === 409 && second.body.error === 'run_active',
    `second rescan returned ${second.status} ${JSON.stringify(second.body)}`,
  );
  withDb(ctx, (db) => {
    const job = db
      .prepare(
        "SELECT max_attempts, dedupe_key FROM jobs WHERE type = 'scan_photo' AND dedupe_key = ?",
      )
      .get(`scan:${photoId}:2`) as
      | { max_attempts: number; dedupe_key: string }
      | undefined;
    assert(job, `no scan_photo job with dedupe key scan:${photoId}:2`);
    assert(job.max_attempts === 1, `max_attempts ${job.max_attempts}`);
  });
  await waitRunDone(ctx, photoId, 2);
  check('201 run 2 (max_attempts 1, scan:ID:2), 409 run_active, run 2 done');
}

// (e) the merge: ids and edits kept, states per D-15/D-16, V added.
export async function stepMerged(
  ctx: Ctx,
  photoId: string,
  before: SpineApi[],
): Promise<SpineApi> {
  step('(e) GET /api/spines shows the merged spines');
  const listed = await getSpines(ctx, photoId);
  const after = listed.filter((s) => s.state === 'active');
  const byId = new Map(after.map((s) => [s.id, s]));
  const old = (i: number) => before[i];

  const x = byId.get(old(ROLES.X).id);
  assert(x, 'X lost its spine id');
  const xTitle = field(x, 'title');
  assert(xTitle.value === X_OWNER_TITLE, `X title value ${xTitle.value}`);
  assert(xTitle.aiValue === X_NEW_TITLE, `X title aiValue ${xTitle.aiValue}`);
  assert(
    xTitle.editBaseAiValue === TRACER.spines[ROLES.X].title,
    `X editBaseAiValue ${xTitle.editBaseAiValue}`,
  );
  assert(xTitle.confidence === 0.9, `X confidence ${xTitle.confidence}`);

  const z = byId.get(old(ROLES.Z).id);
  assert(z, 'Z lost its spine id');
  const zTitle = field(z, 'title');
  assert(
    zTitle.value === Z_NEW_TITLE && zTitle.aiValue === Z_NEW_TITLE,
    `Z title ${JSON.stringify(zTitle)}`,
  );

  for (const i of [0, 2]) {
    assert(byId.has(old(i).id), `spine ${i} (duplicate read) lost its id`);
  }
  assert(!listed.some((s) => s.id === old(ROLES.W).id), 'W is still listed');
  assert(!byId.has(old(ROLES.Y).id), 'Y is still listed as active');
  // D-16: the orphan is listed after the active spines, edits kept.
  const y = listed.at(-1);
  assert(
    y?.id === old(ROLES.Y).id && y.state === 'orphaned',
    `last listed spine is ${y?.id} (${y?.state}), expected orphaned Y`,
  );
  assert(
    field(y, 'artist').value === Y_OWNER_ARTIST,
    `orphaned Y artist ${field(y, 'artist').value}`,
  );

  const oldIds = new Set(before.map((s) => s.id));
  const fresh = after.filter((s) => !oldIds.has(s.id));
  assert(fresh.length === 1, `${fresh.length} new spines, expected 1`);
  assert(
    field(fresh[0], 'raw_text').value === V_TEXT,
    `new spine reads ${field(fresh[0], 'raw_text').value}`,
  );
  assert(after.length === 5, `${after.length} active spines, expected 5`);
  check(
    'X kept the edit with the new read beside it; Z, 0, 2 kept; V new; Y listed as orphaned',
  );
  return fresh[0];
}

// (f) D-16 states in app.db and D-13: run 1 is untouched.
export function stepStatesAndHistory(
  ctx: Ctx,
  photoId: string,
  before: SpineApi[],
  snapshot: Run1Snapshot,
): void {
  step('(f) W superseded, Y orphaned, run 1 rows and files unchanged');
  withDb(ctx, (db) => {
    const state = (id: string) =>
      (
        db.prepare('SELECT state FROM spines WHERE id = ?').get(id) as {
          state: string;
        }
      ).state;
    const w = state(before[ROLES.W].id);
    const y = state(before[ROLES.Y].id);
    assert(w === 'superseded', `W is ${w}, expected superseded`);
    assert(y === 'orphaned', `Y is ${y}, expected orphaned`);
    const yArtist = db
      .prepare(
        "SELECT value FROM spine_fields WHERE spine_id = ? AND field = 'artist'",
      )
      .get(before[ROLES.Y].id) as { value: string };
    assert(yArtist.value === Y_OWNER_ARTIST, `Y artist ${yArtist.value}`);
    const yDetection = db
      .prepare(
        `SELECT r.run_no FROM spines s
         JOIN spine_detections d ON d.id = s.current_detection_id
         JOIN vision_runs r ON r.id = d.run_id WHERE s.id = ?`,
      )
      .get(before[ROLES.Y].id) as { run_no: number };
    assert(yDetection.run_no === 1, 'Y no longer points at its run 1 crop');
    const runs = db
      .prepare(
        'SELECT run_no, status FROM vision_runs WHERE photo_id = ? ORDER BY run_no',
      )
      .all(photoId) as { run_no: number; status: string }[];
    assert(
      runs.map((r) => `${r.run_no}:${r.status}`).join(',') === '1:done,2:done',
      `runs ${JSON.stringify(runs)}`,
    );
  });
  const now = snapshotRun1(ctx, photoId);
  assert(
    now.detections === snapshot.detections,
    'run 1 spine_detections rows changed',
  );
  assert(now.rawSha === snapshot.rawSha, 'run 1 raw.json changed');
  for (const [crop, sha] of snapshot.crops) {
    assert(now.crops.get(crop) === sha, `run 1 crop ${crop} changed`);
  }
  check(
    `superseded, orphaned (edit and run 1 crop kept); ${snapshot.crops.size} run 1 crops unchanged`,
  );
}

// (g) the section header offers Re-scan on /spines.
export async function stepSpinesPage(ctx: Ctx): Promise<void> {
  step('(g) GET /spines renders the Re-scan trigger');
  const res = await fetch(`${ctx.baseUrl}/spines`);
  assert(res.status === 200, `GET /spines returned ${res.status}`);
  const html = await res.text();
  assert(html.includes('Re-scan photo'), '/spines lacks "Re-scan photo"');
  assert(
    html.includes(`aria-label="Re-scan ${FILENAME}"`),
    '/spines lacks the icon-only Re-scan aria-label',
  );
  assert(
    html.includes('No longer detected (1)'),
    '/spines lacks the "No longer detected (1)" sub-heading',
  );
  assert(html.includes('Re-attach spine…'), '/spines lacks "Re-attach spine…"');
  check(
    'Re-scan photo, its icon-only aria-label and the orphan section are rendered',
  );
}

export async function postJson(
  ctx: Ctx,
  url: string,
  body: unknown,
  contentType = 'application/json',
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${ctx.baseUrl}${url}`, {
    method: 'POST',
    headers: { origin: ctx.origin, 'content-type': contentType },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: { raw: text } };
  }
}

// (i) D-16 re-attach: the orphan Y takes over the new spine V.
export async function stepReattach(
  ctx: Ctx,
  photoId: string,
  before: SpineApi[],
  v: SpineApi,
): Promise<void> {
  step('(i) re-attach orphaned Y to the new spine V');
  const yId = before[ROLES.Y].id;
  const list = await fetch(`${ctx.baseUrl}/api/spines/${yId}/reattach`);
  assert(list.status === 200, `GET reattach returned ${list.status}`);
  const { candidates } = (await list.json()) as { candidates: SpineApi[] };
  assert(
    candidates.map((c) => c.id).join(',') === v.id,
    `candidates ${candidates.map((c) => c.id).join(',')}, expected only V ${v.id}`,
  );
  const missing = await fetch(`${ctx.baseUrl}/api/spines/no-such/reattach`);
  assert(missing.status === 404, `GET unknown reattach ${missing.status}`);
  const plain = await postJson(
    ctx,
    `/api/spines/${yId}/reattach`,
    { targetSpineId: v.id },
    'text/plain',
  );
  assert(plain.status === 415, `text/plain reattach returned ${plain.status}`);

  const ok = await postJson(ctx, `/api/spines/${yId}/reattach`, {
    targetSpineId: v.id,
  });
  assert(
    ok.status === 200 && ok.body.id === yId && ok.body.state === 'active',
    `reattach returned ${ok.status} ${JSON.stringify(ok.body)}`,
  );

  const listed = await getSpines(ctx, photoId);
  const y = listed.find((s) => s.id === yId);
  assert(y && y.state === 'active', `Y is ${y?.state}, expected active`);
  const artist = field(y, 'artist');
  assert(artist.value === Y_OWNER_ARTIST, `Y artist ${artist.value}`);
  assert(
    artist.aiValue === 'Marlow Reed',
    `Y artist aiValue ${artist.aiValue}`,
  );
  assert(
    field(y, 'raw_text').value === V_TEXT,
    `Y unedited raw_text ${field(y, 'raw_text').value}`,
  );
  assert(
    y.crop !== null && y.crop.url === v.crop?.url,
    `Y crop ${y.crop?.url}, expected V's ${v.crop?.url}`,
  );
  assert(!listed.some((s) => s.id === v.id), 'V is still listed');
  assert(
    !listed.some((s) => s.state === 'orphaned'),
    'an orphan is still listed',
  );
  withDb(ctx, (db) => {
    const row = db
      .prepare('SELECT state FROM spines WHERE id = ?')
      .get(v.id) as {
      state: string;
    };
    assert(
      row.state === 'superseded',
      `V is ${row.state}, expected superseded`,
    );
  });

  const again = await postJson(ctx, `/api/spines/${yId}/reattach`, {
    targetSpineId: v.id,
  });
  assert(
    again.status === 409 && again.body.error === 'conflict',
    `second reattach returned ${again.status} ${JSON.stringify(again.body)}`,
  );
  check("Y active with its edit and V's crop; V superseded; 409 on repeat");
}

// (h) one call per run: exactly two -p invocations.
export function stepTwoCalls(ctx: Ctx): void {
  step('(h) the fake CLI saw exactly two -p calls');
  const n = visionCalls(ctx);
  assert(n === 2, `${n} -p invocations, expected 2`);
  check('two calls for two runs; the refused requests made none');
}

runMain('verify-rescan', async (onCleanup) => {
  const tmp = await makeTempDir('verify-rescan');
  onCleanup(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const dataDir = path.join(tmp, 'data');
  const port = await getFreePort();

  step('build');
  await buildApp();

  const fixture = path.join(tmp, 'vision-fixture.json');
  fs.writeFileSync(fixture, JSON.stringify(structuredOutputFor(TRACER)));
  const claudeLog = path.join(tmp, 'fake-claude.jsonl');

  step(`next start on 127.0.0.1:${port}`);
  const server: ServerHandle = await startServer({
    mode: 'start',
    port,
    env: {
      DATA_DIR: dataDir,
      APP_TEST_HOOKS: '',
      CLAUDE_BIN: FAKE_CLAUDE,
      FAKE_CLAUDE_MODE: 'vision',
      FAKE_CLAUDE_VISION_FIXTURE: fixture,
      FAKE_CLAUDE_LOG: claudeLog,
    },
  });
  onCleanup(async () => {
    await server.stop('SIGKILL');
  });
  const ctx: Ctx = {
    baseUrl: server.baseUrl,
    origin: `http://127.0.0.1:${port}`,
    dataDir,
    fixture,
    claudeLog,
  };

  const { photoId, spines } = await stepFirstScan(ctx);
  await stepEdits(ctx, spines);
  const snapshot = snapshotRun1(ctx, photoId);
  await stepRefusals(ctx, photoId);
  await stepRescan(ctx, photoId);
  const v = await stepMerged(ctx, photoId, spines);
  stepStatesAndHistory(ctx, photoId, spines, snapshot);
  await stepSpinesPage(ctx);
  await stepReattach(ctx, photoId, spines, v);
  stepTwoCalls(ctx);

  step('stop');
  await server.stop('SIGTERM');
});
