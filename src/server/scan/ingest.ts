import 'server-only';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PROMPT_VERSION, SCHEMA_VERSION } from '@/lib/vision-contract';
import { getDb } from '../db/client';
import { newId } from '../ids';
import { extensionFor, mimeFor } from '../images/detect';
import type { ImageKind } from '../images/normalize';
import { enqueue } from '../jobs/queue';
import { resolveData } from '../storage/paths';

// Upload ingest (RESEARCH Pattern 2, INGEST-01, INGEST-03). The photo, its
// first run and its one-shot scan job are created in one transaction, so a
// photo is either fully queued or absent. An identical upload creates nothing.

const MAX_FILENAME_CHARS = 255;

// C0/C1 controls and bidi overrides/isolates, which can disguise a name.
const CONTROL_CHARS = /[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu;
const PATH_SEPARATORS = /[/\\]/g;

/**
 * Display-only file name (T-02-08): decoded, controls and path separators
 * stripped, trimmed, capped at 255 characters. Never used as a path.
 */
export function sanitizeFilename(
  raw: string | null | undefined,
  kind: ImageKind,
): string {
  let name = raw ?? '';
  try {
    name = decodeURIComponent(name);
  } catch {
    // Not percent-encoded: keep the header text as is.
  }
  name = name.replace(CONTROL_CHARS, '').replace(PATH_SEPARATORS, '').trim();
  name = Array.from(name).slice(0, MAX_FILENAME_CHARS).join('').trim();
  return name || `photo.${extensionFor(kind)}`;
}

export function originalPathFor(sha256: string, kind: ImageKind): string {
  return path.posix.join(
    'photos',
    sha256.slice(0, 2),
    `${sha256}.${extensionFor(kind)}`,
  );
}

/** Content-addressed write: temp file then rename; skipped when present. */
async function writeOriginal(rel: string, bytes: Uint8Array): Promise<void> {
  const abs = resolveData(rel);
  try {
    await fs.access(abs);
    return;
  } catch {
    // Not stored yet.
  }
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.${newId()}.tmp`;
  try {
    await fs.writeFile(tmp, bytes, { flag: 'wx' });
    await fs.rename(tmp, abs);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

function findBySha(sha256: string): string | undefined {
  const row = getDb()
    .$client.prepare('SELECT id FROM photos WHERE sha256 = ?')
    .get(sha256) as { id: string } | undefined;
  return row?.id;
}

export async function ingestUpload(input: {
  bytes: Uint8Array;
  kind: ImageKind;
  filename?: string | null;
}): Promise<{ photoId: string; duplicate: boolean }> {
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const existing = findBySha(sha256);
  if (existing) return { photoId: existing, duplicate: true };

  const originalPath = originalPathFor(sha256, input.kind);
  // Before the transaction commits, so a row never exists without its file.
  await writeOriginal(originalPath, input.bytes);

  const db = getDb().$client;
  const create = db.transaction((): { photoId: string; duplicate: boolean } => {
    const now = Date.now();
    const photoId = newId();
    const inserted = db
      .prepare(
        `INSERT INTO photos (id, sha256, original_name, mime, bytes, original_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(sha256) DO NOTHING`,
      )
      .run(
        photoId,
        sha256,
        sanitizeFilename(input.filename, input.kind),
        mimeFor(input.kind),
        input.bytes.byteLength,
        originalPath,
        now,
        now,
      );
    if (inserted.changes === 0) {
      // A concurrent identical upload won the insert.
      const twin = findBySha(sha256);
      if (!twin) throw new Error('ingest: photo insert ignored but no row');
      return { photoId: twin, duplicate: true };
    }

    const runNo = 1;
    const runId = newId();
    db.prepare(
      `INSERT INTO vision_runs (id, photo_id, run_no, status, prompt_version, schema_version, created_at, updated_at)
       VALUES (?, ?, ?, 'queued', ?, ?, ?, ?)`,
    ).run(runId, photoId, runNo, PROMPT_VERSION, SCHEMA_VERSION, now, now);

    // One paid call per run: never retried, and boot recovery fails it
    // instead of requeueing (RESEARCH Pitfall 3, D-17).
    const job = enqueue({
      lane: 'anthropic',
      type: 'scan_photo',
      payload: { photoId, runId },
      dedupeKey: `scan:${photoId}:${runNo}`,
      maxAttempts: 1,
    });
    db.prepare('UPDATE vision_runs SET job_id = ? WHERE id = ?').run(
      job.id,
      runId,
    );
    db.prepare('UPDATE photos SET latest_run_id = ? WHERE id = ?').run(
      runId,
      photoId,
    );
    return { photoId, duplicate: false };
  });
  return create.immediate();
}
