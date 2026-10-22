// The review status of a spine (D-10, REV-03). Pure and client-safe: the
// /spines read model computes it per spine, and the filter bar, counts and
// moved-out toast read it.
import type { SearchState } from './discogs-types';
import type { ImportPhase, ReviewStatus } from './import-types';

export type ReviewStatusInput = {
  importPhase: ImportPhase | null;
  importInstanceId: number | null;
  notOnDiscogs: boolean;
  searchState: SearchState | null;
  candidateCount: number;
};

export function reviewStatusOf(_x: ReviewStatusInput): ReviewStatus {
  return 'pending';
}

export function parseStatusParam(
  _v: string | null | undefined,
): ReviewStatus | undefined {
  return undefined;
}

export function leftCount(_byStatus: Record<ReviewStatus, number>): number {
  return 0;
}
