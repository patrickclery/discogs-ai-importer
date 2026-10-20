import 'server-only';
import type { DensityFlag, PhotoStatus } from '@/lib/scan-types';
import {
  type MediaKind,
  SPINE_FIELDS,
  SPINE_MEDIA_KINDS,
} from '@/lib/vision-contract';
import { getDb } from '../db/client';
import { newId } from '../ids';
import type { Box } from '../images/crop';
import { reasonFor, type ScanErrorKind } from '../vision/reasons';
import type { CliEnvelope, SpineRead, VisionResult } from '../vision/schema';
import { mergeRunIntoSpines } from './merge';

// Run state transitions and persistence (RESEARCH Patterns 4 and 6). Every
// transition is a compare-and-set on the current status, so a stale or
// duplicate handler can never move a run it does not own. Raw SQL with
// single-quoted literals (DQS=0).

/** Columns a status transition may stamp, mapped to their SQL names. */
const RUN_EXTRA_COLUMNS = {
  model: 'model',
  effort: 'effort',
  maxEdge: 'max_edge',
  maxTokens: 'max_tokens',
  sourceW: 'source_w',
  sourceH: 'source_h',
  visionW: 'vision_w',
  visionH: 'vision_h',
  visionPath: 'vision_path',
  rawPath: 'raw_path',
  spawnedAt: 'spawned_at',
} as const;

export type RunExtra = Partial<
  Record<keyof typeof RUN_EXTRA_COLUMNS, string | number | null>
>;

/**
 * UPDATE ... WHERE status = from. Returns true only when this call moved the
 * run; extra columns are stamped in the same statement.
 */
export function setRunStatus(
  runId: string,
  from: PhotoStatus,
  to: PhotoStatus,
  extra: RunExtra = {},
): boolean {
  const sets = ['status = ?', 'updated_at = ?'];
  const values: (string | number | null)[] = [to, Date.now()];
  for (const [key, value] of Object.entries(extra)) {
    const column =
      RUN_EXTRA_COLUMNS[key as keyof typeof RUN_EXTRA_COLUMNS] ?? null;
    if (!column) throw new Error(`setRunStatus: unknown column ${key}`);
    sets.push(`${column} = ?`);
    values.push(value ?? null);
  }
  const res = getDb()
    .$client.prepare(
      `UPDATE vision_runs SET ${sets.join(', ')} WHERE id = ? AND status = ?`,
    )
    .run(...values, runId, from);
  return res.changes === 1;
}

/** Stamps run metadata without changing status, only while in `status`. */
export function updateRunWhile(
  runId: string,
  status: PhotoStatus,
  extra: RunExtra,
): boolean {
  return setRunStatus(runId, status, status, extra);
}

/**
 * Marks the run as failed with the UI-SPEC reason, unless it already
 * finished (a done run is never overwritten). Returns whether it changed.
 */
export function markRunError(
  runId: string,
  kind: ScanErrorKind,
  detail?: string,
): boolean {
  const now = Date.now();
  const res = getDb()
    .$client.prepare(
      `UPDATE vision_runs
       SET status = 'error', error_kind = ?, error_reason = ?,
         finished_at = ?, updated_at = ?
       WHERE id = ? AND status NOT IN ('done', 'error')`,
    )
    .run(kind, reasonFor(kind, detail), now, now, runId);
  return res.changes === 1;
}

/** One detected item, cropped and ready to insert. */
export type PreparedDetection = {
  id: string;
  /** Claude's index (rounded); ties are broken by position. */
  idx: number;
  /** Position in Claude's spines array. */
  position: number;
  mediaKind: MediaKind;
  /** Corners in the run's vision-image pixel space, or null if unusable. */
  box: Box | null;
  read: SpineRead;
  crop: { path: string; width: number; height: number } | null;
};

function fieldsJson(read: SpineRead): string {
  const out: Record<string, { value: string | null; confidence: number }> = {};
  for (const f of SPINE_FIELDS) out[f] = read[f];
  return JSON.stringify(out);
}

function usageJson(envelope: CliEnvelope): string {
  return JSON.stringify({
    usage: envelope.usage ?? null,
    modelUsage: envelope.modelUsage ?? null,
    num_turns: envelope.num_turns ?? null,
  });
}

/**
 * Stores a parsed run in one IMMEDIATE transaction: every detection (all
 * media kinds), a stable spine with six spine_fields rows for each CD or
 * unsure detection (ai_value = value, D-10), and the run set done. Identical
 * reads stay separate spines (no dedup). A re-scan (run_no > 1) inserts its
 * detections unlinked and hands them to mergeRunIntoSpines in the same
 * transaction (D-13..D-16), so earlier runs are never touched.
 */
export function persistRunResult(input: {
  runId: string;
  detections: PreparedDetection[];
  result: VisionResult;
  envelope: CliEnvelope;
  /** D-03 warnings; stored as a JSON array, never used to drop a spine. */
  densityFlags?: DensityFlag[];
}): { spineCount: number } {
  const { runId, detections, result, envelope } = input;
  const densityFlags = input.densityFlags ?? [];
  const db = getDb().$client;
  const tx = db.transaction((): { spineCount: number } => {
    const run = db
      .prepare('SELECT photo_id, run_no, status FROM vision_runs WHERE id = ?')
      .get(runId) as
      | { photo_id: string; run_no: number; status: PhotoStatus }
      | undefined;
    if (!run) throw new Error(`persistRunResult: run ${runId} not found`);
    const rescan = run.run_no > 1;
    if (run.status !== 'parsing') {
      throw new Error(`persistRunResult: run is ${run.status}, not parsing`);
    }

    const now = Date.now();
    const insertDetection = db.prepare(
      `INSERT INTO spine_detections (id, run_id, idx, position, media_kind,
         x1, y1, x2, y2, text_orientation, legibility, fields_json,
         crop_path, crop_w, crop_h, spine_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertSpine = db.prepare(
      `INSERT INTO spines (id, photo_id, current_detection_id, created_run_id,
         state, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`,
    );
    const insertField = db.prepare(
      `INSERT INTO spine_fields (spine_id, field, ai_value, value, confidence,
         edit_base_ai_value, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`,
    );

    let spineCount = 0;
    for (const d of detections) {
      const isSpine = SPINE_MEDIA_KINDS.includes(d.mediaKind);
      // A re-scan links its detections in mergeRunIntoSpines below.
      const spineId = isSpine && !rescan ? newId() : null;
      insertDetection.run(
        d.id,
        runId,
        d.idx,
        d.position,
        d.mediaKind,
        d.box?.x1 ?? null,
        d.box?.y1 ?? null,
        d.box?.x2 ?? null,
        d.box?.y2 ?? null,
        d.read.text_orientation,
        d.read.legibility,
        fieldsJson(d.read),
        d.crop?.path ?? null,
        d.crop?.width ?? null,
        d.crop?.height ?? null,
        spineId,
        now,
      );
      if (!spineId) continue;
      insertSpine.run(spineId, run.photo_id, d.id, runId, now, now);
      for (const field of SPINE_FIELDS) {
        const { value, confidence } = d.read[field];
        insertField.run(spineId, field, value, value, confidence, now);
      }
      spineCount += 1;
    }
    if (rescan) {
      spineCount = mergeRunIntoSpines(db, {
        photoId: run.photo_id,
        runId,
        newDetections: detections,
      }).spineCount;
    }

    const done = db
      .prepare(
        `UPDATE vision_runs
         SET status = 'done', finished_at = ?, updated_at = ?,
           duration_ms = ?, cost_usd = ?, usage_json = ?,
           spine_count_estimate = ?, reported_w = ?, reported_h = ?,
           detected_count = ?, cd_count = ?, density_flags = ?
         WHERE id = ? AND status = 'parsing'`,
      )
      .run(
        now,
        now,
        envelope.duration_ms ?? null,
        envelope.total_cost_usd ?? null,
        usageJson(envelope),
        Math.round(result.spine_count_estimate),
        Math.round(result.image_width),
        Math.round(result.image_height),
        detections.length,
        spineCount,
        JSON.stringify(densityFlags),
        runId,
      );
    if (done.changes !== 1) {
      throw new Error('persistRunResult: run left parsing during the write');
    }
    return { spineCount };
  });
  return tx.immediate();
}
