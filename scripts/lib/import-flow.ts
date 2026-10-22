// Shared setup for the Phase 4 import verify scripts (moved unchanged from
// scripts/verify-discogs-import.ts by Plan 04-10). Every helper is
// step-independent: build and start the app on a temp data dir against
// test/fixtures/fake-discogs.mjs and the fake Claude CLI (never a live API,
// never the owner's secrets.json or data/app.db), connect, scan the tracer
// shelf, confirm, and read the imports rows back.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  LAYOUTS,
  makeSyntheticShelf,
} from '../../test/fixtures/vision/synthetic-shelf.mjs';
import {
  connectViaApi,
  discogsEnv,
  type FakeDiscogs,
  type FakeLogEntry,
  type FakeState,
  startFakeDiscogs,
  tempSecretsFile,
} from './discogs.ts';
import { assert, step } from './jobs.ts';
import {
  fakeVisionEnv,
  type Ctx as ScanCtx,
  stepStart as startScanServer,
  upload,
  waitPhotoDone,
  withDb,
} from './scan.ts';
import {
  buildApp,
  getFreePort,
  makeTempDir,
  type ServerHandle,
  waitFor,
} from './server.ts';

/** Build output dir (next.config.ts accepts .next or .next/<name>). */
export const DIST_DIR = process.env.NEXT_DIST_DIR || '.next/verify';
export const TRACER = LAYOUTS.tracerShelf;
/** The fake's default username; no stored error text may contain it. */
export const FAKE_USERNAME = 'fake-owner';

export type ImportInstance = {
  instance_id: number;
  folder_id: number;
  date_added: string;
};

/** What the fake's add POST answers after recording the copy (Plan 04-02). */
export type FakePostMode =
  | 'ok'
  | 'hang-after-commit'
  | '502-after-commit'
  | 'no-instance-201';

/**
 * The fake's state for Phase 4: Phase 3's FakeState plus the collection
 * fields Plan 04-01 added (release id to its copies, and the number of add
 * POSTs that recorded a copy) and Plan 04-02's postMode, postsHeld (add
 * POSTs held open now) and postsByRelease. Phase 4 plans add their
 * fake-state fields here, never to scripts/lib/discogs.ts.
 */
export type ImportFakeState = FakeState & {
  collection: Record<string, ImportInstance[]>;
  posts: number;
  postsByRelease: Record<string, number>;
  postsHeld: number;
  postMode: FakePostMode;
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
