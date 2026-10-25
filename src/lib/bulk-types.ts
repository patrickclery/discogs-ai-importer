// Bulk import contracts shared by the job, the read model, the routes and
// client components (Phase 6). Client-safe: no server-only import here.

/**
 * How a bulk item's release was chosen (D-02, D-04, D-21). preferred: the
 * imported release is in the preferred country (the top match itself, or
 * its pressing from the versions answer). fallback_no_version: the master
 * lists no version in the country. fallback_no_master: the top match has no
 * master. fallback_unusable_master: the versions answer was implausible or
 * its pick did not match the top match's title. retried_earlier: the item
 * reuses the release an earlier attempt chose.
 */
export const PRESSING_OUTCOMES = [
  'preferred',
  'fallback_no_version',
  'fallback_no_master',
  'fallback_unusable_master',
  'retried_earlier',
] as const;
export type PressingOutcome = (typeof PRESSING_OUTCOMES)[number];
