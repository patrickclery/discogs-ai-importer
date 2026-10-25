// Copy helpers for the compact review card (D-10, UI-SPEC Copywriting
// Contract). Client-safe and pure. Discogs strings are joined as plain
// text, never re-cased. The bulk-state lines (D-04, D-09, D-15, BULK-11)
// follow the match slot.
import type { BulkItemDto, BulkRunDto, EligibilityReason } from './bulk-types';
import { type CountryBadge, countryBadgeOf } from './bulk-view';
import {
  COUNTRY_DEMONYMS,
  canonicalCountry,
  distinctFallback,
  pressingPhrase,
} from './pressing';
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

function demonymOf(country: string): string | undefined {
  const canonical = canonicalCountry(country);
  return canonical ? COUNTRY_DEMONYMS[canonical] : undefined;
}

/**
 * The pressing phrase for two countries (G-06-side-1): `Canadian or US
 * pressing` when both have a demonym, else each phrase in full joined by
 * `or` (`Canadian pressing or pressing from Hong Kong`).
 */
function pairPressingPhrase(first: string, second: string): string {
  const a = demonymOf(first);
  const b = demonymOf(second);
  if (a && b) return `${a} or ${b} pressing`;
  return `${pressingPhrase(first, false)} or ${pressingPhrase(second, false)}`;
}

/**
 * The pressing(s) a run looked for: the pair phrase when it had a distinct
 * fallback country (G-06-side-1), else the preferred one alone.
 */
function soughtPhrase(
  item: Pick<BulkItemDto, 'preferredCountry' | 'fallbackCountry'>,
): string {
  const second = distinctFallback(item.preferredCountry, item.fallbackCountry);
  return second === null
    ? pressingPhrase(item.preferredCountry, false)
    : pairPressingPhrase(item.preferredCountry, second);
}

/**
 * Why a fallback import used another country (D-04, G-06-side-1). The
 * prefix follows the outcome: the fallback country's pressing (no
 * preferred one), no version in either country the run tried, no usable
 * master, or a retry that reused the release an earlier attempt chose.
 */
export function fallbackLine(item: BulkItemDto): string {
  const phrase = pressingPhrase(item.preferredCountry, false);
  const used = usedPart(item.country);
  switch (item.outcome) {
    case 'fallback_country':
      return `No ${phrase}, ${used}`;
    case 'fallback_no_version':
      return `No ${soughtPhrase(item)}, ${used}`;
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

/** The line while the pressing is being found, naming each country tried. */
export function findingLine(
  item: Pick<BulkItemDto, 'preferredCountry' | 'fallbackCountry'>,
): string {
  return `Looking for the ${soughtPhrase(item)}…`;
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

// ---------------------------------------------------------------------------
// Bulk bar and confirm dialog copy (D-05, D-07, D-16, UI-SPEC Copywriting
// Contract). Folder and country names are joined as plain text (T-06-23).

/** `Import {n} to {folder} as Canadian pressings` (D-07, D-14). */
export function dialogTitle(n: number, folder: string, country: string) {
  return `Import ${n} to ${folder} as ${pressingPhrase(country, true)}`;
}

/** `Canadian CD pressing`, or `CD pressing from {country}` without a demonym. */
function cdPressingPhrase(country: string): string {
  const canonical = canonicalCountry(country);
  const demonym = canonical ? COUNTRY_DEMONYMS[canonical] : undefined;
  return demonym
    ? `${demonym} CD pressing`
    : `CD pressing from ${country.trim()}`;
}

/**
 * The dialog body (D-07). With `lowConfidence` > 0 it adds how many picked
 * spines have a field Claude wasn't sure of (D-16): it informs, never blocks.
 */
export function dialogBody(country: string, lowConfidence: number) {
  const body = `Each spine's top match is swapped for its ${cdPressingPhrase(country)} when Discogs lists one. If it doesn't, the top match is added as is and the card says so. Spines already imported from another spine are skipped. Large imports take a while, because Discogs allows about one request per second.`;
  return lowConfidence > 0
    ? `${body} ${lowConfidence} of them have a field Claude wasn't sure of.`
    : body;
}

/** The dialog's inline error: `Couldn't start the import: {reason}. Try again.` */
export function startErrorText(reason: string) {
  return `Couldn't start the import: ${reason.trim().replace(/\.+$/, '')}. Try again.`;
}

/** The running progress line: `Bulk import: {d} / {n} done`. */
export function progressLine(run: Pick<BulkRunDto, 'done' | 'total'>) {
  return `Bulk import: ${run.done} / ${run.total} done`;
}

export function selectedCountText(s: number) {
  return `${s} selected`;
}

export function importButtonLabel(s: number) {
  return `Import ${s} selected`;
}

export function selectAllLabel(e: number) {
  return `Select all shown (${e})`;
}

// Selection reasons, disabled Import tooltips and the last-result line.

/**
 * Why a card's checkbox is disabled (D-06, UI-SPEC "Ineligible reasons").
 * A failed import has no entry: it is selectable (D-20).
 */
export const ELIGIBILITY_REASON_TEXT: Readonly<
  Record<EligibilityReason, string>
> = {
  orphaned: 'No longer detected. Re-attach it first.',
  not_on_discogs: 'Marked not on Discogs.',
  imported: 'Already in your collection.',
  import_open: 'Already being added.',
  import_held: 'Waiting for your choice on this card.',
  finding: 'Already being added.',
  skipped_duplicate:
    'Already imported from another spine. Open the card to add another copy.',
  searching: 'Still looking it up on Discogs.',
  no_match: 'No match to import yet. Search Discogs on this card first.',
};

export function eligibilityReasonText(reason: EligibilityReason): string {
  return ELIGIBILITY_REASON_TEXT[reason];
}

/** Why Import is disabled, or null when it can open the dialog. */
export function importDisabledReason(x: {
  selected: number;
  connected: boolean;
  needsReconnect: boolean;
  running: boolean;
  /** The server refuses a new run (BulkRunDto.busy, WR-03). */
  busy?: boolean;
}): string | null {
  if (x.selected === 0) return 'Select spines to import first';
  if (x.needsReconnect) return 'Reconnect Discogs in Settings first';
  if (!x.connected) return 'Connect Discogs in Settings first';
  if (x.running) return 'Wait for the current bulk import to finish';
  if (x.busy) return 'Wait for the retried lookup to finish';
  return null;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** `Last bulk import: {a} added · {f} fallbacks · {x} failed`, zeros after added left out. */
export function lastResultLine(
  run: Pick<BulkRunDto, 'added' | 'fallbacks' | 'failed'>,
): string {
  const parts = [`${run.added} added`];
  if (run.fallbacks > 0)
    parts.push(plural(run.fallbacks, 'fallback', 'fallbacks'));
  if (run.failed > 0) parts.push(`${run.failed} failed`);
  return `Last bulk import: ${parts.join(' · ')}`;
}

/** The start-with-skips toast: picks that changed before Start. */
export function startSkipsToast(started: number, skipped: number): string {
  return `Started ${started}. ${skipped} skipped because they changed since you picked them.`;
}

// The batch-finished toast (D-15, UI-SPEC Batch-finished toast).

export type BatchDoneToast = {
  message: string;
  /** Show failed, else Show fallbacks, else no action. */
  action: 'failed' | 'fallbacks' | null;
};

/**
 * `Bulk import done: {a} added to {folder}.` plus each nonzero part. Job-time
 * changed skips get their own part; the UI-SPEC toast has no slot for them.
 */
export function batchDoneToast(run: BulkRunDto): BatchDoneToast {
  let message = `Bulk import done: ${run.added} added to ${run.folderName}.`;
  if (run.fallbacks > 0) message += ` ${run.fallbacks} used another country.`;
  if (run.alreadyInCollection > 0) {
    message += ` ${run.alreadyInCollection} already in your collection.`;
  }
  if (run.duplicates > 0) {
    message += ` ${run.duplicates} skipped as duplicates.`;
  }
  if (run.changed > 0) {
    message += ` ${run.changed} skipped because they changed.`;
  }
  if (run.failed > 0) message += ` ${run.failed} failed.`;
  const action =
    run.failed > 0 ? 'failed' : run.fallbacks > 0 ? 'fallbacks' : null;
  return { message, action };
}

/**
 * True once for a run this browser saw running: it has now finished and
 * was not toasted yet. A run first seen already finished (a reload after
 * it) never toasts; the bar's last-result line covers it.
 */
export function hasRunFinished(
  seenRunning: ReadonlySet<string>,
  toasted: ReadonlySet<string>,
  run: BulkRunDto | null,
): boolean {
  return (
    run !== null &&
    !run.running &&
    seenRunning.has(run.id) &&
    !toasted.has(run.id)
  );
}
