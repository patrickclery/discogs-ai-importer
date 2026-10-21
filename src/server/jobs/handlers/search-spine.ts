import 'server-only';
import { z } from 'zod';
import { getDb } from '../../db/client';
import { type DiscogsFetchDeps, discogsFetch } from '../../discogs/client';
import type { SearchInputs } from '../../discogs/inputs';
import {
  type CascadeSearch,
  parseSearchResponse,
  rankCandidates,
  runCascade,
  toCandidateFromSearch,
} from '../../discogs/search';
import {
  finishSearch,
  getSearch,
  recordSearchError,
  replaceAutoCandidates,
} from '../../discogs/store';
import type { JobContext } from '../types';

// One Discogs search for one spine (D-09, D-10), on the discogs lane. Each
// stage is one signed GET /database/search paced by the process-wide gate
// (D-05). The cascade's winning results replace the spine's auto candidates
// and finish the search row in one transaction. Plan 03-05 adds the 429,
// 401, 5xx, 4xx, not-connected and vanished-spine branches; until then a
// thrown error is recorded on the row and retried by the worker.

export const SearchSpinePayload = z.object({
  searchId: z.string().min(1),
});
export type SearchSpinePayload = z.infer<typeof SearchSpinePayload>;

export type SearchSpineDeps = { fetch?: DiscogsFetchDeps };

/** Thrown when this run no longer owns the job (WR-04). */
class NotCurrentError extends Error {
  constructor() {
    super('search_spine: the job is no longer current');
    this.name = 'NotCurrentError';
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function storedInputs(json: string): SearchInputs {
  const empty: SearchInputs = {
    artist: null,
    title: null,
    catno: null,
    rawText: null,
  };
  try {
    const v = JSON.parse(json) as Partial<Record<keyof SearchInputs, unknown>>;
    const str = (x: unknown) => (typeof x === 'string' && x ? x : null);
    return {
      artist: str(v.artist),
      title: str(v.title),
      catno: str(v.catno),
      rawText: str(v.rawText),
    };
  } catch {
    return empty;
  }
}

export async function runSearchSpine(
  payload: unknown,
  ctx: JobContext,
  deps: SearchSpineDeps = {},
): Promise<void> {
  const { searchId } = SearchSpinePayload.parse(payload);
  const db = getDb().$client;
  const search = getSearch(db, searchId);
  if (!search) throw new Error(`search_spine: search ${searchId} not found`);
  // A finished search is never run again (idempotent replay).
  if (search.status !== 'queued') return;

  // The inputs captured at enqueue time are the ones searched, so the
  // stored input_hash always describes what Discogs was asked.
  const inputs = storedInputs(search.inputs_json);

  const api: CascadeSearch = {
    async search(params, signal) {
      if (!ctx.isCurrent()) throw new NotCurrentError();
      const res = await discogsFetch(
        { path: '/database/search', query: params, auth: 'oauth', signal },
        deps.fetch,
      );
      return parseSearchResponse(res.json);
    },
  };

  let outcome: Awaited<ReturnType<typeof runCascade>>;
  try {
    outcome = await runCascade(inputs, api, ctx.signal);
  } catch (err) {
    if ((err as Error)?.name !== 'NotCurrentError') {
      recordSearchError(db, searchId, {
        errorKind: (err as Error)?.name || 'Error',
        error: message(err),
      });
    }
    throw err;
  }
  if (!ctx.isCurrent()) return;

  const candidates = rankCandidates(
    outcome.results.map((r, rank) =>
      toCandidateFromSearch(r, outcome.stage ?? 'text', rank),
    ),
    inputs.catno,
  );
  const tx = db.transaction(() => {
    const finished = finishSearch(db, searchId, {
      status: candidates.length > 0 ? 'done' : 'no_match',
      stage: outcome.stage,
      resultCount: candidates.length,
      totalCount: outcome.total,
      resultsJson: JSON.stringify(candidates),
    });
    // Another run finished this search first: leave its candidates alone.
    if (!finished) return;
    replaceAutoCandidates(db, {
      spineId: search.spine_id,
      searchId,
      stage: outcome.stage,
      candidates,
    });
  });
  tx.immediate();
}
