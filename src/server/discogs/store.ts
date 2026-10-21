import 'server-only';
import type Database from 'better-sqlite3';
import type {
  SearchKind,
  SearchStage,
  SearchStatus,
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
