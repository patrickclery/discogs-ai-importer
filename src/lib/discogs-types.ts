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

/** Candidates shown inline on a spine card; Show all loads the rest. */
export const INLINE_CANDIDATES = 3;

/**
 * Where a spine's Discogs lookup stands (D-11), from its latest auto or
 * again search and that search's job. done means at least one candidate.
 */
export type SearchState =
  | 'not_searched'
  | 'queued'
  | 'searching'
  | 'done'
  | 'no_match'
  | 'failed';

/** Why the latest search failed: unavailable and auth have fixed copy. */
export type SearchFailure = {
  kind: 'unavailable' | 'auth' | 'other';
  /** A short stored reason, only for kind 'other' (may be null). */
  reason: string | null;
};

/** One stored candidate release, as the card shows it (DISC-04). */
export type CandidateDto = {
  id: string;
  releaseId: number;
  /** Discogs' combined "Artist - Title", verbatim. */
  title: string;
  year: number | null;
  country: string | null;
  labels: string[];
  catno: string | null;
  formats: CandidateFormat[];
  /** A cover is stored; GET /api/discogs/thumb/{id} serves it. */
  hasThumb: boolean;
  source: CandidateSource;
  catnoMatch: boolean;
  stage: SearchStage | null;
};

/** A spine's search summary in the /spines read model. */
export type SpineDiscogsDto = {
  state: SearchState;
  /** Every stored candidate, auto and manual, deduped by release. */
  candidateCount: number;
  /** The first INLINE_CANDIDATES candidates in D-10 order. */
  topCandidates: CandidateDto[];
  failure: SearchFailure | null;
  /**
   * The current artist, title, catalog number or raw text normalize to
   * different inputs than the latest auto or again search used (D-14).
   * False for a never-searched spine.
   */
  fieldsChanged: boolean;
};

/** GET /api/spines/{id}/candidates: the full ordered list. */
export type CandidatesResponse = { candidates: CandidateDto[] };
