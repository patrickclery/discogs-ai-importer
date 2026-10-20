import 'server-only';
import type { SpineDto } from '@/lib/scan-types';
import { getDb } from '../db/client';
import { fieldEdited, fieldUnedited } from './field-sql';
import { getSpineDto, loadSpineDtos } from './queries';

// Orphaned spines (CONTEXT D-13, D-16): a re-scan no longer found them but
// they carry the owner's edits, so they are never dropped silently. The owner
// either re-attaches one to a spine the latest run newly found, or dismisses
// it. Spine ids are what later phases attach Discogs matches and imports to,
// so re-attach keeps the orphan's id and retires the new spine instead
// (A-20). Detection rows are never modified, so after a re-attach the
// detection's spine_id still names the superseded target: the owning spine
// is the one whose current_detection_id points at it (IN-04, schema.ts).
// Named parameters only (better-sqlite3 rejects ?1).

/**
 * A re-attach target for orphan `@orphanId`: an active spine of the same
 * photo, created by the photo's latest done run, with no edited field. `t` is
 * the candidate spines row. The latest done run, not photos.latest_run_id
 * (WR-01): a queued, running or failed re-scan moves latest_run_id but
 * creates no spines, and would otherwise hide every candidate.
 */
const CANDIDATE = `t.state = 'active'
  AND t.photo_id = (SELECT o.photo_id FROM spines o WHERE o.id = @orphanId)
  AND t.created_run_id = (SELECT v.id FROM vision_runs v
    WHERE v.photo_id = t.photo_id AND v.status = 'done'
    ORDER BY v.run_no DESC LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM spine_fields f
    WHERE f.spine_id = t.id AND ${fieldEdited('f.value', 'f.ai_value')})`;

export type OrphanResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'not_found' }
  | { status: 'conflict' };

function spineState(id: string): string | null {
  const row = getDb()
    .$client.prepare('SELECT state FROM spines WHERE id = @id')
    .get({ id }) as { state: string } | undefined;
  return row?.state ?? null;
}

/**
 * The spines orphan `orphanId` can be re-attached to, in detection order.
 * Empty when the spine is no longer orphaned; not_found when it is missing.
 */
export function listReattachCandidates(
  orphanId: string,
): OrphanResult<SpineDto[]> {
  const state = spineState(orphanId);
  if (state === null) return { status: 'not_found' };
  if (state !== 'orphaned') return { status: 'ok', value: [] };
  const where = `s.id IN (SELECT t.id FROM spines t WHERE ${CANDIDATE})`;
  return { status: 'ok', value: loadSpineDtos(where, { orphanId }) };
}

/**
 * Moves orphan `orphanId` onto candidate `targetSpineId` (D-16) in one
 * IMMEDIATE transaction: the orphan takes over the target's detection (and
 * so its crop) and is active again; the target is superseded. Per field, an
 * edited orphan value is kept beside the target's read (ai_value and
 * confidence), keeping the read the owner edited against unless the value
 * now equals the new read; an unedited orphan field takes the target's
 * value, read and confidence. Anything else is a conflict: the source is not
 * orphaned, or the target is not a candidate of the same photo (T-02-25).
 */
export function reattachSpine(
  orphanId: string,
  targetSpineId: string,
): OrphanResult<SpineDto> {
  const db = getDb().$client;
  const run = db.transaction((): OrphanResult<null> => {
    const state = spineState(orphanId);
    if (state === null) return { status: 'not_found' };
    if (state !== 'orphaned') return { status: 'conflict' };
    const target = db
      .prepare(
        `SELECT t.id, t.current_detection_id FROM spines t
         WHERE t.id = @targetSpineId AND ${CANDIDATE}`,
      )
      .get({ targetSpineId, orphanId }) as
      | { id: string; current_detection_id: string | null }
      | undefined;
    if (!target?.current_detection_id) return { status: 'conflict' };

    const now = Date.now();
    // SET expressions read the orphan's row as it was before the update.
    // "Edited" compares normalized values, like the client (CR-01).
    const unedited = fieldUnedited(
      'spine_fields.value',
      'spine_fields.ai_value',
    );
    db.prepare(
      `INSERT INTO spine_fields (spine_id, field, ai_value, value, confidence,
         edit_base_ai_value, updated_at)
       SELECT @orphanId, t.field, t.ai_value, t.value, t.confidence, NULL, @now
       FROM spine_fields t WHERE t.spine_id = @targetSpineId
       ON CONFLICT (spine_id, field) DO UPDATE SET
         value = CASE WHEN ${unedited}
                      THEN excluded.value ELSE spine_fields.value END,
         edit_base_ai_value = CASE
           WHEN ${unedited} THEN NULL
           WHEN ${fieldUnedited('spine_fields.value', 'excluded.ai_value')}
             THEN NULL
           ELSE COALESCE(spine_fields.edit_base_ai_value,
                         spine_fields.ai_value) END,
         ai_value = excluded.ai_value,
         confidence = excluded.confidence,
         updated_at = excluded.updated_at`,
    ).run({ orphanId, targetSpineId, now });
    db.prepare(
      `UPDATE spines SET current_detection_id = @detectionId,
         state = 'active', updated_at = @now
       WHERE id = @orphanId`,
    ).run({ detectionId: target.current_detection_id, orphanId, now });
    db.prepare(
      `UPDATE spines SET state = 'superseded', updated_at = @now
       WHERE id = @targetSpineId`,
    ).run({ targetSpineId, now });
    return { status: 'ok', value: null };
  });
  const result = run.immediate();
  if (result.status !== 'ok') return result;
  const dto = getSpineDto(orphanId);
  if (!dto) return { status: 'not_found' };
  return { status: 'ok', value: dto };
}

export type DismissResult = 'ok' | 'not_found' | 'conflict';

/**
 * Dismisses an orphaned spine (D-16, A-21): only its state changes, so its
 * spine_fields rows stay stored but it is no longer listed or counted
 * (T-02-27). Any other state is a conflict.
 */
export function dismissSpine(id: string): DismissResult {
  const db = getDb().$client;
  const changed = db
    .prepare(
      `UPDATE spines SET state = 'dismissed', updated_at = @now
       WHERE id = @id AND state = 'orphaned'`,
    )
    .run({ id, now: Date.now() }).changes;
  if (changed === 1) return 'ok';
  return spineState(id) === null ? 'not_found' : 'conflict';
}
