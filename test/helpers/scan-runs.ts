import { getDb } from '@/server/db/client';
import { newId } from '@/server/ids';
import { updateSpineField } from '@/server/scan/fields';
import { ingestUpload } from '@/server/scan/ingest';
import { type PreparedDetection, persistRunResult } from '@/server/scan/store';
import type { CliEnvelope, VisionResult } from '@/server/vision/schema';
import {
  LAYOUTS,
  makeSyntheticShelf,
  structuredOutputFor,
} from '../fixtures/vision/synthetic-shelf.mjs';

// Stored vision runs for orphan tests (Plan 02-11): run 1 of the tracer
// shelf through persistRunResult, then later runs merged into the same
// stable spines. Call inside a useTempDataDir() block.

export const layout = LAYOUTS.tracerShelf;
const ENVELOPE = { is_error: false } as CliEnvelope;

export type Output = ReturnType<typeof structuredOutputFor>;
export type SpineOut = Output['spines'][number];

function detectionsFor(out: Output): PreparedDetection[] {
  return out.spines.map((s, position) => ({
    id: newId(),
    idx: s.index,
    position,
    mediaKind: s.media_kind as PreparedDetection['mediaKind'],
    box: { x1: s.bbox[0], y1: s.bbox[1], x2: s.bbox[2], y2: s.bbox[3] },
    read: s as unknown as PreparedDetection['read'],
    crop: null,
  }));
}

/** A run in parsing with the tracer's vision size, ready to persist. */
export function parsingRun(photoId: string, runNo: number): string {
  const db = getDb().$client;
  const existing = db
    .prepare('SELECT id FROM vision_runs WHERE photo_id = ? AND run_no = ?')
    .get(photoId, runNo) as { id: string } | undefined;
  const runId = existing?.id ?? newId();
  const now = Date.now();
  if (!existing) {
    db.prepare(
      `INSERT INTO vision_runs (id, photo_id, run_no, status, prompt_version,
         schema_version, created_at, updated_at)
       VALUES (?, ?, ?, 'queued', 1, 1, ?, ?)`,
    ).run(runId, photoId, runNo, now, now);
  }
  db.prepare(
    `UPDATE vision_runs SET status = 'parsing', vision_w = ?, vision_h = ?
     WHERE id = ?`,
  ).run(layout.width, layout.height, runId);
  db.prepare('UPDATE photos SET latest_run_id = ? WHERE id = ?').run(
    runId,
    photoId,
  );
  return runId;
}

export function persist(runId: string, out: Output): PreparedDetection[] {
  const detections = detectionsFor(out);
  persistRunResult({
    runId,
    detections,
    result: out as unknown as VisionResult,
    envelope: ENVELOPE,
  });
  return detections;
}

/** Run 2's answer: every box shifted, some spines dropped, extras added. */
export function rescanOutput(
  edit: (s: SpineOut) => SpineOut | null,
  extra: SpineOut[] = [],
): Output {
  const base = structuredOutputFor(layout);
  const spines = base.spines
    .map((s) => ({ ...s, bbox: s.bbox.map((v) => v + 6) }))
    .map(edit)
    .filter((s): s is SpineOut => s !== null);
  const all = [...spines, ...extra].map((s, index) => ({ ...s, index }));
  return { ...base, spine_count_estimate: all.length, spines: all };
}

/** A spine read far from every tracer spine, so the merge never pairs it. */
export function freshSpine(
  rawText: string,
  artist: string,
  bboxY = 520,
): SpineOut {
  const base = structuredOutputFor(layout).spines[0];
  return {
    ...base,
    bbox: [40, bboxY, 700, bboxY + 80],
    raw_text: { value: rawText, confidence: 0.91 },
    artist: { value: artist, confidence: 0.82 },
    title: { value: null, confidence: 0 },
  };
}

export type SpineDb = {
  id: string;
  photo_id: string;
  state: string;
  current_detection_id: string | null;
  created_run_id: string | null;
};
export type FieldDb = {
  field: string;
  ai_value: string | null;
  value: string | null;
  confidence: number;
  edit_base_ai_value: string | null;
};

export function spineByDetection(detectionId: string): SpineDb {
  return getDb()
    .$client.prepare(
      `SELECT s.* FROM spines s JOIN spine_detections d ON d.spine_id = s.id
       WHERE d.id = ?`,
    )
    .get(detectionId) as SpineDb;
}

export function spineRow(id: string): SpineDb {
  return getDb()
    .$client.prepare('SELECT * FROM spines WHERE id = ?')
    .get(id) as SpineDb;
}

export function fieldOf(spineId: string, field: string): FieldDb {
  return getDb()
    .$client.prepare(
      'SELECT * FROM spine_fields WHERE spine_id = ? AND field = ?',
    )
    .get(spineId, field) as FieldDb;
}

export function fieldRows(spineId: string): FieldDb[] {
  return getDb()
    .$client.prepare(
      'SELECT * FROM spine_fields WHERE spine_id = ? ORDER BY field',
    )
    .all(spineId) as FieldDb[];
}

/** Every spines and spine_fields row, to prove a refused write changed nothing. */
export function spineTables(): string {
  const db = getDb().$client;
  return JSON.stringify([
    db.prepare('SELECT * FROM spines ORDER BY id').all(),
    db.prepare('SELECT * FROM spine_fields ORDER BY spine_id, field').all(),
  ]);
}

export const ORPHAN_ARTIST = 'Owner artist';
export const ORPHAN_INDEX = 4;
export const V_TEXT = 'Marlow Reed - Salt and Ember';

/**
 * Run 1 of the tracer, an edit on spine 4's artist, then run 2 without
 * spines 4 and 5 and with one new spine V: spine 4 is orphaned, 5 is
 * superseded and V is an unedited active spine created by run 2.
 */
export async function orphanScenario(filename = 'shelf.jpg') {
  const { jpeg } = await makeSyntheticShelf(layout);
  const { photoId } = await ingestUpload({
    bytes: new Uint8Array(jpeg),
    kind: 'jpeg',
    filename,
  });
  const run1 = parsingRun(photoId, 1);
  const run1Detections = persist(run1, structuredOutputFor(layout));
  const spineIds = run1Detections.map((d) => spineByDetection(d.id).id);
  const orphanId = spineIds[ORPHAN_INDEX];
  updateSpineField(orphanId, 'artist', ORPHAN_ARTIST);
  const run2 = parsingRun(photoId, 2);
  const run2Detections = persist(
    run2,
    rescanOutput(
      (s) => (s.index === ORPHAN_INDEX || s.index === 5 ? null : s),
      [freshSpine(V_TEXT, 'Marlow Reed')],
    ),
  );
  const vDetection = run2Detections[run2Detections.length - 1];
  const vId = spineByDetection(vDetection.id).id;
  return {
    photoId,
    run1,
    run2,
    spineIds,
    orphanId,
    supersededId: spineIds[5],
    vId,
    vDetectionId: vDetection.id,
  };
}

/** A second photo with one unedited active spine created by its latest run. */
export async function foreignCandidate(): Promise<string> {
  const { photoId } = await ingestUpload({
    bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7, 6]),
    kind: 'jpeg',
    filename: 'other.jpg',
  });
  const db = getDb().$client;
  const { latest_run_id } = db
    .prepare('SELECT latest_run_id FROM photos WHERE id = ?')
    .get(photoId) as { latest_run_id: string };
  const id = newId();
  const now = Date.now();
  db.prepare(
    `INSERT INTO spines (id, photo_id, current_detection_id, created_run_id,
       state, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?)`,
  ).run(id, photoId, newId(), latest_run_id, now, now);
  return id;
}
