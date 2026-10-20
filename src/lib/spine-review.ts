// Pure review helpers for spine fields (D-09, D-10). Client-safe: the spines
// list, the field editor (02-09) and getSpines' Needs review count all use
// these, so "edited" and "low confidence" mean the same thing everywhere.
import type { SpineDto, SpineFieldDto } from './scan-types';

/** A typed field value as stored: trimmed, and empty means "not read". */
export function normalizeFieldInput(
  s: string | null | undefined,
): string | null {
  const t = (s ?? '').trim();
  return t === '' ? null : t;
}

/** The owner changed the value away from Claude's read (exact compare). */
export function isEdited(f: Pick<SpineFieldDto, 'value' | 'aiValue'>): boolean {
  return f.value !== f.aiValue;
}

/**
 * D-09: Claude read something, the owner has not edited it, and Claude's
 * confidence is strictly below the threshold.
 */
export function isLowConfidence(
  f: Pick<SpineFieldDto, 'value' | 'aiValue' | 'confidence'>,
  threshold: number,
): boolean {
  return f.aiValue !== null && !isEdited(f) && f.confidence < threshold;
}

/** Confidence 0..1 as a whole percentage. */
export function confidencePct(c: number): number {
  return Math.round(c * 100);
}

/** The lowest-confidence flagged field (first wins on a tie), or null. */
export function worstField(
  fields: readonly SpineFieldDto[],
  threshold: number,
): SpineFieldDto | null {
  let worst: SpineFieldDto | null = null;
  for (const f of fields) {
    if (!isLowConfidence(f, threshold)) continue;
    if (worst === null || f.confidence < worst.confidence) worst = f;
  }
  return worst;
}

export function editedCount(fields: readonly SpineFieldDto[]): number {
  return fields.filter(isEdited).length;
}

/** The spine has at least one low-confidence field (A-16 Needs review). */
export function needsReview(
  spine: Pick<SpineDto, 'fields'>,
  threshold: number,
): boolean {
  return spine.fields.some((f) => isLowConfidence(f, threshold));
}

/**
 * The number shown as `#n`. Claude's index is 0-based in reading order
 * (prompt.ts), so the owner sees 1, 2, 3 for the first spines.
 */
export function spineNumber(spine: Pick<SpineDto, 'index'>): number {
  return spine.index + 1;
}

/** Relative time for "scanned {time}" ("just now", "5 minutes ago"). */
export function formatRelativeTime(at: number, now: number): string {
  const diffSec = Math.round((at - now) / 1000);
  if (Math.abs(diffSec) < 45) return 'just now';
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, sec] of units) {
    if (Math.abs(diffSec) >= sec)
      return rtf.format(Math.round(diffSec / sec), unit);
  }
  return rtf.format(Math.round(diffSec / 60), 'minute');
}

/** Longest field value the PATCH route accepts (T-02-18). */
export const MAX_FIELD_CHARS = 500;

/**
 * What a field input shows (RESEARCH Pitfall 6): the local draft while the
 * field is focused or holds unsaved text, otherwise the server's value. A
 * poll that brings a different server value never changes text being typed.
 */
export function resolveDisplayedValue(s: {
  serverValue: string | null;
  draft: string;
  focused: boolean;
  dirty: boolean;
}): string {
  return s.focused || s.dirty ? s.draft : (s.serverValue ?? '');
}

/**
 * A /spines response with one spine field replaced (optimistic and settled
 * PATCH results). Returns the same object when the spine is not in it.
 */
export function withSpineField<
  T extends { spines: readonly SpineDto[] } | undefined,
>(data: T, spineId: string, next: SpineFieldDto): T {
  if (!data?.spines.some((s) => s.id === spineId)) return data;
  return {
    ...data,
    spines: data.spines.map((s) =>
      s.id === spineId
        ? {
            ...s,
            fields: s.fields.map((f) => (f.field === next.field ? next : f)),
          }
        : s,
    ),
  };
}
