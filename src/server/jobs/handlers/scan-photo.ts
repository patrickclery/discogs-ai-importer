import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import type { PhotoStatus } from '@/lib/scan-types';
import {
  CROP_SOURCE,
  SPINE_MEDIA_KINDS,
  VISION_MAX_EDGE,
  VISION_MAX_TOKENS,
} from '@/lib/vision-contract';
import { getDb } from '../../db/client';
import { newId } from '../../ids';
import { cropSpine, normalizeBox, padBox, scaleBox } from '../../images/crop';
import {
  ImageDecodeError,
  type ImageKind,
  type NormalizedImage,
  normalizeImage,
  type RawImage,
} from '../../images/normalize';
import type { RunResult } from '../../proc/run';
import { rawPathFor } from '../../scan/reconcile';
import {
  markRunError,
  type PreparedDetection,
  persistRunResult,
  setRunStatus,
  updateRunWhile,
} from '../../scan/store';
import { getVisionEffort, getVisionModel } from '../../settings';
import { resolveData } from '../../storage/paths';
import { classifyVisionRun } from '../../vision/parse';
import { runVisionCall } from '../../vision/run';
import type { VisionResult } from '../../vision/schema';
import type { JobContext } from '../types';

// The ledgered single vision call (RESEARCH Pattern 4, VIS-01, VIS-03).
// queued -> preparing (model and effort stamped) -> calling (spawned_at: the
// recorded call) -> parsing (raw.json on disk) -> done | error. The scan job
// has max_attempts 1, and nothing after the spawn throws (Pitfall 3), so a
// run is sent to Claude at most once.

export const ScanPhotoPayload = z.object({
  photoId: z.string().min(1),
  runId: z.string().min(1),
  /**
   * reparse: finish a run whose raw.json is already on disk (enqueued only by
   * reconcileVisionRuns). It never starts the CLI (RESEARCH Pattern 4 step 1).
   */
  mode: z.enum(['scan', 'reparse']).default('scan'),
});
export type ScanPhotoPayload = z.infer<typeof ScanPhotoPayload>;

const IMAGE_KINDS: readonly ImageKind[] = ['jpeg', 'png', 'webp', 'heic'];

type RunRow = {
  id: string;
  run_no: number;
  status: PhotoStatus;
  raw_path: string | null;
  vision_w: number | null;
  vision_h: number | null;
};
type PhotoRow = {
  id: string;
  mime: string;
  original_path: string;
  thumb_path: string | null;
};

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function kindFromMime(mime: string): ImageKind {
  const kind = mime.replace(/^image\//, '') as ImageKind;
  if (!IMAGE_KINDS.includes(kind)) {
    throw new ImageDecodeError('image_unreadable', `unsupported type ${mime}`);
  }
  return kind;
}

/** Temp file next to the target's directory, then rename (atomic). */
async function writeAtomic(
  rel: string,
  bytes: Buffer,
  tmpDirRel: string,
): Promise<void> {
  const abs = resolveData(rel);
  const tmpDir = resolveData(tmpDirRel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.mkdir(tmpDir, { recursive: true });
  const tmp = path.join(tmpDir, `.${newId()}.tmp`);
  try {
    await fs.writeFile(tmp, bytes, { flag: 'wx' });
    await fs.rename(tmp, abs);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

type Prepared = {
  image: NormalizedImage;
  imagePath: string;
};

/** The upright, vision and thumb images of the stored original (no call). */
async function normalizeOriginal(photo: PhotoRow): Promise<NormalizedImage> {
  const original = await fs.readFile(resolveData(photo.original_path));
  return normalizeImage(original, kindFromMime(photo.mime), {
    maxEdge: VISION_MAX_EDGE,
    maxTokens: VISION_MAX_TOKENS,
  });
}

/** Normalize, write the vision image (the CLI's only Read scope) and thumb. */
async function prepare(
  photo: PhotoRow,
  run: RunRow,
  runDirRel: string,
): Promise<Prepared> {
  const image = await normalizeOriginal(photo);
  const visionRel = path.posix.join(runDirRel, 'image.jpg');
  // The temp file lives one level up so the run directory only ever holds
  // the finished image when the CLI reads it.
  await writeAtomic(
    visionRel,
    image.vision.jpeg,
    path.posix.dirname(runDirRel),
  );

  if (!photo.thumb_path) {
    const thumbRel = path.posix.join('thumbs', `${photo.id}.webp`);
    await writeAtomic(thumbRel, image.thumb.webp, 'thumbs');
    getDb()
      .$client.prepare(
        'UPDATE photos SET thumb_path = ?, updated_at = ? WHERE id = ?',
      )
      .run(thumbRel, Date.now(), photo.id);
  }

  const stamped = updateRunWhile(run.id, 'preparing', {
    sourceW: image.upright.width,
    sourceH: image.upright.height,
    visionW: image.vision.width,
    visionH: image.vision.height,
    maxEdge: VISION_MAX_EDGE,
    maxTokens: VISION_MAX_TOKENS,
    visionPath: visionRel,
  });
  if (!stamped) throw new Error('run left preparing during normalization');
  return { image, imagePath: resolveData(visionRel) };
}

/** The crop source CROP_SOURCE names, as raw RGB. */
async function cropSourceFor(image: NormalizedImage): Promise<RawImage> {
  if (CROP_SOURCE === 'master') return image.upright;
  const { data, info } = await sharp(image.vision.jpeg)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: 3 };
}

/** Cuts every CD/unsure crop; detections keep Claude's array order. */
async function cropDetections(
  photoId: string,
  image: NormalizedImage,
  result: VisionResult,
): Promise<PreparedDetection[]> {
  const visionW = image.vision.width;
  const visionH = image.vision.height;
  const source = await cropSourceFor(image);
  const out: PreparedDetection[] = [];
  for (const [position, read] of result.spines.entries()) {
    const id = newId();
    const box = normalizeBox(read.bbox, visionW, visionH);
    let crop: PreparedDetection['crop'] = null;
    if (box && SPINE_MEDIA_KINDS.includes(read.media_kind)) {
      const padded = padBox(box, visionW, visionH);
      const region = scaleBox(
        padded,
        { w: visionW, h: visionH },
        { w: source.width, h: source.height },
      );
      const cut = await cropSpine(source, region, read.text_orientation);
      const rel = path.posix.join('crops', photoId, `${id}.webp`);
      const abs = resolveData(rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, cut.webp);
      crop = { path: rel, width: cut.width, height: cut.height };
    }
    out.push({
      id,
      idx: Number.isFinite(read.index) ? Math.round(read.index) : position,
      position,
      mediaKind: read.media_kind,
      box,
      read,
      crop,
    });
  }
  return out;
}

/**
 * Classification, crops and persistence of a run in parsing whose raw
 * answer is already on disk. Shared by a fresh call and a reparse.
 */
async function settleParsed(
  photoId: string,
  run: RunRow,
  image: NormalizedImage,
  result: RunResult,
): Promise<void> {
  const outcome = classifyVisionRun(result);
  if (!outcome.ok) {
    markRunError(run.id, outcome.kind, outcome.detail);
    return;
  }
  const detections = await cropDetections(photoId, image, outcome.result);
  persistRunResult({
    runId: run.id,
    detections,
    result: outcome.result,
    envelope: outcome.envelope,
  });
}

function recordFailure(runId: string, err: unknown): void {
  try {
    if (err instanceof ImageDecodeError)
      markRunError(runId, err.kind, err.message);
    else markRunError(runId, 'failed', message(err));
  } catch (inner) {
    console.error('scan_photo: could not record the failure', inner);
  }
}

/** Everything after the spawn. Never throws (Pitfall 3). */
async function afterSpawn(
  photoId: string,
  run: RunRow,
  runDirRel: string,
  prepared: Prepared,
  call: () => Promise<RunResult>,
): Promise<void> {
  try {
    const result = await call();
    // VIS-03: the CLI's answer is on disk before anything parses it.
    const rawRel = path.posix.join(runDirRel, 'raw.json');
    const raw = JSON.stringify(
      { runId: run.id, recordedAt: Date.now(), run: result },
      null,
      2,
    );
    await writeAtomic(rawRel, Buffer.from(raw), runDirRel);
    if (!setRunStatus(run.id, 'calling', 'parsing', { rawPath: rawRel })) {
      return; // Someone else settled this run (for example a reconciler).
    }
    await settleParsed(photoId, run, prepared.image, result);
  } catch (err) {
    recordFailure(run.id, err);
  }
}

/**
 * Finishes a run from its saved raw.json (RESEARCH Pattern 4 step 1): the
 * original is normalized again, the recorded RunResult is read from disk and
 * the run continues at classification exactly like a fresh call. There is no
 * code path from here to the CLI. Never throws.
 */
async function reparse(photo: PhotoRow, run: RunRow): Promise<void> {
  if (run.status !== 'calling' && run.status !== 'parsing') return;
  const rawRel = run.raw_path ?? rawPathFor(photo.id, run.run_no);
  let text: string;
  try {
    text = await fs.readFile(resolveData(rawRel), 'utf8');
  } catch {
    markRunError(run.id, 'interrupted');
    return;
  }
  if (
    run.status === 'calling' &&
    !setRunStatus(run.id, 'calling', 'parsing', { rawPath: rawRel })
  ) {
    return;
  }
  try {
    const saved = JSON.parse(text) as { runId?: string; run?: RunResult };
    if (saved.runId !== run.id || !saved.run) {
      throw new Error('the saved answer belongs to another run');
    }
    const image = await normalizeOriginal(photo);
    if (
      (run.vision_w !== null && run.vision_w !== image.vision.width) ||
      (run.vision_h !== null && run.vision_h !== image.vision.height)
    ) {
      throw new Error('the photo no longer matches the image Claude read');
    }
    await settleParsed(photo.id, run, image, saved.run);
  } catch (err) {
    recordFailure(run.id, err);
  }
}

/** Test seams; the job registry calls runScanPhoto with two arguments. */
export type ScanPhotoDeps = {
  /** Overrides the 10-minute vision call timeout. */
  callTimeoutMs?: number;
};

export async function runScanPhoto(
  payload: unknown,
  ctx: JobContext,
  deps: ScanPhotoDeps = {},
): Promise<void> {
  const { photoId, runId, mode } = ScanPhotoPayload.parse(payload);
  const db = getDb().$client;
  const run = db
    .prepare(
      `SELECT id, run_no, status, raw_path, vision_w, vision_h
       FROM vision_runs WHERE id = ? AND photo_id = ?`,
    )
    .get(runId, photoId) as RunRow | undefined;
  const photo = db
    .prepare(
      'SELECT id, mime, original_path, thumb_path FROM photos WHERE id = ?',
    )
    .get(photoId) as PhotoRow | undefined;
  if (!run || !photo) return;
  if (mode === 'reparse') {
    await reparse(photo, run);
    return;
  }
  // Only a queued run is started; anything else was already handled.
  if (run.status !== 'queued') return;

  const model = getVisionModel();
  const effort = getVisionEffort();
  if (!setRunStatus(runId, 'queued', 'preparing', { model, effort })) return;

  const runDirRel = path.posix.join('vision', photoId, `run-${run.run_no}`);
  let prepared: Prepared;
  try {
    prepared = await prepare(photo, run, runDirRel);
  } catch (err) {
    recordFailure(runId, err);
    return;
  }

  // Right before the paid side effect (WR-04): a stale claim never spawns.
  if (!ctx.isCurrent()) return;
  if (!setRunStatus(runId, 'preparing', 'calling', { spawnedAt: Date.now() })) {
    return;
  }

  await afterSpawn(photoId, run, runDirRel, prepared, () =>
    runVisionCall({
      imagePath: prepared.imagePath,
      width: prepared.image.vision.width,
      height: prepared.image.vision.height,
      model,
      effort,
      signal: ctx.signal,
      timeoutMs: deps.callTimeoutMs,
    }),
  );
}
