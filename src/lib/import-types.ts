// Import contracts shared by the schema, the add_to_collection handler, the
// routes and client components (Phase 4, D-07). Client-safe: no server-only
// import here.
import type { CandidateFormat } from './discogs-types';

/**
 * Where one import stands (D-07). pending: confirmed, job waiting.
 * importing: the intent is written and a POST may have been sent.
 * imported: the Discogs instance id is recorded. already_in_collection: the
 * release already has a copy the app did not record; the owner chooses
 * (D-05). failed: the last attempt ended with an error.
 */
export const IMPORT_STATUSES = [
  'pending',
  'importing',
  'imported',
  'already_in_collection',
  'failed',
] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

/** Why an import failed (D-09). Stored in imports.error_kind. */
export const IMPORT_ERROR_KINDS = [
  'auth',
  'not_found',
  'rejected',
  'unavailable',
  'interrupted',
  'removed',
  'other',
] as const;
export type ImportErrorKind = (typeof IMPORT_ERROR_KINDS)[number];

/** One copy of a release already in the owner's collection. */
export type ExistingInstance = {
  instanceId: number;
  folderId: number;
  /** Discogs date_added, verbatim (ISO 8601 with an offset). */
  dateAdded: string;
};

/**
 * The confirmed candidate as it was when the owner confirmed it, stored in
 * imports.candidate_json so the confirmed match keeps its details if a later
 * search replaces the candidate row.
 */
export type ImportCandidateSnapshot = {
  title: string;
  year: number | null;
  country: string | null;
  labels: string[];
  catno: string | null;
  formats: CandidateFormat[];
};
