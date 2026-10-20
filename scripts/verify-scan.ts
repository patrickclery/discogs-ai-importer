// Shelf-scan ingest proof (Plan 02-03): schema on the live DB, upload,
// concurrent and repeat dedup, the queued one-shot run and job, the photo list,
// a >10 MB upload through the proxy, and refused non-photo uploads.
// Run: node scripts/verify-scan.ts   (VERIFY_SKIP_BUILD=1 reuses .next)
// Each step is a named function so later plans (02-04, 02-06, 02-08, 02-09)
// can extend this script.
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import { assert, check, step } from './lib/jobs.ts';
import {
  buildApp,
  getFreePort,
  makeTempDir,
  runMain,
  type ServerHandle,
  startServer,
} from './lib/server.ts';

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

export async function stepStart(dataDir: string, port: number) {
  step(`next start on 127.0.0.1:${port}`);
  return startServer({
    mode: 'start',
    port,
    env: {
      DATA_DIR: dataDir,
      APP_TEST_HOOKS: '',
      // No real CLI: nothing in this script may reach Claude.
      CLAUDE_BIN: '/nonexistent/dai-claude-cli',
    },
  });
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

// (d) the photo list shows the queued photo.
export async function stepListQueued(ctx: Ctx, photoId: string) {
  step('(d) GET /api/photos lists the photo as queued');
  const res = await fetch(`${ctx.baseUrl}/api/photos`);
  assert(res.status === 200, `GET /api/photos returned ${res.status}`);
  const { photos } = (await res.json()) as {
    photos: { id: string; status: string; runNo: number; filename: string }[];
  };
  const photo = photos.find((p) => p.id === photoId);
  assert(photo, `photo ${photoId} missing from GET /api/photos`);
  assert(photo.status === 'queued', `status ${photo.status}, expected queued`);
  assert(photo.runNo === 1, `runNo ${photo.runNo}, expected 1`);
  assert(photo.filename === 'shelf.jpg', `filename ${photo.filename}`);
  check('listed with status queued');
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

  const server: ServerHandle = await stepStart(dataDir, port);
  onCleanup(async () => {
    await server.stop('SIGKILL');
  });
  const ctx: Ctx = {
    port,
    dataDir,
    baseUrl: server.baseUrl,
    origin: `http://127.0.0.1:${port}`,
  };

  stepSchema(ctx);
  const jpeg = new Uint8Array(await renderJpeg(800, 600));
  const photoId = await stepConcurrentUpload(ctx, jpeg);
  stepQueuedRows(ctx, photoId, jpeg);
  await stepListQueued(ctx, photoId);
  await stepRepeatDuplicate(ctx, photoId, jpeg);
  await stepLargeUpload(ctx);
  await stepRefuseTextPlain(ctx);
  await stepRefuseNonImage(ctx);

  step('stop');
  await server.stop('SIGTERM');
});
