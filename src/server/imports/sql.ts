// Shared SQL for import rules (WR-01). No 'server-only' import: the scan
// modules that use it are server code already, and this is only a string.

/**
 * True when the imports row aliased `a` holds its spine because a copy is,
 * or may be, on Discogs: any import that is not failed, and a failed one
 * whose intent was written unless Discogs refused the add (not_found,
 * rejected). The same rule as canChangeMatchOf and createImport's
 * retry_first (D-07), so a re-scan, a re-attach or a Dismiss never hides an
 * add that may have landed.
 */
export function importMayBeOnDiscogsSql(a: string): string {
  return `(${a}.status <> 'failed'
    OR (${a}.intent_at IS NOT NULL
      AND COALESCE(${a}.error_kind, '') NOT IN ('not_found', 'rejected')))`;
}
