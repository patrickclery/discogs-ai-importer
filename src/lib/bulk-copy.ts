// Copy helpers for the compact review card (D-10, UI-SPEC Copywriting
// Contract). Client-safe and pure. Discogs strings are joined as plain
// text, never re-cased. Plan 06-08 adds the bulk-state copy here.
import type { SpineDto } from './scan-types';

export type MatchSlotLabel = 'Top match' | 'Confirmed match';

/** One release the compact card shows under the crop. */
export type MatchSlotMatch = {
  candidateId: string | null;
  releaseId: number;
  title: string;
  details: string;
  hasThumb: boolean;
};

/** The match slot: a release, or a one-line placeholder naming the state. */
export type MatchSlot = {
  label: MatchSlotLabel;
  match: MatchSlotMatch | null;
  placeholder: string | null;
};

export const NO_DETAILS_SHORT = 'No details';

export const MATCH_PLACEHOLDERS = {
  notSearched: 'Not looked up yet',
  searching: 'Looking it up on Discogs…',
  noMatch: 'No matches on Discogs',
  failed: 'Search failed. Open the card to retry.',
  marked: 'Marked not on Discogs',
} as const;

function present(s: string | null | undefined): s is string {
  return typeof s === 'string' && s.trim() !== '';
}

/** `{year} · {country} · {catno}`, missing parts dropped, else `No details`. */
export function matchDetails(x: {
  year: number | null;
  country: string | null;
  catno: string | null;
}): string {
  const parts = [
    x.year && x.year > 0 ? String(x.year) : null,
    present(x.country) ? x.country : null,
    present(x.catno) ? x.catno : null,
  ].filter(present);
  return parts.length > 0 ? parts.join(' · ') : NO_DETAILS_SHORT;
}

/** The placeholder for a spine with no candidate, from its search state. */
function searchPlaceholder(spine: Pick<SpineDto, 'discogs'>): string {
  switch (spine.discogs?.state ?? 'not_searched') {
    case 'queued':
    case 'searching':
      return MATCH_PLACEHOLDERS.searching;
    case 'failed':
      return MATCH_PLACEHOLDERS.failed;
    case 'no_match':
    case 'done':
      return MATCH_PLACEHOLDERS.noMatch;
    default:
      return MATCH_PLACEHOLDERS.notSearched;
  }
}

/**
 * What the compact card's match slot shows. Precedence: the Not on Discogs
 * mark (a placeholder, even over an import), then an import in any phase
 * (`Confirmed match`, from its stored snapshot; a replaced snapshot reads
 * `Release {id}`), then the rank-1 candidate (`Top match`), then the
 * search-state placeholder.
 */
export function matchSlotOf(
  spine: Pick<SpineDto, 'import' | 'discogs' | 'notOnDiscogs'>,
): MatchSlot {
  if (spine.notOnDiscogs) {
    return {
      label: 'Top match',
      match: null,
      placeholder: MATCH_PLACEHOLDERS.marked,
    };
  }
  const imp = spine.import;
  if (imp) {
    const snap = imp.candidate;
    return {
      label: 'Confirmed match',
      match: snap
        ? {
            candidateId: imp.candidateId,
            releaseId: imp.releaseId,
            title: snap.title,
            details: matchDetails(snap),
            hasThumb: imp.hasThumb,
          }
        : {
            candidateId: imp.candidateId,
            releaseId: imp.releaseId,
            title: `Release ${imp.releaseId}`,
            details: NO_DETAILS_SHORT,
            hasThumb: false,
          },
      placeholder: null,
    };
  }
  const top = spine.discogs?.topCandidates[0];
  if (top) {
    return {
      label: 'Top match',
      match: {
        candidateId: top.id,
        releaseId: top.releaseId,
        title: top.title,
        details: matchDetails(top),
        hasThumb: top.hasThumb,
      },
      placeholder: null,
    };
  }
  return {
    label: 'Top match',
    match: null,
    placeholder: searchPlaceholder(spine),
  };
}
