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
};

/**
 * Exactly one status per spine, top-down in D-10 order: imported (an
 * instance id is recorded, a linked copy included), not_on_discogs (the
 * owner marked it), failed (the latest import failed, or the latest search
 * failed, also with an open import: A-04-09), matched (a release is
 * confirmed and the import is waiting, importing or held), not_found (the
 * search finished with no results and there is no manual candidate), and
 * pending for everything else.
 */
export function reviewStatusOf(x: ReviewStatusInput): ReviewStatus {
  if (x.importInstanceId !== null || x.importPhase === 'imported') {
    return 'imported';
  }
  if (x.notOnDiscogs) return 'not_on_discogs';
  if (x.importPhase === 'failed' || x.searchState === 'failed') {
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

export function movedOutOf(
  _activeStatus: ReviewStatus | null,
  _newStatus: ReviewStatus | null | undefined,
): ReviewStatus | null {
  return null;
}
