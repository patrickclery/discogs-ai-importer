// RED skeleton: the compact-card copy helpers (implemented in the next commit).
import type { SpineDto } from './scan-types';

export type MatchSlot = {
  label: 'Top match' | 'Confirmed match';
  match: {
    candidateId: string | null;
    releaseId: number;
    title: string;
    details: string;
    hasThumb: boolean;
  } | null;
  placeholder: string | null;
};

export function matchDetails(_x: {
  year: number | null;
  country: string | null;
  catno: string | null;
}): string {
  return '';
}

export function matchSlotOf(
  _spine: Pick<SpineDto, 'import' | 'discogs' | 'notOnDiscogs'>,
): MatchSlot {
  return { label: 'Top match', match: null, placeholder: null };
}
