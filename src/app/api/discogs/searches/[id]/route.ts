import { connection } from 'next/server';
import {
  DIALOG_RESULTS_MAX,
  type DialogSearchDto,
  type DialogSearchState,
  type SearchResultDto,
} from '@/lib/discogs-types';
import { getDb } from '@/server/db/client';
import { discogsGate } from '@/server/discogs/gate';
import { capCodePoints } from '@/server/discogs/inputs';
import { ENDED_WITHOUT_RESULT, listCandidates } from '@/server/discogs/queries';
import {
  getSearch,
  parseStoredResults,
  type SearchRowRaw,
} from '@/server/discogs/store';

// One Search Discogs dialog search, polled every 1.5 s until it ends (D-15,
// UI-SPEC Search Discogs dialog). Only manual and release searches are
// served: an automatic or again search, like an unknown id, is a 404. The
// id is only a named parameter. Results come from the row's results_json,
// at most 25, each flagged alreadyListed when the release is among the
// spine's candidates.

const NOT_FOUND = {
  error: 'not_found',
  message: 'This search no longer exists.',
};

/** Owner-facing failure reasons are cut to this many code points. */
const REASON_MAX = 160;

function reasonOf(row: SearchRowRaw): string {
  switch (row.status) {
    case 'auth_failed':
      return 'Discogs rejected the connection';
    case 'not_connected':
      return "Discogs isn't connected";
    case 'skipped':
      return 'this spine is no longer listed';
    default: {
      if (row.error_kind === 'unavailable') return "Discogs didn't respond";
      const s = row.error?.trim().replace(/\.\s*$/, '');
      return s ? capCodePoints(s, REASON_MAX) : ENDED_WITHOUT_RESULT;
    }
  }
}

function stateOf(
  row: SearchRowRaw,
  jobStatus: string | null,
): { state: DialogSearchState; failure: string | null } {
  switch (row.status) {
    case 'queued':
      switch (jobStatus) {
        case 'running':
          return { state: 'searching', failure: null };
        case 'failed':
          return { state: 'failed', failure: reasonOf(row) };
        case 'succeeded':
          return { state: 'failed', failure: ENDED_WITHOUT_RESULT };
        default:
          return { state: 'queued', failure: null };
      }
    case 'done':
    case 'no_match':
    case 'not_found':
      return { state: row.status, failure: null };
    default:
      return { state: 'failed', failure: reasonOf(row) };
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await params;
  const db = getDb().$client;
  const row = getSearch(db, id);
  if (!row || (row.kind !== 'manual' && row.kind !== 'release')) {
    return Response.json(NOT_FOUND, { status: 404 });
  }
  const job = row.job_id
    ? (db
        .prepare('SELECT status FROM jobs WHERE id = @jobId')
        .get({ jobId: row.job_id }) as { status: string } | undefined)
    : undefined;
  const { state, failure } = stateOf(row, job?.status ?? null);
  const listed = new Set(
    listCandidates(db, row.spine_id).map((c) => c.releaseId),
  );
  const stored = parseStoredResults(row.results_json);
  const results: SearchResultDto[] = stored
    .slice(0, DIALOG_RESULTS_MAX)
    .map((c) => ({
      releaseId: c.releaseId,
      title: c.title,
      year: c.year,
      country: c.country,
      labels: c.labels,
      catno: c.catno,
      formats: c.formats,
      hasThumb: c.thumbUrl !== null,
      alreadyListed: listed.has(c.releaseId),
    }));
  const body: DialogSearchDto = {
    id: row.id,
    kind: row.kind,
    state,
    query: row.query_text,
    releaseId: row.release_id,
    results,
    totalCount: row.total_count ?? stored.length,
    failure,
    pausedUntil: discogsGate().pausedUntil(),
  };
  return Response.json(body);
}
