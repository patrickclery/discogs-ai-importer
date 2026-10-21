// Discogs search and candidate constants shared by the server, routes and
// client components. Client-safe: no server-only import here.

/**
 * What started a search row. auto: a finished scan or the connect backfill
 * (deduped by input hash). again: the owner's Search again or Retry.
 * manual: free text from the Search Discogs dialog. release: a pasted
 * release URL or id.
 */
export const SEARCH_KINDS = ['auto', 'again', 'manual', 'release'] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

/** queued until the handler finishes it; every other value is terminal. */
export const SEARCH_STATUSES = [
  'queued',
  'done',
  'no_match',
  'not_found',
  'failed',
  'auth_failed',
  'not_connected',
  'skipped',
] as const;
export type SearchStatus = (typeof SEARCH_STATUSES)[number];

/** The cascade stage that found a result (D-09), or a pasted release. */
export const SEARCH_STAGES = [
  'catno',
  'artist_title',
  'text',
  'release',
] as const;
export type SearchStage = (typeof SEARCH_STAGES)[number];

export const CANDIDATE_SOURCES = ['auto', 'manual'] as const;
export type CandidateSource = (typeof CANDIDATE_SOURCES)[number];

/** One entry of a Discogs release's formats list. */
export type CandidateFormat = {
  name: string;
  qty: string | null;
  descriptions: string[];
  text: string | null;
};
