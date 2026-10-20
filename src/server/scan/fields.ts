import 'server-only';
import type { SpineFieldDto } from '@/lib/scan-types';
import type { SpineField } from '@/lib/vision-contract';
import { getDb } from '../db/client';

// Owner edits to spine fields (REV-02, D-10). These statements write `value`,
// `edit_base_ai_value` and `updated_at` only: `ai_value` is Claude's read and
// is never assigned here, so revert can always restore it. Raw SQL with
// single-quoted literals (DQS=0).

export type FieldWriteResult =
  | { ok: true; field: SpineFieldDto }
  | { ok: false; error: 'not_found' | 'not_editable' };

type FieldRow = {
  field: SpineField;
  ai_value: string | null;
  value: string | null;
  confidence: number;
  edit_base_ai_value: string | null;
};

/** Superseded and dismissed spines are read-only; orphaned stay editable. */
const EDITABLE = `EXISTS (SELECT 1 FROM spines s
  WHERE s.id = spine_fields.spine_id AND s.state IN ('active', 'orphaned'))`;

const RETURNING =
  'RETURNING field, ai_value, value, confidence, edit_base_ai_value';

function toDto(r: FieldRow): SpineFieldDto {
  return {
    field: r.field,
    aiValue: r.ai_value,
    value: r.value,
    confidence: r.confidence,
    editBaseAiValue: r.edit_base_ai_value,
  };
}

/** Why no row was written: the spine is missing or no longer editable. */
function failure(spineId: string): FieldWriteResult {
  const spine = getDb()
    .$client.prepare('SELECT state FROM spines WHERE id = ?')
    .get(spineId) as { state: string } | undefined;
  if (!spine || spine.state === 'active' || spine.state === 'orphaned') {
    // An editable spine without this field row is treated as missing.
    return { ok: false, error: 'not_found' };
  }
  return { ok: false, error: 'not_editable' };
}

/**
 * Sets the owner's value (already normalized: trimmed, empty is null).
 * `edit_base_ai_value` records the AI read the edit was made against, and is
 * cleared when the value goes back to equal the AI read.
 */
export function updateSpineField(
  spineId: string,
  field: SpineField,
  value: string | null,
): FieldWriteResult {
  const row = getDb()
    .$client.prepare(
      `UPDATE spine_fields
         SET value = @value,
             edit_base_ai_value = CASE WHEN @value IS ai_value THEN NULL
                                       ELSE ai_value END,
             updated_at = @now
       WHERE spine_id = @spineId AND field = @field AND ${EDITABLE}
       ${RETURNING}`,
    )
    .get({ value, now: Date.now(), spineId, field }) as FieldRow | undefined;
  return row ? { ok: true, field: toDto(row) } : failure(spineId);
}

/** Restores Claude's read: value = ai_value, no edit base. */
export function revertSpineField(
  spineId: string,
  field: SpineField,
): FieldWriteResult {
  const row = getDb()
    .$client.prepare(
      `UPDATE spine_fields
         SET value = ai_value, edit_base_ai_value = NULL, updated_at = @now
       WHERE spine_id = @spineId AND field = @field AND ${EDITABLE}
       ${RETURNING}`,
    )
    .get({ now: Date.now(), spineId, field }) as FieldRow | undefined;
  return row ? { ok: true, field: toDto(row) } : failure(spineId);
}
