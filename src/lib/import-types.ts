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

/**
 * The review status filter (D-10, REV-03), in filter-bar order. Plan 04-05
 * computes it per spine; the labels are the filter items' text.
 */
export const REVIEW_STATUSES = [
  'pending',
  'matched',
  'imported',
  'not_found',
  'not_on_discogs',
  'failed',
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: 'Pending',
  matched: 'Matched',
  imported: 'Imported',
  not_found: 'Not found',
  not_on_discogs: 'Not on Discogs',
  failed: 'Failed',
};

/**
 * What the card shows for an import (UI-SPEC status-slot badge and
 * confirmed-match panel). Derived from the row status and its job's status
 * by importPhaseOf.
 */
export type ImportPhase =
  | 'waiting'
  | 'importing'
  | 'already_in_collection'
  | 'imported'
  | 'failed';

export type ImportFailure = {
  kind: ImportErrorKind;
  /** Only for kind other: the stored message, at most 160 characters. */
  reason: string | null;
};

/** A spine's latest import on GET /api/spines (spine.import). */
export type ImportDto = {
  id: string;
  phase: ImportPhase;
  releaseId: number;
  /** The confirmed candidate, or null once a re-search replaced it. */
  candidateId: string | null;
  /** The candidate as it was when confirmed, or null when unreadable. */
  candidate: ImportCandidateSnapshot | null;
  /** The confirmed candidate still exists and has a thumbnail. */
  hasThumb: boolean;
  /** The folder this import used (D-03); each import keeps its own. */
  folderId: number;
  folderName: string;
  /** The Discogs copy number once imported (IMP-04). */
  instanceId: number | null;
  /** "Link existing copy" recorded an existing copy (D-05). */
  linked: boolean;
  /** Reconciled after an ambiguous POST (D-07). */
  adopted: boolean;
  importedAt: number | null;
  /** The copies already held, for already_in_collection (D-05). */
  existing: {
    count: number;
    folderId: number;
    folderName: string;
    /** Discogs date_added of the first held copy, verbatim. */
    dateAdded: string;
  } | null;
  failure: ImportFailure | null;
  canChangeMatch: boolean;
  canRetry: boolean;
};

/**
 * 409 body when the release is already going into the collection from
 * another spine (D-04, IMP-03). Plan 04-04 returns it.
 */
export type DuplicateBody = {
  error: 'duplicate';
  message: string;
  /** The other spine's photo file name. */
  photo: string;
  /** The other spine's number on its photo (#n). */
  spineNumber: number;
  cropUrl: string | null;
  /** The other spine's import already finished. */
  done: boolean;
};

/**
 * The phase of an import (D-07). A pending or importing import whose job
 * failed, was cancelled or is missing reads as failed (RESEARCH Pitfall 4
 * read-model defence): no card stays Importing after the worker gave up.
 */
export function importPhaseOf(input: {
  status: ImportStatus;
  intentAt: number | null;
  jobStatus: string | null;
}): ImportPhase {
  const { status, jobStatus } = input;
  if (
    status === 'imported' ||
    status === 'already_in_collection' ||
    status === 'failed'
  ) {
    return status;
  }
  if (
    jobStatus === null ||
    jobStatus === 'failed' ||
    jobStatus === 'cancelled'
  ) {
    return 'failed';
  }
  if (status === 'importing' || jobStatus === 'running') return 'importing';
  return 'waiting';
}

/**
 * Change match is safe only when nothing can have reached Discogs (UI-SPEC
 * Change match rule, D-02): a waiting import with no intent and a queued
 * job, an already_in_collection hold with no intent, or a failed import
 * with no intent or one Discogs refused (not_found, rejected).
 */
export function canChangeMatchOf(input: {
  phase: ImportPhase;
  intentAt: number | null;
  errorKind: string | null;
  jobStatus: string | null;
}): boolean {
  const { phase, intentAt, errorKind, jobStatus } = input;
  switch (phase) {
    case 'waiting':
      return intentAt === null && jobStatus === 'queued';
    case 'already_in_collection':
      return intentAt === null;
    case 'failed':
      return (
        intentAt === null ||
        errorKind === 'not_found' ||
        errorKind === 'rejected'
      );
    default:
      return false;
  }
}

/** Retry import is offered for a failed import only (REV-04). */
export function canRetryOf(phase: ImportPhase): boolean {
  return phase === 'failed';
}
