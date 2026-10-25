// The review status of a spine (D-10, REV-03). Pure and client-safe: the
// /spines read model computes it per spine, and the filter bar, counts and
// moved-out toast read it.
import type { SearchState } from './discogs-types';
import {
  type ImportPhase,
  REVIEW_STATUSES,
  type ReviewStatus,
} from './import-types';

export type ReviewStatusInput = {
  /** The latest import's phase, or null without one. */
  importPhase: ImportPhase | null;
  /** The Discogs copy number once imported or linked. */
  importInstanceId: number | null;
  notOnDiscogs: boolean;
  /** The latest search state, or null outside the /spines read model. */
  searchState: SearchState | null;
  candidateCount: number;
  /**
   * The spine's current bulk lookup (lookupOf). Current means newer than
   * its latest import, so it supersedes that import's phase.
   */
  lookup: 'finding' | 'failed' | null;
};

/**
 * Exactly one status per spine, top-down in D-10 order: imported (an
 * instance id is recorded, a linked copy included), not_on_discogs (the
 * owner marked it), failed (the latest import failed, or, with no import,
 * the latest search failed), matched (a release is confirmed and the import
 * is waiting, importing or held), not_found (the search finished with no
 * results and there is no manual candidate), and pending for everything
 * else. An import replaces the search on the card, so an older failed
 * search beside an open import reads matched (WR-06, revises A-04-09):
 * the card shows no search failure and Retry all failed has nothing to
 * clear. A current bulk lookup (BULK-11) comes right after not_on_discogs
 * and supersedes the latest import: a failed or abandoned lookup is
 * failed, and one still finding its pressing is matched (UI-SPEC E6).
 */
export function reviewStatusOf(x: ReviewStatusInput): ReviewStatus {
  if (x.importInstanceId !== null || x.importPhase === 'imported') {
    return 'imported';
  }
  if (x.notOnDiscogs) return 'not_on_discogs';
  // A current lookup is newer than the latest import (BULK-11). A spine
  // whose pressing is being found is committed to an import (UI-SPEC E6).
  if (x.lookup === 'failed') return 'failed';
  if (x.lookup === 'finding') return 'matched';
  if (
    x.importPhase === 'failed' ||
    (x.importPhase === null && x.searchState === 'failed')
  ) {
    return 'failed';
  }
  if (
    x.importPhase === 'waiting' ||
    x.importPhase === 'importing' ||
    x.importPhase === 'already_in_collection'
  ) {
    return 'matched';
  }
  if (x.searchState === 'no_match' && x.candidateCount === 0) {
    return 'not_found';
  }
  return 'pending';
}

/**
 * `?status=` (T-04-19): only the six exact REVIEW_STATUSES values select a
 * status; anything else, including case or whitespace variants, is All.
 */
export function parseStatusParam(
  v: string | null | undefined,
): ReviewStatus | undefined {
  if (typeof v !== 'string') return undefined;
  return (REVIEW_STATUSES as readonly string[]).includes(v)
    ? (v as ReviewStatus)
    : undefined;
}

/** Spines still to do: everything not imported and not marked (D-12). */
export function leftCount(byStatus: Record<ReviewStatus, number>): number {
  return (
    byStatus.pending + byStatus.matched + byStatus.not_found + byStatus.failed
  );
}

/** Zero for every status, in filter order. */
export function emptyByStatus(): Record<ReviewStatus, number> {
  return Object.fromEntries(REVIEW_STATUSES.map((s) => [s, 0])) as Record<
    ReviewStatus,
    number
  >;
}

/**
 * The status a spine moved to when it left the active status filter (UI-SPEC
 * Leaving the current filter), or null: under All nothing leaves, and a
 * spine whose status is unchanged or unknown did not move.
 */
export function movedOutOf(
  activeStatus: ReviewStatus | null,
  newStatus: ReviewStatus | null | undefined,
): ReviewStatus | null {
  if (activeStatus === null || !newStatus) return null;
  return newStatus === activeStatus ? null : newStatus;
}

/**
 * The card focus moves to once `spineId` left the list: the first card after
 * it in the order it was shown in that is still shown, else the nearest one
 * before it, else null (no card left). An id missing from `order` gives the
 * first shown card.
 */
export function nextShownId(
  order: readonly string[],
  spineId: string,
  shown: ReadonlySet<string>,
): string | null {
  const i = order.indexOf(spineId);
  if (i === -1) return order.find((id) => shown.has(id)) ?? null;
  for (let j = i + 1; j < order.length; j++) {
    if (shown.has(order[j])) return order[j];
  }
  for (let j = i - 1; j >= 0; j--) {
    if (shown.has(order[j])) return order[j];
  }
  return null;
}

/** The empty state an empty filtered /spines list shows (D-11, UI-SPEC E11). */
export type FilterEmpty =
  | { kind: 'status'; status: ReviewStatus }
  | { kind: 'combined' }
  | { kind: 'review' }
  | { kind: 'fallback' };

/**
 * Which empty state replaces an empty list, or null while `shown` spines
 * are listed or no filter is on: a status with Needs review gets the
 * combined state, a status alone its own, Needs review alone its own.
 */
export function filterEmptyOf(
  status: ReviewStatus | null,
  review: boolean,
  _fallback: boolean,
  shown: number,
): FilterEmpty | null {
  if (shown > 0) return null;
  if (status !== null) {
    return review ? { kind: 'combined' } : { kind: 'status', status };
  }
  return review ? { kind: 'review' } : null;
}
