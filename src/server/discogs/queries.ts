import 'server-only';
import type Database from 'better-sqlite3';
import {
  CANDIDATE_SOURCES,
  type CandidateDto,
  type CandidateFormat,
  type CandidateSource,
  INLINE_CANDIDATES,
  SEARCH_STAGES,
  type SearchFailure,
  type SearchStage,
  type SearchState,
  type SearchStatus,
  type SpineDiscogsDto,
} from '@/lib/discogs-types';
import { getDiscogsAuth } from './auth';
import { discogsGate } from './gate';
import { capCodePoints } from './inputs';

// The Discogs half of the /spines read model (D-10, D-11, D-12, RESEARCH
// Pattern 5). Two queries per page, whatever the spine count: the latest
// auto or again search per spine with its job status, and the spines'
// candidates. Raw SQL with @named parameters and single-quoted literals.

/** Owner-facing failure reasons are cut to this many code points (UI-SPEC). */
const REASON_MAX = 160;

/** A search row still queued while its job already succeeded (A-03-15). */
export const ENDED_WITHOUT_RESULT = 'the search ended without a result';

const LATEST_SQL = `
  WITH latest AS (
    SELECT s.spine_id, s.status, s.error_kind, s.error, s.job_id,
      ROW_NUMBER() OVER (
        PARTITION BY s.spine_id ORDER BY s.created_at DESC, s.id DESC
      ) AS rn
    FROM discogs_searches s
    WHERE s.kind IN ('auto', 'again')
      AND s.spine_id IN (SELECT value FROM json_each(@ids))
  )
  SELECT l.spine_id, l.status, l.error_kind, l.error, j.status AS job_status
  FROM latest l
  LEFT JOIN jobs j ON j.id = l.job_id
  WHERE l.rn = 1`;

const CANDIDATE_COLUMNS = `c.id, c.spine_id, c.source, c.release_id, c.rank,
  c.title, c.year, c.country, c.labels_json, c.catno, c.formats_json,
  c.thumb_url, c.stage, c.catno_match, c.created_at`;

const CANDIDATES_SQL = `
  SELECT ${CANDIDATE_COLUMNS}
  FROM discogs_candidates c
  WHERE c.spine_id IN (SELECT value FROM json_each(@ids))`;

const SPINE_CANDIDATES_SQL = `
  SELECT ${CANDIDATE_COLUMNS}
  FROM discogs_candidates c
  WHERE c.spine_id = @spineId`;

export type LatestSearchRow = {
  status: SearchStatus;
  error_kind: string | null;
  error: string | null;
  /** jobs.status of the search's job, or null when it has none. */
  job_status: string | null;
};

type CandidateRowRaw = {
  id: string;
  spine_id: string;
  source: string;
  release_id: number;
  rank: number;
  title: string;
  year: number | null;
  country: string | null;
  labels_json: string;
  catno: string | null;
  formats_json: string;
  thumb_url: string | null;
  stage: string | null;
  catno_match: number;
  created_at: number;
};

function shortReason(error: string | null): string | null {
  const s = error?.trim();
  return s ? capCodePoints(s, REASON_MAX) : null;
}

function failureFrom(row: LatestSearchRow): SearchFailure {
  if (row.error_kind === 'unavailable') {
    return { kind: 'unavailable', reason: null };
  }
  return { kind: 'other', reason: shortReason(row.error) };
}

/**
 * D-11 search state of a spine from its latest auto or again search (null
 * when it has none) and its stored candidate count. Not connected and
 * skipped searches read as not searched. Candidates already stored (a
 * manual add, or an earlier search) win over not searched and no matches.
 */
export function searchStateOf(
  latest: LatestSearchRow | null,
  candidateCount: number,
): { state: SearchState; failure: SearchFailure | null } {
  let state: SearchState;
  let failure: SearchFailure | null = null;
  switch (latest?.status ?? null) {
    case null:
    case 'not_connected':
    case 'skipped':
      state = 'not_searched';
      break;
    case 'queued':
      switch (latest?.job_status ?? null) {
        case 'running':
          state = 'searching';
          break;
        case 'failed':
          state = 'failed';
          failure = latest ? failureFrom(latest) : null;
          break;
        case 'succeeded':
          state = 'failed';
          failure = { kind: 'other', reason: ENDED_WITHOUT_RESULT };
          break;
        default:
          // Job queued, or not linked yet (same transaction).
          state = 'queued';
      }
      break;
    case 'done':
      state = 'done';
      break;
    case 'failed':
      state = 'failed';
      failure = latest ? failureFrom(latest) : null;
      break;
    case 'auth_failed':
      state = 'failed';
      failure = { kind: 'auth', reason: null };
      break;
    default:
      // no_match, and not_found (a release lookup's status).
      state = 'no_match';
  }
  if (
    candidateCount > 0 &&
    (state === 'not_searched' || state === 'no_match')
  ) {
    state = 'done';
  }
  if (candidateCount === 0 && state === 'done') state = 'no_match';
  return { state, failure };
}

function parseLabels(json: string): string[] {
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string')
      : [];
  } catch {
    return [];
  }
}

function parseFormats(json: string): CandidateFormat[] {
  try {
    const v: unknown = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    const out: CandidateFormat[] = [];
    for (const f of v) {
      if (!f || typeof f !== 'object') continue;
      const o = f as Record<string, unknown>;
      if (typeof o.name !== 'string') continue;
      out.push({
        name: o.name,
        qty: typeof o.qty === 'string' ? o.qty : null,
        descriptions: Array.isArray(o.descriptions)
          ? o.descriptions.filter((d): d is string => typeof d === 'string')
          : [],
        text: typeof o.text === 'string' ? o.text : null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function toCandidateDto(r: CandidateRowRaw): CandidateDto {
  return {
    id: r.id,
    releaseId: r.release_id,
    title: r.title,
    year: r.year,
    country: r.country,
    labels: parseLabels(r.labels_json),
    catno: r.catno,
    formats: parseFormats(r.formats_json),
    hasThumb: r.thumb_url !== null,
    source: (CANDIDATE_SOURCES as readonly string[]).includes(r.source)
      ? (r.source as CandidateSource)
      : 'auto',
    catnoMatch: r.catno_match === 1,
    stage: (SEARCH_STAGES as readonly (string | null)[]).includes(r.stage)
      ? (r.stage as SearchStage)
      : null,
  };
}

/**
 * D-10 order: manual candidates newest first, then exact-catno matches,
 * then Discogs order. Deduped by release id; a manual row wins, so a
 * release both added manually and found automatically shows once.
 */
function orderCandidates(rows: readonly CandidateRowRaw[]): CandidateDto[] {
  const manual = rows
    .filter((r) => r.source === 'manual')
    .sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? 1 : -1));
  const auto = rows
    .filter((r) => r.source !== 'manual')
    .sort(
      (a, b) =>
        b.catno_match - a.catno_match ||
        a.rank - b.rank ||
        (a.id < b.id ? -1 : 1),
    );
  const seen = new Set<number>();
  const out: CandidateDto[] = [];
  for (const r of [...manual, ...auto]) {
    if (seen.has(r.release_id)) continue;
    seen.add(r.release_id);
    out.push(toCandidateDto(r));
  }
  return out;
}

/**
 * The search summary of each given spine (state, candidate count, top 3
 * candidates, failure), keyed by spine id. Spines without searches or
 * candidates get a not-searched summary.
 */
export function discogsForSpines(
  db: Database.Database,
  spines: readonly { id: string }[],
): Map<string, SpineDiscogsDto> {
  const out = new Map<string, SpineDiscogsDto>();
  if (spines.length === 0) return out;
  const ids = JSON.stringify(spines.map((s) => s.id));
  const latest = new Map<string, LatestSearchRow>();
  for (const r of db.prepare(LATEST_SQL).all({ ids }) as (LatestSearchRow & {
    spine_id: string;
  })[]) {
    latest.set(r.spine_id, r);
  }
  const bySpine = new Map<string, CandidateRowRaw[]>();
  for (const r of db
    .prepare(CANDIDATES_SQL)
    .all({ ids }) as CandidateRowRaw[]) {
    const list = bySpine.get(r.spine_id);
    if (list) list.push(r);
    else bySpine.set(r.spine_id, [r]);
  }
  for (const { id } of spines) {
    const candidates = orderCandidates(bySpine.get(id) ?? []);
    const { state, failure } = searchStateOf(
      latest.get(id) ?? null,
      candidates.length,
    );
    out.set(id, {
      state,
      candidateCount: candidates.length,
      topCandidates: candidates.slice(0, INLINE_CANDIDATES),
      failure,
    });
  }
  return out;
}

/** Every stored candidate of one spine, in D-10 order, deduped. */
export function listCandidates(
  db: Database.Database,
  spineId: string,
): CandidateDto[] {
  return orderCandidates(
    db.prepare(SPINE_CANDIDATES_SQL).all({ spineId }) as CandidateRowRaw[],
  );
}

/** True when any summary is queued or searching (the 3 s poll, Pitfall 4). */
export function anyDiscogsActive(
  summaries: Iterable<SpineDiscogsDto>,
): boolean {
  for (const s of summaries) {
    if (s.state === 'queued' || s.state === 'searching') return true;
  }
  return false;
}

/**
 * Connected and pause state for /spines. A secrets file that cannot be read
 * means not connected, never a 500 (as in GET /api/status).
 */
export function discogsConnection(): {
  connected: boolean;
  pausedUntil: number | null;
} {
  let connected = false;
  try {
    connected = getDiscogsAuth() !== null;
  } catch {
    connected = false;
  }
  return { connected, pausedUntil: discogsGate().pausedUntil() };
}
