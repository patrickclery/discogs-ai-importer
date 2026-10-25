// Copy helpers for the compact review card (D-10, UI-SPEC Copywriting
// Contract). Client-safe and pure. Discogs strings are joined as plain
// text, never re-cased. The bulk-state lines (D-04, D-09, D-15, BULK-11)
// follow the match slot.
import type { BulkItemDto } from './bulk-types';
import { type CountryBadge, countryBadgeOf } from './bulk-view';
import { pressingPhrase } from './pressing';
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

// ---------------------------------------------------------------------------
// Bulk-state copy (UI-SPEC Per-spine bulk states, Copywriting Contract).
// Plain text only: country names, photo names and reasons are rendered as
// React text, never as HTML or a URL (T-06-20).

/** The country badge's text (D-15): the country verbatim, or Fallback. */
export function countryBadgeText(badge: CountryBadge): string {
  if (badge.kind === 'preferred') return badge.country ?? '';
  return `Fallback: ${badge.country ?? 'no country listed'}`;
}

/** `{used}`: the imported release's country, or the top match without one. */
function usedPart(country: string | null): string {
  return present(country)
    ? `used ${country}`
    : 'used the top match (no country listed)';
}

/**
 * Why a fallback import used another country (D-04). The prefix follows
 * the outcome: no version in the country, no usable master, or a retry
 * that reused the release an earlier attempt chose.
 */
export function fallbackLine(item: BulkItemDto): string {
  const phrase = pressingPhrase(item.preferredCountry, false);
  const used = usedPart(item.country);
  switch (item.outcome) {
    case 'fallback_no_master':
    case 'fallback_unusable_master':
      return `No ${phrase} listed for this release, ${used}`;
    case 'retried_earlier':
      return `Retried the earlier import of this spine, ${used}`;
    default:
      return `No ${phrase}, ${used}`;
  }
}

/** The skipped-duplicate line (D-09): the spine already imported. */
export function skippedLine(skip: NonNullable<BulkItemDto['skip']>): string {
  if (skip.spineNumber === null) return 'Already imported from another spine';
  if (skip.samePhoto) return `Already imported from spine #${skip.spineNumber}`;
  const photo = present(skip.photo) ? skip.photo : 'another photo';
  return `Already imported from ${photo}, spine #${skip.spineNumber}`;
}

/** The Open Settings link of a rejected-connection line (fixed href). */
export type SettingsLink = {
  label: 'Open Settings';
  href: '/settings';
  tail: string;
};

const LOOKUP_PREFIX = "Couldn't look up pressings";
const RETRY_TAIL = 'Retry the import.';

/** The lookup failure line (BULK-11), by the recorded failure kind. */
export function lookupFailureLine(failure: BulkItemDto['failure']): {
  text: string;
  link: SettingsLink | null;
} {
  const plain = (why: string) => ({
    text: `${LOOKUP_PREFIX}: ${why}. ${RETRY_TAIL}`,
    link: null,
  });
  switch (failure?.kind) {
    case 'unavailable':
      return plain("Discogs didn't respond");
    case 'auth':
      return {
        text: `${LOOKUP_PREFIX}: Discogs rejected the connection.`,
        link: {
          label: 'Open Settings',
          href: '/settings',
          tail: ' to reconnect, then retry.',
        },
      };
    case 'rejected':
      return plain('Discogs refused the request');
    case 'interrupted':
      return plain('the app stopped before it finished');
    default: {
      const reason = failure?.reason?.trim().replace(/\.+$/, '');
      return plain(reason ? reason : 'something went wrong');
    }
  }
}

/** The line while the pressing is being found. */
export function findingLine(
  item: Pick<BulkItemDto, 'preferredCountry'>,
): string {
  return `Looking for the ${pressingPhrase(item.preferredCountry, false)}…`;
}

export type BulkStatusKind = 'failed' | 'fallback' | 'skipped' | 'finding';

/** The one bulk status line a card shows. */
export type BulkStatusLine =
  | { kind: 'failed'; text: string; link: SettingsLink | null }
  | { kind: 'fallback' | 'skipped' | 'finding'; text: string };

/**
 * At most one bulk status line, in the UI-SPEC priority: a failed lookup,
 * then a fallback import (the badge says Fallback), then a skipped
 * duplicate, then a lookup in progress. A skip because the spine changed,
 * a preferred import and a spine with no current bulk item show none.
 */
export function bulkStatusLineOf(
  spine: Pick<SpineDto, 'import' | 'bulk'>,
): BulkStatusLine | null {
  const item = spine.bulk?.item ?? null;
  if (item === null) return null;
  if (item.phase === 'failed') {
    return { kind: 'failed', ...lookupFailureLine(item.failure) };
  }
  if (countryBadgeOf(spine)?.kind === 'fallback') {
    return { kind: 'fallback', text: fallbackLine(item) };
  }
  if (item.phase === 'skipped' && item.skip?.reason === 'duplicate') {
    return { kind: 'skipped', text: skippedLine(item.skip) };
  }
  if (item.phase === 'finding') {
    return { kind: 'finding', text: findingLine(item) };
  }
  return null;
}
