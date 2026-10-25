// Bulk import contracts shared by the job, the read model, the routes and
// client components (Phase 6). Client-safe: imports nothing server-side.
import { z } from 'zod';

/**
 * How a bulk item's release was chosen (D-02, D-04, D-21). preferred: the
 * imported release is in the preferred country (the top match itself, or
 * its pressing from the versions answer). fallback_country: the preferred
 * country had no usable version, so the imported release is from the run's
 * fallback country: that country's pressing from a second versions answer,
 * or the top match itself when it is already from there (G-06-side-1).
 * fallback_no_version: the master
 * lists no version in the country. fallback_no_master: the top match has no
 * master. fallback_unusable_master: the versions answer was implausible or
 * its pick did not match the top match's title. retried_earlier: the item
 * reuses the release an earlier attempt chose.
 */
export const PRESSING_OUTCOMES = [
  'preferred',
  'fallback_country',
  'fallback_no_version',
  'fallback_no_master',
  'fallback_unusable_master',
  'retried_earlier',
] as const;
export type PressingOutcome = (typeof PRESSING_OUTCOMES)[number];

/**
 * Where a bulk item stands in the store. queued: its resolve_pressing job
 * has not finished. resolved: an import was created. skipped: createImport
 * refused it (duplicate, D-09) or the spine changed since it was picked.
 * failed: the lookup failed.
 */
export const BULK_ITEM_STATUSES = [
  'queued',
  'resolved',
  'skipped',
  'failed',
] as const;
export type BulkItemStatus = (typeof BULK_ITEM_STATUSES)[number];

export const BULK_SKIP_REASONS = ['duplicate', 'changed'] as const;
export type BulkSkipReason = (typeof BULK_SKIP_REASONS)[number];

/** Why a lookup failed; unavailable, auth and interrupted have fixed copy. */
export const LOOKUP_ERROR_KINDS = [
  'unavailable',
  'auth',
  'rejected',
  'interrupted',
  'other',
] as const;
export type LookupErrorKind = (typeof LOOKUP_ERROR_KINDS)[number];

/**
 * Why a spine cannot be selected for a bulk import, in eligibilityOf's
 * precedence order (UI-SPEC "Ineligible reasons"). A failed import is not a
 * reason (D-20) and neither is low confidence (D-16).
 */
export const ELIGIBILITY_REASONS = [
  'orphaned',
  'not_on_discogs',
  'imported',
  'import_open',
  'import_held',
  'finding',
  'skipped_duplicate',
  'searching',
  'no_match',
] as const;
export type EligibilityReason = (typeof ELIGIBILITY_REASONS)[number];

/** The most spines one bulk import accepts. */
export const BULK_MAX_ITEMS = 2000;

/** What a card shows for a bulk item, from bulkItemPhaseOf. */
export type BulkItemPhase = 'finding' | 'resolved' | 'skipped' | 'failed';

/** One spine's bulk item on GET /api/spines. */
export type BulkItemDto = {
  id: string;
  runId: string;
  phase: BulkItemPhase;
  /** The run's preferred country when it started (D-14). */
  preferredCountry: string;
  /**
   * The run's fallback country when it started (G-06-side-1): null when it
   * had none distinct from the preferred country, and for runs from before
   * migration 0005.
   */
  fallbackCountry: string | null;
  outcome: PressingOutcome | null;
  /** The release the item imports, once chosen. */
  releaseId: number | null;
  /** That release's country. */
  country: string | null;
  importId: string | null;
  skip: {
    reason: BulkSkipReason;
    /** For duplicate: the other spine's photo file name. */
    photo: string | null;
    spineNumber: number | null;
    /** The other spine is on the same photo. */
    samePhoto: boolean;
  } | null;
  failure: {
    kind: LookupErrorKind;
    /** Only for kind other: at most 160 code points. */
    reason: string | null;
  } | null;
  createdAt: number;
};

/** A spine's bulk selection state on GET /api/spines (spine.bulk). */
export type SpineBulkDto = {
  eligible: boolean;
  reason: EligibilityReason | null;
  /** The spine's current bulk item, or null. */
  item: BulkItemDto | null;
};

/** The latest bulk run, for the progress line. */
export type BulkRunDto = {
  id: string;
  country: string;
  folderName: string;
  total: number;
  done: number;
  added: number;
  fallbacks: number;
  alreadyInCollection: number;
  duplicates: number;
  changed: number;
  failed: number;
  running: boolean;
  /** Lookups still queued in any run, a Retry import on an older run included. */
  openLookups: number;
  /**
   * A new run is refused (WR-03): this run is still running or a lookup is
   * still open. The start route and the Import button both read this.
   */
  busy: boolean;
  createdAt: number;
};

/**
 * POST body that starts a bulk import. It names spines and the candidate
 * the owner saw, never a release id or a country: the server decides both
 * (T-04-02, T-06-03).
 */
export const BULK_START_BODY = z.strictObject({
  items: z
    .array(
      z.strictObject({
        spineId: z.string().min(1).max(40),
        candidateId: z.string().min(1).max(40),
      }),
    )
    .min(1)
    .max(BULK_MAX_ITEMS),
});
export type BulkStartBody = z.infer<typeof BULK_START_BODY>;

export type BulkStartResponse = {
  runId: string;
  started: number;
  /** Items refused because the spine changed since it was picked. */
  skipped: number;
};
