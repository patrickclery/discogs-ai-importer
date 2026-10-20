import 'server-only';

// One server-side definition of "edited" that matches the client's isEdited
// (src/lib/spine-review.ts): both sides are trimmed and an empty string means
// null before an exact compare. Claude's reads are stored untrimmed
// (vision/parse.ts normalizeField), so a plain `value IS ai_value` would call
// a field edited when the owner only tabbed through it (CR-01).

/**
 * Every character String.prototype.trim strips (ECMAScript WhiteSpace and
 * LineTerminator), as a SQLite string. SQLite's one-argument TRIM strips
 * spaces only.
 */
const JS_WHITESPACE = `char(${[
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002,
  0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028,
  0x2029, 0x202f, 0x205f, 0x3000, 0xfeff,
].join(',')})`;

/** SQL for normalizeFieldInput(expr): trimmed, and empty becomes NULL. */
export function normField(expr: string): string {
  return `NULLIF(TRIM(${expr}, ${JS_WHITESPACE}), '')`;
}

/** SQL that is true when `value` differs from `ai` after normalizing both. */
export function fieldEdited(value: string, ai: string): string {
  return `${normField(value)} IS NOT ${normField(ai)}`;
}

/** SQL that is true when `value` equals `ai` after normalizing both. */
export function fieldUnedited(value: string, ai: string): string {
  return `${normField(value)} IS ${normField(ai)}`;
}
