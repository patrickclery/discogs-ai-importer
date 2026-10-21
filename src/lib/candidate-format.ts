// Display helpers for a stored Discogs candidate (UI-SPEC CandidateRow).
// Client-safe. Discogs strings are joined as plain text, never re-cased.
import type {
  CandidateDto,
  CandidateFormat,
  SearchFailure,
} from './discogs-types';

export const NO_DETAILS = 'No details on Discogs';

/** Labels shown before "+{k} more". */
const MAX_LABELS = 2;

function present(s: string | null | undefined): s is string {
  return typeof s === 'string' && s.trim() !== '';
}

/** Deduped labels, at most two, then ` +{k} more`. */
export function labelsText(labels: readonly string[]): string | null {
  const unique = [...new Set(labels.filter(present))];
  if (unique.length === 0) return null;
  const shown = unique.slice(0, MAX_LABELS).join(', ');
  const rest = unique.length - MAX_LABELS;
  return rest > 0 ? `${shown} +${rest} more` : shown;
}

/** `{qty>1 ? qty×}{name}` then its descriptions: `2×CD, Compilation`. */
export function formatText(formats: readonly CandidateFormat[]): string | null {
  const f = formats[0];
  if (!f || !present(f.name)) return null;
  const qty = Number.parseInt(f.qty ?? '', 10);
  const head = `${Number.isFinite(qty) && qty > 1 ? `${qty}×` : ''}${f.name}`;
  return [head, ...f.descriptions.filter(present)].join(', ');
}

/** `{year} · {country} · {labels} · {catno} · {format}`, missing parts dropped. */
export function detailsLine(
  c: Pick<CandidateDto, 'year' | 'country' | 'labels' | 'catno' | 'formats'>,
): string {
  const parts = [
    c.year && c.year > 0 ? String(c.year) : null,
    present(c.country) ? c.country : null,
    labelsText(c.labels),
    present(c.catno) ? c.catno : null,
    formatText(c.formats),
  ].filter(present);
  return parts.length > 0 ? parts.join(' · ') : NO_DETAILS;
}

/** UI-SPEC "Search failed reasons" for the matches section's notice line. */
export function searchFailureText(failure: SearchFailure | null): string {
  if (failure?.kind === 'unavailable') {
    return "Search failed: Discogs didn't respond. Retry the search.";
  }
  if (failure?.kind === 'auth') {
    return 'Search failed: Discogs rejected the connection. Reconnect Discogs in Settings.';
  }
  const reason =
    failure?.reason?.trim().replace(/[.\s]+$/u, '') || 'something went wrong';
  return `Search failed: ${reason}. Retry the search.`;
}
