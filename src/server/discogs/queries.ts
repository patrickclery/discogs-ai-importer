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
import { getDiscogsAuth, isAuthInvalid } from './auth';
import { discogsGate } from './gate';
import {
  capCodePoints,
  type FieldValues,
  inputHash,
  searchInputs,
} from './inputs';
import { NON_BASELINE_STATUSES_SQL, UNSEARCHED_STATUSES } from './store';

// The Discogs half of the /spines read model (D-10, D-11, D-12, RESEARCH
// Pattern 5). Three queries per page, whatever the spine count: the latest
// auto or again search per spine with its job status, the spines'
// candidates, and their search fields (for fieldsChanged, D-14). Raw SQL with @named parameters and single-quoted literals.

/** Owner-facing failure reasons are cut to this many code points (UI-SPEC). */
const REASON_MAX = 160;

/** A search row still queued while its job already succeeded (A-03-15). */
export const ENDED_WITHOUT_RESULT = 'the search ended without a result';

const LATEST_SQL = `
  WITH latest AS (
    SELECT s.spine_id, s.status, s.error_kind, s.error, s.job_id,
      s.input_hash,
      ROW_NUMBER() OVER (
        PARTITION BY s.spine_id ORDER BY s.created_at DESC, s.id DESC
      ) AS rn
    FROM discogs_searches s
    WHERE s.kind IN ('auto', 'again')
      AND s.spine_id IN (SELECT value FROM json_each(@ids))
  ),
  baseline AS (
    SELECT s.spine_id, s.input_hash, s.status, s.error_kind, s.error,
      s.job_id,
      ROW_NUMBER() OVER (
        PARTITION BY s.spine_id ORDER BY s.created_at DESC, s.id DESC
      ) AS rn
    FROM discogs_searches s
    WHERE s.kind IN ('auto', 'again')
      AND s.status NOT IN ${NON_BASELINE_STATUSES_SQL}
      AND s.spine_id IN (SELECT value FROM json_each(@ids))
  )
  SELECT l.spine_id, l.status, l.error_kind, l.error, l.input_hash,
    b.input_hash AS baseline_hash, j.status AS job_status,
    b.status AS baseline_status, b.error_kind AS baseline_error_kind,
    b.error AS baseline_error, bj.status AS baseline_job_status
  FROM latest l
  LEFT JOIN baseline b ON b.spine_id = l.spine_id AND b.rn = 1
  LEFT JOIN jobs j ON j.id = l.job_id
  LEFT JOIN jobs bj ON bj.id = b.job_id
  WHERE l.rn = 1`;

const CANDIDATE_COLUMNS = `c.id, c.spine_id, c.source, c.release_id, c.rank,
  c.title, c.year, c.country, c.labels_json, c.catno, c.formats_json,
  c.thumb_url, c.stage, c.catno_match, c.created_at`;

const CANDIDATES_SQL = `
  SELECT ${CANDIDATE_COLUMNS}
  FROM discogs_candidates c
  WHERE c.spine_id IN (SELECT value FROM json_each(@ids))`;

const FIELDS_SQL = `
  SELECT f.spine_id, f.field, f.value
  FROM spine_fields f
  WHERE f.spine_id IN (SELECT value FROM json_each(@ids))
    AND f.field IN ('artist', 'title', 'catalog_number', 'raw_text')`;

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
  /** The search's normalized inputs hash (auto and again always have one). */
  input_hash?: string | null;
  /**
   * The input hash of the spine's baseline search (WR-01: the newest auto
   * or again search not in NON_BASELINE_STATUSES_SQL), or null for none.
   */
  baseline_hash?: string | null;
  /** The baseline search's status, error and job status (CR-01). */
  baseline_status?: SearchStatus | null;
  baseline_error_kind?: string | null;
  baseline_error?: string | null;
  baseline_job_status?: string | null;
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
 * D-14: the spine's baseline search used other inputs than its current
 * fields. Hashing goes through the same normalize function as the enqueue
 * (inputs.ts), so a whitespace-only edit is no change. The baseline is the
 * same one the enqueue uses (WR-01, NON_BASELINE_STATUSES_SQL): searches that
 * never reached Discogs (not connected, auth failed, skipped) are skipped
 * over, and with no baseline there are no matches to be out of date.
 */
export function fieldsChangedSince(
  latest: Pick<LatestSearchRow, 'baseline_hash'> | null,
  fields: FieldValues,
): boolean {
  if (!latest?.baseline_hash) return false;
  return latest.baseline_hash !== inputHash(searchInputs(fields));
}

/**
 * CR-01, D-11: the search the card state comes from. When the latest search
 * never reached Discogs (UNSEARCHED_STATUSES) but the baseline already
 * searched exactly the current inputs, no automatic search will ever be
 * queued again, so the card shows the baseline's real outcome instead of
 * not searched. The hash goes through the enqueue's normalization, so a
 * whitespace-only difference counts as covered. Otherwise the latest.
 */
export function effectiveSearch(
  latest: LatestSearchRow | null,
  fields: FieldValues,
): LatestSearchRow | null {
  if (
    !latest ||
    !(UNSEARCHED_STATUSES as readonly SearchStatus[]).includes(latest.status)
  ) {
    return latest;
  }
  if (!latest.baseline_status || !latest.baseline_hash) return latest;
  if (latest.baseline_hash !== inputHash(searchInputs(fields))) return latest;
  return {
    status: latest.baseline_status,
    error_kind: latest.baseline_error_kind ?? null,
    error: latest.baseline_error ?? null,
    job_status: latest.baseline_job_status ?? null,
    input_hash: latest.baseline_hash,
    baseline_hash: latest.baseline_hash,
  };
}

/**
 * D-11 search state of a spine from its latest auto or again search (null
 * when it has none) and its stored candidate count. A search that never
 * reached Discogs (UNSEARCHED_STATUSES, the shared rule) reads as not
 * searched. Candidates already stored (a
 * manual add, or an earlier search) win over not searched and no matches.
 */
export function searchStateOf(
  latest: LatestSearchRow | null,
  candidateCount: number,
): { state: SearchState; failure: SearchFailure | null } {
  let state: SearchState;
  let failure: SearchFailure | null = null;
  const status = latest?.status ?? null;
  const unsearched =
    status === null ||
    (UNSEARCHED_STATUSES as readonly SearchStatus[]).includes(status);
  switch (unsearched ? null : status) {
    case null:
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
  const fields = new Map<string, FieldValues>();
  for (const r of db.prepare(FIELDS_SQL).all({ ids }) as {
    spine_id: string;
    field: keyof FieldValues;
    value: string | null;
  }[]) {
    const f = fields.get(r.spine_id) ?? {};
    f[r.field] = r.value;
    fields.set(r.spine_id, f);
  }
  for (const { id } of spines) {
    const candidates = orderCandidates(bySpine.get(id) ?? []);
    const last = latest.get(id) ?? null;
    const spineFields = fields.get(id) ?? {};
    const { state, failure } = searchStateOf(
      effectiveSearch(last, spineFields),
      candidates.length,
    );
    out.set(id, {
      state,
      candidateCount: candidates.length,
      topCandidates: candidates.slice(0, INLINE_CANDIDATES),
      failure,
      fieldsChanged: fieldsChangedSince(last, spineFields),
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
 * means not connected, never a 500 (as in GET /api/status). WR-05: connected
 * matches the search route's discogsReady(), so a sign-in Discogs refused
 * reads as not connected, with needsReconnect telling the cards to say
 * Reconnect instead of Connect.
 */
export function discogsConnection(): {
  connected: boolean;
  needsReconnect: boolean;
  pausedUntil: number | null;
} {
  let signedIn = false;
  let invalid = false;
  try {
    signedIn = getDiscogsAuth() !== null;
    invalid = signedIn && isAuthInvalid();
  } catch {
    signedIn = false;
  }
  return {
    connected: signedIn && !invalid,
    needsReconnect: invalid,
    pausedUntil: discogsGate().pausedUntil(),
  };
}
