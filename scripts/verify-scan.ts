// Shelf-scan proof. Plan 02-03: schema on the live DB, upload, concurrent and
// repeat dedup, the queued one-shot run and job, the photo list, a >10 MB
// upload through the proxy, and refused non-photo uploads. Plan 02-04: the
// scan job against the fake CLI (one recorded call, raw output first, crops,
// the file-route allowlist and the spines page). Plan 02-06: the /upload
// Photos list server-renders the done photo with its View spines link.
// Plan 02-08: GET /api/spines order, crops and the ?photo= filter.
// Run: node scripts/verify-scan.ts   (VERIFY_SKIP_BUILD=1 reuses .next)
// Each step is a named function so later plans (02-04, 02-06, 02-08, 02-09)
// can extend this script.
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import sharp from 'sharp';
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

const SCAN_TABLES = [
  'photos',
  'vision_runs',
  'spine_detections',
  'spines',
  'spine_fields',
];

export type Ctx = {
  port: number;
  dataDir: string;
  baseUrl: string;
  origin: string;
  /** The fake CLI's invocation log (FAKE_CLAUDE_LOG). */
  claudeLog: string;
};

type Upload = { status: number; body: Record<string, unknown> };

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Raw-body upload; global fetch because httpRequest is string-only. */
export async function upload(
  ctx: Ctx,
  bytes: Uint8Array,
  opts: { contentType?: string; filename?: string } = {},
): Promise<Upload> {
  const res = await fetch(`${ctx.baseUrl}/api/photos`, {
    method: 'POST',
    headers: {
      origin: ctx.origin,
      'content-type': opts.contentType ?? 'image/jpeg',
      'x-filename': encodeURIComponent(opts.filename ?? 'shelf.jpg'),
    },
    body: new Blob([bytes as Uint8Array<ArrayBuffer>]),
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

export function countRows(ctx: Ctx, table: string): number {
  return withDb(
    ctx,
    (db) =>
      (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number })
        .n,
  );
}

export function storedFile(ctx: Ctx, sha: string, ext: string): string {
  return path.join(ctx.dataDir, 'photos', sha.slice(0, 2), `${sha}.${ext}`);
}

export async function renderJpeg(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 3, background: '#8a5a2b' },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${width}" height="${height}"><rect x="40" y="40" width="${width - 80}" height="60" fill="#f4e4c1"/></svg>`,
        ),
      },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}

/** The server env with the fake CLI in vision mode (never the live CLI). */
export function fakeVisionEnv(
  tmp: string,
  layout: typeof TRACER = TRACER,
): Record<string, string> {
  const fixture = path.join(tmp, `vision-${layout.name}.json`);
  fs.writeFileSync(fixture, JSON.stringify(structuredOutputFor(layout)));
  return {
    CLAUDE_BIN: FAKE_CLAUDE,
    FAKE_CLAUDE_MODE: 'vision',
    FAKE_CLAUDE_VISION_FIXTURE: fixture,
    FAKE_CLAUDE_LOG: path.join(tmp, 'fake-claude.jsonl'),
  };
}

export async function stepStart(
  dataDir: string,
  port: number,
  claudeEnv: Record<string, string> = {
    // No CLI at all, for steps that must never reach Claude.
    CLAUDE_BIN: '/nonexistent/dai-claude-cli',
  },
) {
  step(`next start on 127.0.0.1:${port}`);
  return startServer({
    mode: 'start',
    port,
    env: { DATA_DIR: dataDir, APP_TEST_HOOKS: '', ...claudeEnv },
  });
}

/** -p invocations recorded by the fake CLI (auth and version probes excluded). */
export function visionCalls(ctx: Ctx): { argv: string[] }[] {
  if (!fs.existsSync(ctx.claudeLog)) return [];
  return fs
    .readFileSync(ctx.claudeLog, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { argv: string[] })
    .filter((e) => e.argv[0] === '-p');
}

// (a) boot applied every migration to the live app.db.
export function stepSchema(ctx: Ctx): void {
  step('(a) live app.db has the scan tables and every migration');
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
    for (const t of SCAN_TABLES) {
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
  check(`${SCAN_TABLES.length} scan tables, ${sqlFiles} migrations applied`);
}

// (b) two concurrent identical uploads: one 201, one 200, same photo.
export async function stepConcurrentUpload(
  ctx: Ctx,
  bytes: Uint8Array,
): Promise<string> {
  step('(b) two concurrent POSTs of the same JPEG');
  const results = await Promise.all([upload(ctx, bytes), upload(ctx, bytes)]);
  const statuses = results.map((r) => r.status).sort();
  assert(
    statuses.join(',') === '200,201',
    `statuses ${statuses.join(',')}, expected 200,201: ${JSON.stringify(results.map((r) => r.body))}`,
  );
  const created = results.find((r) => r.status === 201);
  const dup = results.find((r) => r.status === 200);
  assert(created && dup, 'missing 201 or 200 result');
  assert(created.body.duplicate === false, '201 body duplicate is not false');
  assert(dup.body.duplicate === true, '200 body duplicate is not true');
  const photoId = created.body.photoId;
  assert(typeof photoId === 'string' && photoId.length > 0, 'no photoId');
  assert(
    dup.body.photoId === photoId,
    `duplicate photoId ${String(dup.body.photoId)} differs from ${photoId}`,
  );
  check(`one 201 and one 200 for photo ${photoId}`);
  return photoId;
}

// (c) exactly one photo, run and one-shot job; the stored file is exact.
export function stepQueuedRows(
  ctx: Ctx,
  photoId: string,
  bytes: Uint8Array,
): void {
  step('(c) one photos row, one queued run, one scan_photo job');
  withDb(ctx, (db) => {
    const photos = db.prepare('SELECT * FROM photos').all() as {
      id: string;
      sha256: string;
      original_path: string;
      latest_run_id: string | null;
      original_name: string;
    }[];
    assert(photos.length === 1, `${photos.length} photos rows, expected 1`);
    const [photo] = photos;
    assert(photo.id === photoId, 'photos row id differs from the photoId');
    assert(photo.original_name === 'shelf.jpg', 'original_name not kept');
    const runs = db.prepare('SELECT * FROM vision_runs').all() as {
      id: string;
      photo_id: string;
      run_no: number;
      status: string;
      job_id: string | null;
    }[];
    assert(runs.length === 1, `${runs.length} vision_runs rows, expected 1`);
    const [run] = runs;
    assert(run.photo_id === photoId && run.run_no === 1, 'run is not run 1');
    assert(photo.latest_run_id === run.id, 'latest_run_id is not the run');
    const jobs = db
      .prepare("SELECT * FROM jobs WHERE type = 'scan_photo'")
      .all() as {
      id: string;
      max_attempts: number;
      dedupe_key: string;
      payload: string;
    }[];
    assert(jobs.length === 1, `${jobs.length} scan_photo jobs, expected 1`);
    const [job] = jobs;
    assert(job.max_attempts === 1, `max_attempts ${job.max_attempts}`);
    assert(
      job.dedupe_key === `scan:${photoId}:1`,
      `dedupe_key ${job.dedupe_key}`,
    );
    assert(run.job_id === job.id, 'run.job_id is not the job id');
    const payload = JSON.parse(job.payload) as Record<string, unknown>;
    assert(
      payload.photoId === photoId && payload.runId === run.id,
      `job payload ${job.payload}`,
    );
    const sha = sha256(bytes);
    assert(photo.sha256 === sha, 'photos.sha256 differs from the source');
    const file = storedFile(ctx, sha, 'jpg');
    assert(
      photo.original_path === path.relative(ctx.dataDir, file),
      `original_path ${photo.original_path}`,
    );
    assert(fs.existsSync(file), `stored file missing: ${file}`);
    assert(
      sha256(fs.readFileSync(file)) === sha,
      'stored file sha256 differs from the source',
    );
  });
  check('photo, run 1 and job (max_attempts 1, scan:ID:1) stored once');
}

// (d) the photo list shows the photo. The worker may already have claimed
// it, so any run status counts; (i) waits for done.
export async function stepListQueued(ctx: Ctx, photoId: string) {
  step('(d) GET /api/photos lists the photo on run 1');
  const res = await fetch(`${ctx.baseUrl}/api/photos`);
  assert(res.status === 200, `GET /api/photos returned ${res.status}`);
  const { photos } = (await res.json()) as {
    photos: { id: string; status: string; runNo: number; filename: string }[];
  };
  const photo = photos.find((p) => p.id === photoId);
  assert(photo, `photo ${photoId} missing from GET /api/photos`);
  assert(
    ['queued', 'preparing', 'calling', 'parsing', 'done'].includes(
      photo.status,
    ),
    `status ${photo.status}, expected queued or later`,
  );
  assert(photo.runNo === 1, `runNo ${photo.runNo}, expected 1`);
  assert(photo.filename === 'shelf.jpg', `filename ${photo.filename}`);
  check(`listed on run 1 (${photo.status})`);
}

// (e) a repeat upload of identical bytes is free (INGEST-03).
export async function stepRepeatDuplicate(
  ctx: Ctx,
  photoId: string,
  bytes: Uint8Array,
) {
  step('(e) re-upload of the same bytes');
  const res = await upload(ctx, bytes);
  assert(res.status === 200, `status ${res.status}, expected 200`);
  assert(
    res.body.duplicate === true && res.body.photoId === photoId,
    `body ${JSON.stringify(res.body)}`,
  );
  const jobs = withDb(
    ctx,
    (db) =>
      (
        db
          .prepare("SELECT COUNT(*) AS n FROM jobs WHERE type = 'scan_photo'")
          .get() as { n: number }
      ).n,
  );
  assert(jobs === 1, `${jobs} scan_photo jobs after re-upload, expected 1`);
  assert(countRows(ctx, 'vision_runs') === 1, 'a second run was created');
  check('200 duplicate, still one job and one run');
}

// (i) the scan job finishes with every CD spine, duplicates kept apart.
export async function stepScanDone(ctx: Ctx, photoId: string): Promise<void> {
  step('(i) GET /api/photos reaches done with every CD spine');
  const expected = TRACER.spines.length;
  const photo = await waitFor(
    'photo done',
    async () => {
      const res = await fetch(`${ctx.baseUrl}/api/photos`);
      const { photos } = (await res.json()) as {
        photos: {
          id: string;
          status: string;
          spineCount: number;
          errorReason: string | null;
        }[];
      };
      const p = photos.find((x) => x.id === photoId);
      if (p?.status === 'error') {
        throw new Error(`scan failed: ${p.errorReason}`);
      }
      return p?.status === 'done' ? p : undefined;
    },
    { timeoutMs: 60_000, intervalMs: 250 },
  );
  assert(
    photo.spineCount === expected,
    `spineCount ${photo.spineCount}, expected ${expected}`,
  );
  const raws = withDb(ctx, (db) =>
    (
      db
        .prepare(
          "SELECT f.value FROM spine_fields f JOIN spines s ON s.id = f.spine_id WHERE s.photo_id = ? AND f.field = 'raw_text'",
        )
        .all(photoId) as { value: string }[]
    ).map((r) => r.value),
  );
  assert(raws.length === expected, `${raws.length} raw_text rows`);
  assert(
    new Set(raws).size === expected - 1,
    `${new Set(raws).size} distinct raw texts, expected ${expected - 1} (two spines share one)`,
  );
  check(`done with ${expected} spines; the two identical reads stay separate`);
}

// (i2) /upload server-renders the done photo with its View spines link.
export async function stepUploadPage(ctx: Ctx, photoId: string) {
  step('(i2) GET /upload lists the done photo with View spines');
  const res = await fetch(`${ctx.baseUrl}/upload`);
  assert(res.status === 200, `GET /upload returned ${res.status}`);
  const html = await res.text();
  assert(html.includes('shelf.jpg'), '/upload lacks the file name shelf.jpg');
  assert(html.includes('View spines'), '/upload lacks "View spines"');
  const href = `href="/spines?photo=${photoId}"`;
  assert(html.includes(href), `/upload lacks ${href}`);
  check(`shelf.jpg row links to /spines?photo=${photoId}`);
}

type RunRecord = {
  id: string;
  model: string | null;
  effort: string | null;
  spawned_at: number | null;
  raw_path: string | null;
  vision_path: string | null;
  vision_w: number | null;
  vision_h: number | null;
};

// (j) the run is a recorded call with its raw answer and the sent image.
export async function stepRunRecorded(ctx: Ctx, photoId: string) {
  step('(j) vision_runs row, raw.json and image.jpg on disk');
  const run = withDb(
    ctx,
    (db) =>
      db
        .prepare('SELECT * FROM vision_runs WHERE photo_id = ? AND run_no = 1')
        .get(photoId) as RunRecord | undefined,
  );
  assert(run, 'no vision_runs row');
  assert(run.model === 'claude-opus-5-5', `model ${run.model}`);
  assert(run.effort === 'high', `effort ${run.effort}`);
  assert(typeof run.spawned_at === 'number', 'spawned_at not set');
  assert(
    run.raw_path === `vision/${photoId}/run-1/raw.json`,
    `raw_path ${run.raw_path}`,
  );
  const raw = JSON.parse(
    fs.readFileSync(path.join(ctx.dataDir, run.raw_path), 'utf8'),
  ) as { runId: string; run: { stdout: string } };
  assert(raw.runId === run.id, 'raw.json runId differs');
  const envelope = JSON.parse(raw.run.stdout) as {
    structured_output?: unknown;
  };
  assert(envelope.structured_output, 'raw stdout has no structured_output');
  assert(
    run.vision_path === `vision/${photoId}/run-1/image.jpg`,
    `vision_path ${run.vision_path}`,
  );
  const meta = await sharp(path.join(ctx.dataDir, run.vision_path)).metadata();
  assert(
    meta.width === run.vision_w && meta.height === run.vision_h,
    `image.jpg ${meta.width}x${meta.height}, run says ${run.vision_w}x${run.vision_h}`,
  );
  check(
    `model, effort, spawned_at, raw.json and a ${meta.width}x${meta.height} image.jpg`,
  );
}

// (k) the spines page lists every artist with its crop.
export async function stepSpinesPage(
  ctx: Ctx,
  photoId: string,
): Promise<string> {
  step('(k) GET /spines shows every artist and crop');
  const res = await fetch(`${ctx.baseUrl}/spines`);
  assert(res.status === 200, `GET /spines returned ${res.status}`);
  const html = await res.text();
  for (const s of TRACER.spines) {
    assert(html.includes(s.artist), `artist ${s.artist} missing from /spines`);
  }
  const prefix = `/api/files/crops/${photoId}/`;
  const srcs = [...html.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
  const crops = srcs.filter((src) => src.startsWith(prefix));
  assert(
    crops.length === TRACER.spines.length,
    `${crops.length} crop images on /spines, expected ${TRACER.spines.length}`,
  );
  check(`${crops.length} crops under ${prefix}`);
  return crops[0];
}

type SpinesApi = {
  photos: { id: string; status: string }[];
  spines: {
    id: string;
    photoId: string;
    index: number;
    crop: { url: string; width: number; height: number } | null;
    fields: { field: string; value: string | null }[];
  }[];
  counts: { all: number; needsReview: number };
};

async function getSpinesApi(ctx: Ctx, qs = ''): Promise<SpinesApi> {
  const res = await fetch(`${ctx.baseUrl}/api/spines${qs}`);
  assert(res.status === 200, `GET /api/spines${qs} returned ${res.status}`);
  return (await res.json()) as SpinesApi;
}

// (k2) Plan 02-08: GET /api/spines returns every CD spine in index order.
export async function stepSpinesApi(ctx: Ctx, photoId: string) {
  step('(k2) GET /api/spines lists every spine in index order with crops');
  const body = await getSpinesApi(ctx);
  const mine = body.spines.filter((s) => s.photoId === photoId);
  assert(
    mine.length === TRACER.spines.length,
    `${mine.length} spines for the photo, expected ${TRACER.spines.length}`,
  );
  assert(
    body.counts.all === body.spines.length,
    `counts.all ${body.counts.all}, ${body.spines.length} spines`,
  );
  mine.forEach((s, i) => {
    assert(s.index === i, `spine ${i} has index ${s.index}`);
    const artist = s.fields.find((f) => f.field === 'artist')?.value;
    assert(
      artist === TRACER.spines[i].artist,
      `spine ${i} artist ${artist}, expected ${TRACER.spines[i].artist}`,
    );
    assert(
      s.crop?.url.startsWith(`/api/files/crops/${photoId}/`) &&
        s.crop.width > s.crop.height,
      `spine ${i} crop ${JSON.stringify(s.crop)}`,
    );
  });
  check(
    `${mine.length} spines, indexes 0..${mine.length - 1}, horizontal crops`,
  );
}

// (o) Plan 02-08: ?photo= narrows the list; an unknown id lists nothing.
export async function stepSpinesPhotoFilter(ctx: Ctx, photoId: string) {
  step('(o) GET /api/spines?photo= lists only that photo');
  const all = await getSpinesApi(ctx);
  assert(all.photos.length >= 2, `${all.photos.length} photos, expected 2+`);
  const one = await getSpinesApi(ctx, `?photo=${photoId}`);
  assert(
    one.photos.length === 1 && one.photos[0].id === photoId,
    `?photo lists ${one.photos.map((p) => p.id).join(',')}`,
  );
  assert(
    one.spines.length === TRACER.spines.length &&
      one.spines.every((s) => s.photoId === photoId),
    `?photo returned ${one.spines.length} spines`,
  );
  const none = await getSpinesApi(ctx, '?photo=no-such-photo');
  assert(
    none.photos.length === 0 && none.spines.length === 0,
    'an unknown ?photo id still lists data',
  );
  check(`1 of ${all.photos.length} photos; unknown id lists nothing`);
}

// (l) a crop is served as a horizontal WebP.
export async function stepServeCrop(ctx: Ctx, url: string): Promise<void> {
  step('(l) one crop through /api/files');
  const res = await fetch(`${ctx.baseUrl}${url}`);
  assert(res.status === 200, `crop returned ${res.status}`);
  assert(
    res.headers.get('content-type') === 'image/webp',
    `content-type ${res.headers.get('content-type')}`,
  );
  assert(
    res.headers.get('x-content-type-options') === 'nosniff',
    'no nosniff header',
  );
  const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
  assert(
    (meta.width ?? 0) > (meta.height ?? 0),
    `crop is ${meta.width}x${meta.height}, expected wider than tall`,
  );
  check(`200 image/webp nosniff, ${meta.width}x${meta.height}`);
}

// (m) originals, raw output and traversal never leave the server.
export async function stepFileAllowlist(
  ctx: Ctx,
  photoId: string,
  bytes: Uint8Array,
): Promise<void> {
  step('(m) /api/files refuses photos/, raw.json and traversal');
  const sha = sha256(bytes);
  const refused = [
    `/api/files/photos/${sha.slice(0, 2)}/${sha}.jpg`,
    `/api/files/vision/${photoId}/run-1/raw.json`,
    '/api/files/crops/..%2F..%2Fapp.db',
    `/api/files/crops/${photoId}/..%2F..%2Fphotos%2F${sha.slice(0, 2)}%2F${sha}.jpg`,
    '/api/files/app.db',
  ];
  for (const url of refused) {
    const res = await fetch(`${ctx.baseUrl}${url}`);
    assert(res.status === 404, `${url} returned ${res.status}, expected 404`);
  }
  const vision = await fetch(
    `${ctx.baseUrl}/api/files/vision/${photoId}/run-1/image.jpg`,
  );
  assert(vision.status === 200, `vision image returned ${vision.status}`);
  assert(
    vision.headers.get('content-type') === 'image/jpeg',
    'vision image is not image/jpeg',
  );
  check(`${refused.length} refused with 404; the vision image is served`);
}

// (n) the duplicate uploads made no call: one -p for the whole photo.
export function stepOneCall(ctx: Ctx): void {
  step('(n) the fake CLI saw exactly one -p call');
  const n = visionCalls(ctx).length;
  assert(n === 1, `${n} -p invocations, expected 1`);
  check('one call for one photo and three identical uploads');
}

// (f) a JPEG over the proxy's default 10 MB buffer arrives byte for byte.
export async function stepLargeUpload(ctx: Ctx): Promise<void> {
  step('(f) noise JPEG between 11 MB and 60 MB');
  let side = 2400;
  let jpeg: Buffer;
  for (;;) {
    const w = side;
    const h = Math.round(side * 0.75);
    jpeg = await sharp(randomBytes(w * h * 3), {
      raw: { width: w, height: h, channels: 3 },
    })
      .jpeg({ quality: 100, chromaSubsampling: '4:4:4' })
      .toBuffer();
    if (jpeg.byteLength > 11 * 1024 * 1024) break;
    side = Math.round(side * 1.25);
  }
  const mb = jpeg.byteLength / (1024 * 1024);
  assert(mb < 60, `noise JPEG is ${mb.toFixed(1)} MB, expected under 60`);
  console.log(`uploading ${mb.toFixed(1)} MB`);
  const bytes = new Uint8Array(jpeg);
  const res = await upload(ctx, bytes, { filename: 'large.jpg' });
  assert(
    res.status === 201,
    `large upload returned ${res.status}: ${JSON.stringify(res.body)}`,
  );
  const sha = sha256(bytes);
  const file = storedFile(ctx, sha, 'jpg');
  assert(fs.existsSync(file), `stored file missing: ${file}`);
  const stored = fs.readFileSync(file);
  assert(
    stored.byteLength === bytes.byteLength && sha256(stored) === sha,
    `stored ${stored.byteLength} bytes, sent ${bytes.byteLength}; sha256 differs`,
  );
  check(`${mb.toFixed(1)} MB upload stored intact (sha256 matches)`);
}

// (g) a no-preflight content type is refused before the body is read.
export async function stepRefuseTextPlain(ctx: Ctx): Promise<void> {
  step('(g) text/plain POST is refused');
  const before = countRows(ctx, 'photos');
  const jpeg = new Uint8Array(await renderJpeg(64, 48));
  for (const contentType of [
    'text/plain',
    'application/x-www-form-urlencoded',
    'multipart/form-data; boundary=x',
  ]) {
    const res = await upload(ctx, jpeg, { contentType });
    assert(
      res.status === 415 && res.body.error === 'unsupported_type',
      `${contentType} returned ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
  assert(countRows(ctx, 'photos') === before, 'a refused upload stored a row');
  check('415 unsupported_type for text, form and multipart; nothing stored');
}

// (h) bytes that are not an image are refused whatever the declared type.
export async function stepRefuseNonImage(ctx: Ctx): Promise<void> {
  step('(h) PDF bytes declared as image/jpeg are refused');
  const before = countRows(ctx, 'photos');
  const pdf = new TextEncoder().encode('%PDF-1.7\n%\u00e2\u00e3\n1 0 obj\n');
  const res = await upload(ctx, pdf, { filename: 'scan.pdf' });
  assert(
    res.status === 415 && res.body.error === 'unsupported_type',
    `PDF returned ${res.status} ${JSON.stringify(res.body)}`,
  );
  assert(countRows(ctx, 'photos') === before, 'the PDF created a photos row');
  const sha = sha256(pdf);
  const stored = fs
    .readdirSync(path.join(ctx.dataDir, 'photos'), { recursive: true })
    .map(String);
  assert(
    !stored.some((f) => f.includes(sha)),
    'the PDF was written under photos/',
  );
  check('415 unsupported_type; no row, no file');
}

runMain('verify-scan', async (onCleanup) => {
  const tmp = await makeTempDir('verify-scan');
  onCleanup(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const dataDir = path.join(tmp, 'data');
  const port = await getFreePort();

  step('build');
  await buildApp();

  const server: ServerHandle = await stepStart(
    dataDir,
    port,
    fakeVisionEnv(tmp),
  );
  onCleanup(async () => {
    await server.stop('SIGKILL');
  });
  const ctx: Ctx = {
    port,
    dataDir,
    baseUrl: server.baseUrl,
    origin: `http://127.0.0.1:${port}`,
    claudeLog: path.join(tmp, 'fake-claude.jsonl'),
  };

  stepSchema(ctx);
  const jpeg = new Uint8Array((await makeSyntheticShelf(TRACER)).jpeg);
  const photoId = await stepConcurrentUpload(ctx, jpeg);
  stepQueuedRows(ctx, photoId, jpeg);
  await stepListQueued(ctx, photoId);
  await stepScanDone(ctx, photoId);
  await stepUploadPage(ctx, photoId);
  await stepRepeatDuplicate(ctx, photoId, jpeg);
  await stepRunRecorded(ctx, photoId);
  const cropUrl = await stepSpinesPage(ctx, photoId);
  await stepSpinesApi(ctx, photoId);
  await stepServeCrop(ctx, cropUrl);
  await stepFileAllowlist(ctx, photoId, jpeg);
  stepOneCall(ctx);
  // After (n): the large upload queues a second scan (and a second call).
  await stepLargeUpload(ctx);
  await stepSpinesPhotoFilter(ctx, photoId);
  await stepRefuseTextPlain(ctx);
  await stepRefuseNonImage(ctx);

  step('stop');
  await server.stop('SIGTERM');
});
