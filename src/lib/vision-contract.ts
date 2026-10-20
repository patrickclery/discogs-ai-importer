// Vision contract (D-01). Client-safe: enums the review UI needs plus the
// constants the Plan 02-04 freeze decides. This is the one file that freeze
// edits; every stored run records the values it was made with.

/** Extracted spine fields, in UI order (VIS-02). */
export const SPINE_FIELDS = [
  'artist',
  'title',
  'format',
  'label',
  'catalog_number',
  'raw_text',
] as const;
export type SpineField = (typeof SPINE_FIELDS)[number];

/**
 * Orientation of the printed glyphs, not of the case (RESEARCH Pitfall 7).
 * horizontal: upright, left to right. upside_down: glyphs inverted.
 * top_to_bottom: vertical, glyph tops face right. bottom_to_top: vertical,
 * glyph tops face left.
 */
export const TEXT_ORIENTATIONS = [
  'horizontal',
  'upside_down',
  'top_to_bottom',
  'bottom_to_top',
] as const;
export type TextOrientation = (typeof TEXT_ORIENTATIONS)[number];

export const MEDIA_KINDS = [
  'cd',
  'dvd',
  'bluray',
  'vinyl',
  'cassette',
  'game',
  'book',
  'other',
  'unsure',
] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Media kinds that become spines (CDs only; unsure is kept for review). */
export const SPINE_MEDIA_KINDS: readonly MediaKind[] = ['cd', 'unsure'];

export const LEGIBILITY_LEVELS = ['clear', 'partial', 'illegible'] as const;
export type Legibility = (typeof LEGIBILITY_LEVELS)[number];

/** Model image tier for Claude 4.7 and later (both allowed models). */
export const VISION_MAX_EDGE = 2576;
export const VISION_MAX_TOKENS = 4784;

/** The CLI Read tool re-encodes images above this size; stay under it. */
export const VISION_JPEG_MAX_BYTES = 500_000;
export const VISION_JPEG_QUALITY = 90;
export const VISION_JPEG_MIN_QUALITY = 70;

export const VISION_EFFORTS = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;
export type VisionEffort = (typeof VISION_EFFORTS)[number];
export const DEFAULT_VISION_EFFORT: VisionEffort = 'medium';

/** --max-turns for the vision call; null omits the flag. */
export const VISION_MAX_TURNS: number | null = 6;
export const VISION_CALL_TIMEOUT_MS = 600_000;
/** CLAUDE_CODE_MAX_OUTPUT_TOKENS for the vision call; null leaves it unset. */
export const VISION_MAX_OUTPUT_TOKENS: number | null = null;

export const PROMPT_VERSION = 1;
export const SCHEMA_VERSION = 1;

/** Long edge of photo thumbnails (48 px at 2x and up to 80 px). */
export const THUMB_LONG_EDGE = 160;
