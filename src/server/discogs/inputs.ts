import 'server-only';
import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

// Search inputs for a spine (D-08, D-14). One normalize function feeds the
// enqueue dedupe hash and, later, the read model's "fields changed" check,
// so both always agree. Plan 03-07 pins these rules in tests.

/** Longest value sent to Discogs, in code points. */
export const MAX_INPUT_CODE_POINTS = 200;

export type SearchInputs = {
  artist: string | null;
  title: string | null;
  catno: string | null;
  rawText: string | null;
};

/** Cuts to max code points without splitting a surrogate pair. */
export function capCodePoints(s: string, max: number): string {
  const points = Array.from(s);
  return points.length > max ? points.slice(0, max).join('') : s;
}

/** NFC, trim, collapse whitespace runs, cap at 200 code points; '' -> null. */
export function normalizeInput(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null;
  const collapsed = v.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (!collapsed) return null;
  const capped = capCodePoints(collapsed, MAX_INPUT_CODE_POINTS).trim();
  return capped || null;
}

/** The fields a search reads, as field -> current value (owner over AI). */
export type FieldValues = Partial<
  Record<'artist' | 'title' | 'catalog_number' | 'raw_text', string | null>
>;

export function searchInputs(fields: FieldValues): SearchInputs {
  return {
    artist: normalizeInput(fields.artist),
    title: normalizeInput(fields.title),
    catno: normalizeInput(fields.catalog_number),
    rawText: normalizeInput(fields.raw_text),
  };
}

/** sha256 hex of the normalized inputs in a fixed order. */
export function inputHash(inputs: SearchInputs): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        inputs.artist,
        inputs.title,
        inputs.catno,
        inputs.rawText,
      ]),
    )
    .digest('hex');
}

/**
 * Reads spine_fields.value (the owner's value when edited, otherwise the AI
 * read) for the four search fields.
 */
export function loadSpineInputs(
  db: Database.Database,
  spineId: string,
): SearchInputs {
  const rows = db
    .prepare(
      `SELECT field, value FROM spine_fields
       WHERE spine_id = @spineId
         AND field IN ('artist', 'title', 'catalog_number', 'raw_text')`,
    )
    .all({ spineId }) as { field: keyof FieldValues; value: string | null }[];
  const fields: FieldValues = {};
  for (const r of rows) fields[r.field] = r.value;
  return searchInputs(fields);
}
