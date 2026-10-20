// Dependency-free edit distance for re-scan matching (CONTEXT D-14). Strings
// are compared by code point after normalizeForMatch, so a combining accent
// and its precomposed form are the same text (edge VIS-02 encoding).

/** NFC, lower case, trimmed, runs of whitespace collapsed to one space. */
export function normalizeForMatch(s: string): string {
  return s.normalize('NFC').toLowerCase().trim().replace(/\s+/gu, ' ');
}

/** Two-row Levenshtein distance over code points (not UTF-16 units). */
export function levenshtein(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  if (x.length === 0) return y.length;
  if (y.length === 0) return x.length;
  let prev = new Array<number>(y.length + 1);
  let curr = new Array<number>(y.length + 1);
  for (let j = 0; j <= y.length; j += 1) prev[j] = j;
  for (let i = 1; i <= x.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= y.length; j += 1) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[y.length];
}

/**
 * 1 - distance / longer length on normalized text, in [0, 1]. Two empty (or
 * missing) strings score 0, so text never decides a pair on its own.
 */
export function textSimilarity(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const x = normalizeForMatch(a ?? '');
  const y = normalizeForMatch(b ?? '');
  const longest = Math.max(Array.from(x).length, Array.from(y).length);
  if (longest === 0) return 0;
  return 1 - levenshtein(x, y) / longest;
}
