// Shelf-scan helpers shared by verify-scan and the Phase 3 verify scripts.
// Moved out of scripts/verify-scan.ts, which runs its whole check at import
// time (runMain at module top level), so other scripts can import these.
// Node built-ins, better-sqlite3 and sharp only; imports nothing from src/.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import {
  LAYOUTS,
  structuredOutputFor,
} from '../../test/fixtures/vision/synthetic-shelf.mjs';
import { step } from './jobs.ts';
import { startServer, waitFor } from './server.ts';

const FAKE_CLAUDE = path.join(process.cwd(), 'test/fixtures/fake-claude.mjs');
const TRACER = LAYOUTS.tracerShelf;

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

/** Polls GET /api/photos until the photo is done; throws on a scan error. */
export async function waitPhotoDone(
  ctx: Pick<Ctx, 'baseUrl'>,
  photoId: string,
  timeoutMs = 60_000,
): Promise<{ id: string; status: string; spineCount: number }> {
  return waitFor(
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
    { timeoutMs, intervalMs: 250 },
  );
}
