import 'server-only';
import type Database from 'better-sqlite3';
import { SPINE_FIELDS, SPINE_MEDIA_KINDS } from '@/lib/vision-contract';
import { newId } from '../ids';
import { importMayBeOnDiscogsSql } from '../imports/sql';
import { fieldEdited, fieldUnedited } from './field-sql';
import { type MatchItem, matchDetections } from './match';
import type { PreparedDetection } from './store';

// The re-scan merge (CONTEXT D-13..D-16, RESEARCH Pattern 6). Runs inside
// persistRunResult's IMMEDIATE transaction, after the new run's detections
// are inserted with spine_id NULL. Earlier runs, their detections, raw.json
// and crops are never changed or deleted: a spine only moves its
// current_detection_id. Named parameters (better-sqlite3 rejects ?1).

export type MergeOutcome = {
  /** Active spines this run produced (matched + new). */
  spineCount: number;
  matched: number;
  created: number;
  superseded: number;
  orphaned: number;
};

type OldSpineRow = {
  id: string;
  idx: number | null;
  x1: number | null;
  y1: number | null;
  x2: number | null;
  y2: number | null;
  fields_json: string | null;
  vision_w: number | null;
  vision_h: number | null;
};

function rawTextOf(fieldsJson: string | null): string | null {
  if (!fieldsJson) return null;
  try {
    const parsed = JSON.parse(fieldsJson) as {
      raw_text?: { value?: unknown };
    };
    const v = parsed.raw_text?.value;
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

function oldItem(r: OldSpineRow): MatchItem {
  const hasBox =
    r.x1 !== null && r.y1 !== null && r.x2 !== null && r.y2 !== null;
  return {
    key: r.id,
    idx: r.idx ?? 0,
    box: hasBox
      ? {
          x1: r.x1 as number,
          y1: r.y1 as number,
          x2: r.x2 as number,
          y2: r.y2 as number,
        }
      : null,
    visionW: r.vision_w ?? 0,
    visionH: r.vision_h ?? 0,
    rawText: rawTextOf(r.fields_json),
  };
}

/**
 * Merges a parsed run (run_no > 1) into the photo's stable spines:
 * - matched: the spine keeps its id, points at the new detection and is
 *   active; per field, an unedited value (value IS ai_value) takes the new
 *   read, an edited one keeps the owner's value while ai_value and
 *   confidence take the new read (D-15);
 * - unmatched old: orphaned with any edit, a non-failed import or the
 *   not-on-Discogs mark (old crop and detection kept, D-16, Pitfall 5);
 *   superseded otherwise;
 * - unmatched new: a new active spine created by this run.
 * Old spines in state active or orphaned take part, so an orphan found
 * again returns to active with its edits (A-19).
 */
export function mergeRunIntoSpines(
  db: Database.Database,
  input: {
    photoId: string;
    runId: string;
    newDetections: readonly PreparedDetection[];
  },
): MergeOutcome {
  const { photoId, runId } = input;
  const now = Date.now();
  const run = db
    .prepare('SELECT vision_w, vision_h FROM vision_runs WHERE id = @runId')
    .get({ runId }) as
    | { vision_w: number | null; vision_h: number | null }
    | undefined;
  if (!run) throw new Error(`mergeRunIntoSpines: run ${runId} not found`);

  const oldRows = db
    .prepare(
      `SELECT s.id, d.idx, d.x1, d.y1, d.x2, d.y2, d.fields_json,
         r.vision_w, r.vision_h
       FROM spines s
       LEFT JOIN spine_detections d ON d.id = s.current_detection_id
       LEFT JOIN vision_runs r ON r.id = d.run_id
       WHERE s.photo_id = @photoId AND s.state IN ('active', 'orphaned')
         AND (d.run_id IS NULL OR d.run_id <> @runId)
       ORDER BY d.idx, d.position, s.id`,
    )
    .all({ photoId, runId }) as OldSpineRow[];

  const spineDetections = input.newDetections.filter((d) =>
    SPINE_MEDIA_KINDS.includes(d.mediaKind),
  );
  const byId = new Map(spineDetections.map((d) => [d.id, d]));
  const newItems: MatchItem[] = spineDetections.map((d) => ({
    key: d.id,
    idx: d.idx,
    box: d.box,
    visionW: run.vision_w ?? 0,
    visionH: run.vision_h ?? 0,
    rawText: d.read.raw_text.value,
  }));

  const { pairs, unmatchedOld, unmatchedNew } = matchDetections(
    oldRows.map(oldItem),
    newItems,
  );

  const linkDetection = db.prepare(
    `UPDATE spine_detections SET spine_id = @spineId
     WHERE id = @detectionId AND run_id = @runId`,
  );
  const moveSpine = db.prepare(
    `UPDATE spines SET current_detection_id = @detectionId, state = 'active',
       updated_at = @now
     WHERE id = @spineId`,
  );
  // SET expressions read the row as it was before the update, so every CASE
  // below compares the stored value with the stored (previous) AI read.
  // "Edited" compares normalized values, like the client (CR-01).
  const unedited = fieldUnedited('spine_fields.value', 'spine_fields.ai_value');
  const mergeField = db.prepare(
    `INSERT INTO spine_fields (spine_id, field, ai_value, value, confidence,
       edit_base_ai_value, updated_at)
     VALUES (@spineId, @field, @ai, @ai, @confidence, NULL, @now)
     ON CONFLICT (spine_id, field) DO UPDATE SET
       value = CASE WHEN ${unedited}
                    THEN excluded.ai_value ELSE spine_fields.value END,
       edit_base_ai_value = CASE
         WHEN ${unedited} THEN NULL
         WHEN ${fieldUnedited('spine_fields.value', 'excluded.ai_value')}
           THEN NULL
         ELSE spine_fields.edit_base_ai_value END,
       ai_value = excluded.ai_value,
       confidence = excluded.confidence,
       updated_at = excluded.updated_at`,
  );
  // RESEARCH Pitfall 5: an unmatched spine is kept as orphaned, never
  // superseded, when the owner edited it, when it has an import whose copy
  // is or may be on Discogs (importMayBeOnDiscogsSql, WR-01), or when it is
  // marked not on Discogs. Otherwise it would vanish, its replacement would
  // look un-imported, and the same disc could be confirmed and added a
  // second time. A failed import that never reached Discogs does not keep
  // it (A-04-16).
  const keepSpine = db.prepare(
    `SELECT (
       EXISTS (SELECT 1 FROM spine_fields
         WHERE spine_id = @spineId AND ${fieldEdited('value', 'ai_value')})
       OR EXISTS (SELECT 1 FROM imports i
         WHERE i.spine_id = @spineId AND ${importMayBeOnDiscogsSql('i')})
       OR EXISTS (SELECT 1 FROM spines
         WHERE id = @spineId AND not_on_discogs = 1)
     ) AS keep`,
  );
  const retire = db.prepare(
    `UPDATE spines SET state = @state, updated_at = @now WHERE id = @spineId`,
  );
  const insertSpine = db.prepare(
    `INSERT INTO spines (id, photo_id, current_detection_id, created_run_id,
       state, created_at, updated_at)
     VALUES (@spineId, @photoId, @detectionId, @runId, 'active', @now, @now)`,
  );

  function writeFields(spineId: string, d: PreparedDetection): void {
    for (const field of SPINE_FIELDS) {
      const { value, confidence } = d.read[field];
      mergeField.run({ spineId, field, ai: value, confidence, now });
    }
  }

  for (const pair of pairs) {
    const d = byId.get(pair.new.key);
    if (!d) throw new Error('mergeRunIntoSpines: paired an unknown detection');
    const spineId = pair.old.key;
    moveSpine.run({ detectionId: d.id, spineId, now });
    linkDetection.run({ spineId, detectionId: d.id, runId });
    writeFields(spineId, d);
  }

  let superseded = 0;
  let orphaned = 0;
  for (const o of unmatchedOld) {
    const { keep } = keepSpine.get({ spineId: o.key }) as { keep: number };
    const state = keep === 1 ? 'orphaned' : 'superseded';
    retire.run({ state, now, spineId: o.key });
    if (state === 'orphaned') orphaned += 1;
    else superseded += 1;
  }

  for (const n of unmatchedNew) {
    const d = byId.get(n.key);
    if (!d) throw new Error('mergeRunIntoSpines: unknown new detection');
    const spineId = newId();
    insertSpine.run({ spineId, photoId, detectionId: d.id, runId, now });
    linkDetection.run({ spineId, detectionId: d.id, runId });
    writeFields(spineId, d);
  }

  return {
    spineCount: pairs.length + unmatchedNew.length,
    matched: pairs.length,
    created: unmatchedNew.length,
    superseded,
    orphaned,
  };
}
