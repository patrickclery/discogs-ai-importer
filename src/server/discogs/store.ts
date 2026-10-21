import 'server-only';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import {
  SEARCH_STAGES,
  type SearchKind,
  type SearchStage,
  type SearchStatus,
} from '@/lib/discogs-types';
import { newId } from '../ids';
import type { SearchInputs } from './inputs';
import type { Candidate } from './search';

// discogs_searches and discogs_candidates writes (D-10, D-16). Raw SQL with
// @named parameters only and single-quoted literals (DQS=0, T-03-18).

export type SearchRowRaw = {
  id: string;
  spine_id: string;
  kind: SearchKind;
  input_hash: string | null;
  inputs_json: string;
  query_text: string | null;
  release_id: number | null;
  status: SearchStatus;
  stage: SearchStage | null;
  result_count: number | null;
  total_count: number | null;
  results_json: string | null;
  error_kind: string | null;
  error: string | null;
  job_id: string | null;
  created_at: number;
  finished_at: number | null;
};

const ERROR_MAX = 1000;

/**
 * WR-01: the one baseline rule. A spine's baseline search is its newest auto
 * or again search whose status is NOT IN this list: those never reached
 * Discogs and released their dedupe key (A-03-27, CR-01). The enqueue, the
 * backfill and fieldsChanged all use it, so they cannot disagree.
 */
export const NON_BASELINE_STATUSES_SQL =
  "('not_connected', 'auth_failed', 'skipped')";

export function createSearch(
  db: Database.Database,
  input: {
    spineId: string;
    kind: SearchKind;
    inputs: SearchInputs;
    inputHash: string | null;
    queryText?: string | null;
    releaseId?: number | null;
  },
): string {
  const id = newId();
  db.prepare(
    `INSERT INTO discogs_searches (id, spine_id, kind, input_hash, inputs_json,
       query_text, release_id, status, created_at)
     VALUES (@id, @spineId, @kind, @inputHash, @inputsJson, @queryText,
       @releaseId, 'queued', @now)`,
  ).run({
    id,
    spineId: input.spineId,
    kind: input.kind,
    inputHash: input.inputHash,
    inputsJson: JSON.stringify(input.inputs),
    queryText: input.queryText ?? null,
    releaseId: input.releaseId ?? null,
    now: Date.now(),
  });
  return id;
}

export function setSearchJob(
  db: Database.Database,
  searchId: string,
  jobId: string,
): void {
  db.prepare(
    'UPDATE discogs_searches SET job_id = @jobId WHERE id = @searchId',
  ).run({ jobId, searchId });
}

export function getSearch(
  db: Database.Database,
  searchId: string,
): SearchRowRaw | undefined {
  return db
    .prepare('SELECT * FROM discogs_searches WHERE id = @searchId')
    .get({ searchId }) as SearchRowRaw | undefined;
}

/**
 * Moves a queued search to a terminal status and stamps finished_at.
 * Returns false when it was already finished (idempotent replay).
 */
export function finishSearch(
  db: Database.Database,
  searchId: string,
  out: {
    status: Exclude<SearchStatus, 'queued'>;
    stage?: SearchStage | null;
    resultCount?: number | null;
    totalCount?: number | null;
    resultsJson?: string | null;
    errorKind?: string | null;
    error?: string | null;
  },
): boolean {
  const res = db
    .prepare(
      `UPDATE discogs_searches
       SET status = @status, stage = @stage, result_count = @resultCount,
         total_count = @totalCount, results_json = @resultsJson,
         error_kind = @errorKind, error = @error, finished_at = @now
       WHERE id = @searchId AND status = 'queued'`,
    )
    .run({
      searchId,
      status: out.status,
      stage: out.stage ?? null,
      resultCount: out.resultCount ?? null,
      totalCount: out.totalCount ?? null,
      resultsJson: out.resultsJson ?? null,
      errorKind: out.errorKind ?? null,
      error: out.error ? out.error.slice(0, ERROR_MAX) : null,
      now: Date.now(),
    });
  return res.changes === 1;
}

/** A retryable failure: the error is kept, the status stays queued. */
export function recordSearchError(
  db: Database.Database,
  searchId: string,
  err: { errorKind: string; error: string },
): void {
  db.prepare(
    `UPDATE discogs_searches SET error_kind = @errorKind, error = @error
     WHERE id = @searchId AND status = 'queued'`,
  ).run({
    searchId,
    errorKind: err.errorKind,
    error: err.error.slice(0, ERROR_MAX),
  });
}

/**
 * Replaces the spine's auto candidates with this search's, in one
 * transaction; manual candidates are never touched (D-16).
 */
export function replaceAutoCandidates(
  db: Database.Database,
  input: {
    spineId: string;
    searchId: string;
    stage: SearchStage | null;
    candidates: Candidate[];
  },
): void {
  const insert = db.prepare(
    `INSERT INTO discogs_candidates (id, spine_id, search_id, source,
       release_id, rank, title, artist, year, country, labels_json, catno,
       formats_json, thumb_url, master_id, stage, catno_match, created_at)
     VALUES (@id, @spineId, @searchId, 'auto', @releaseId, @rank, @title,
       @artist, @year, @country, @labelsJson, @catno, @formatsJson, @thumbUrl,
       @masterId, @stage, @catnoMatch, @now)
     ON CONFLICT(spine_id, source, release_id) DO NOTHING`,
  );
  const tx = db.transaction(() => {
    db.prepare(
      `DELETE FROM discogs_candidates
       WHERE spine_id = @spineId AND source = 'auto'`,
    ).run({ spineId: input.spineId });
    const now = Date.now();
    for (const c of input.candidates) {
      insert.run({
        id: newId(),
        spineId: input.spineId,
        searchId: input.searchId,
        releaseId: c.releaseId,
        rank: c.rank,
        title: c.title,
        artist: c.artist,
        year: c.year,
        country: c.country,
        labelsJson: JSON.stringify(c.labels),
        catno: c.catno,
        formatsJson: JSON.stringify(c.formats),
        thumbUrl: c.thumbUrl,
        masterId: c.masterId,
        stage: input.stage ?? c.stage,
        catnoMatch: c.catnoMatch ? 1 : 0,
        now,
      });
    }
  });
  tx();
}

/** The newest auto or again search for a spine (the D-08 / D-14 baseline). */
export function latestAutoSearch(
  db: Database.Database,
  spineId: string,
): SearchRowRaw | undefined {
  return db
    .prepare(
      `SELECT * FROM discogs_searches
       WHERE spine_id = @spineId AND kind IN ('auto', 'again')
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
    .get({ spineId }) as SearchRowRaw | undefined;
}

const StoredFormat = z.object({
  name: z.string(),
  qty: z.string().nullable(),
  descriptions: z.array(z.string()),
  text: z.string().nullable(),
});

/** One entry of results_json, as the search handlers stored it. */
const StoredCandidate = z.object({
  releaseId: z.number().int().positive(),
  rank: z.number().int(),
  title: z.string(),
  artist: z.string().nullable(),
  year: z.number().int().nullable(),
  country: z.string().nullable(),
  labels: z.array(z.string()),
  catno: z.string().nullable(),
  formats: z.array(StoredFormat),
  thumbUrl: z.string().nullable(),
  masterId: z.number().int().nullable(),
  stage: z.enum(SEARCH_STAGES),
  catnoMatch: z.boolean(),
});

/**
 * A search row's stored results in their stored order. An unreadable entry
 * is dropped, and an unreadable list is empty.
 */
export function parseStoredResults(json: string | null): Candidate[] {
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: Candidate[] = [];
  for (const item of raw) {
    const c = StoredCandidate.safeParse(item);
    if (c.success) out.push(c.data);
  }
  return out;
}

export type AddManualResult =
  | { status: 'ok'; candidateId: string }
  /** No such search, a search of another spine, or an automatic one. */
  | { status: 'search_not_found' }
  /** The search has not finished with results. */
  | { status: 'not_done' }
  /** The release is not among that search's stored results. */
  | { status: 'release_not_found' };

/**
 * Pins a release the owner picked in the Search Discogs dialog as a manual
 * candidate (D-15, D-16). The browser sends only { searchId, releaseId }:
 * the candidate is copied from that spine's own done manual or release
 * search, never from the request (RESEARCH anti-pattern, T-03-31).
 * Re-adding the same release refreshes its fields, search_id and
 * created_at, so it moves to the top. Automatic searches never touch
 * manual rows (replaceAutoCandidates deletes source 'auto' only).
 */
export function addManualCandidate(
  db: Database.Database,
  input: { spineId: string; searchId: string; releaseId: number },
): AddManualResult {
  const tx = db.transaction((): AddManualResult => {
    const search = getSearch(db, input.searchId);
    if (
      !search ||
      search.spine_id !== input.spineId ||
      (search.kind !== 'manual' && search.kind !== 'release')
    ) {
      return { status: 'search_not_found' };
    }
    if (search.status !== 'done') return { status: 'not_done' };
    const c = parseStoredResults(search.results_json).find(
      (r) => r.releaseId === input.releaseId,
    );
    if (!c) return { status: 'release_not_found' };
    db.prepare(
      `INSERT INTO discogs_candidates (id, spine_id, search_id, source,
         release_id, rank, title, artist, year, country, labels_json, catno,
         formats_json, thumb_url, master_id, stage, catno_match, created_at)
       VALUES (@id, @spineId, @searchId, 'manual', @releaseId, 0, @title,
         @artist, @year, @country, @labelsJson, @catno, @formatsJson,
         @thumbUrl, @masterId, @stage, 0, @now)
       ON CONFLICT(spine_id, source, release_id) DO UPDATE SET
         search_id = excluded.search_id, title = excluded.title,
         artist = excluded.artist, year = excluded.year,
         country = excluded.country, labels_json = excluded.labels_json,
         catno = excluded.catno, formats_json = excluded.formats_json,
         thumb_url = excluded.thumb_url, master_id = excluded.master_id,
         stage = excluded.stage, created_at = excluded.created_at`,
    ).run({
      id: newId(),
      spineId: input.spineId,
      searchId: input.searchId,
      releaseId: c.releaseId,
      title: c.title,
      artist: c.artist,
      year: c.year,
      country: c.country,
      labelsJson: JSON.stringify(c.labels),
      catno: c.catno,
      formatsJson: JSON.stringify(c.formats),
      thumbUrl: c.thumbUrl,
      masterId: c.masterId,
      stage: c.stage,
      now: Date.now(),
    });
    const row = db
      .prepare(
        `SELECT id FROM discogs_candidates
         WHERE spine_id = @spineId AND source = 'manual'
           AND release_id = @releaseId`,
      )
      .get({ spineId: input.spineId, releaseId: c.releaseId }) as {
      id: string;
    };
    return { status: 'ok', candidateId: row.id };
  });
  return tx.immediate();
}
