import 'server-only';
import { z } from 'zod';
import { DIALOG_RESULTS_MAX } from '@/lib/discogs-types';
import { getDb } from '../../db/client';
import { getDiscogsAuth, isAuthInvalid } from '../../discogs/auth';
import { type DiscogsFetchDeps, discogsFetch } from '../../discogs/client';
import { discogsGate } from '../../discogs/gate';
import type { SearchInputs } from '../../discogs/inputs';
import {
  type CascadeResult,
  type CascadeSearch,
  MANUAL_PARAMS,
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
import { releaseDedupeKey } from '../queue';
import { type JobContext, JobDeferredError } from '../types';

// One Discogs search for one spine (D-09, D-10), on the discogs lane. Each
// stage is one signed GET /database/search paced by the process-wide gate
// (D-05). The cascade's winning results replace the spine's auto candidates
// and finish the search row in one transaction.
//
// Before any request: a finished search returns; a vanished spine finishes
// skipped (Pitfall 6); no stored sign-in finishes not_connected and a known
// revoked one auth_failed (Pitfall 7); a paused gate defers the job. During
// the cascade: a 429 defers (D-06, no attempt spent; the cascade restarts
// from stage 1 next run, A-03-13), a 401 finishes auth_failed, a network
// error or 5xx is recorded and rethrown for the worker's 2 s / 4 s retry,
// and any other 4xx finishes failed at once. Errors are compared by name:
// HMR can leave two copies of each class alive.
//
// A manual (dialog) search runs the same checks but sends exactly one
// request: q = the typed text, CDs only, 25 per page (D-15, A-03-23). Its
// results stay on the search row for the owner to pick from; it never
// writes discogs_candidates (D-16).

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

/** Owner-facing reasons are cut to this many characters (UI-SPEC). */
const REASON_MAX = 160;

/** Spine states whose queued searches never spend a request. */
const VANISHED_STATES = new Set(['superseded', 'dismissed']);

function errName(err: unknown): string {
  const name = (err as { name?: unknown } | null)?.name;
  return typeof name === 'string' ? name : '';
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

  const finish = (
    status: 'skipped' | 'not_connected' | 'auth_failed' | 'failed',
    out: { errorKind?: string; error?: string } = {},
  ): void => {
    finishSearch(db, searchId, {
      status,
      errorKind: out.errorKind ?? null,
      error: out.error ? out.error.slice(0, REASON_MAX) : null,
    });
  };
  /** A later connect must be able to queue the same search again. */
  const finishUnauthed = (
    status: 'not_connected' | 'auth_failed',
    error?: string,
  ): void => {
    finish(status, { errorKind: status, error });
    releaseDedupeKey(ctx.job.id);
  };

  // RESEARCH Pitfall 6: a superseded or dismissed spine (or an orphaned
  // one, for an automatic search) costs no request.
  const spine = db
    .prepare('SELECT state FROM spines WHERE id = @spineId')
    .get({ spineId: search.spine_id }) as { state: string } | undefined;
  if (
    !spine ||
    VANISHED_STATES.has(spine.state) ||
    (spine.state === 'orphaned' && search.kind === 'auto')
  ) {
    finish('skipped');
    return;
  }

  // RESEARCH Pitfall 7: no sign-in, or one Discogs already refused.
  if (!getDiscogsAuth()) {
    finishUnauthed('not_connected');
    return;
  }
  if (isAuthInvalid()) {
    finishUnauthed('auth_failed', 'Discogs refused the stored sign-in');
    return;
  }

  // The lane gate normally keeps a paused lane from claiming; a job claimed
  // just before a pause waits here instead of spending its slot (D-06).
  const pausedUntil = (deps.fetch?.gate ?? discogsGate()).pausedUntil();
  if (pausedUntil !== null) {
    throw new JobDeferredError(pausedUntil, 'Discogs rate limit pause');
  }

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

  const manualQuery = (search.query_text ?? inputs.rawText ?? '').trim();

  let outcome: CascadeResult;
  try {
    if (search.kind === 'manual') {
      if (!manualQuery) {
        finish('failed', { errorKind: 'rejected', error: 'empty search' });
        return;
      }
      const { results, total } = await api.search(
        { q: manualQuery, ...MANUAL_PARAMS },
        ctx.signal,
      );
      outcome =
        results.length > 0
          ? {
              stage: 'text',
              results: results.slice(0, DIALOG_RESULTS_MAX),
              total,
            }
          : { stage: null, results: [], total: 0 };
    } else {
      outcome = await runCascade(inputs, api, ctx.signal);
    }
  } catch (err) {
    switch (errName(err)) {
      case 'NotCurrentError':
        throw err;
      case 'DiscogsRateLimitedError': {
        // D-06: never a failed attempt; the gate is already paused.
        const resumeAt = (err as { resumeAt?: unknown }).resumeAt;
        throw new JobDeferredError(
          typeof resumeAt === 'number' ? resumeAt : Date.now() + 60_000,
          message(err),
        );
      }
      case 'DiscogsAuthError': {
        if (!ctx.isCurrent()) throw err;
        // The client already turned on Reconnect needed for a 401. A
        // sign-in removed mid-run reads as not connected.
        const status = (err as { status?: unknown }).status;
        finishUnauthed(
          status === null && !getDiscogsAuth()
            ? 'not_connected'
            : 'auth_failed',
          message(err),
        );
        return;
      }
      case 'DiscogsRequestError':
      case 'DiscogsNotFoundError':
        // 400, 403, 404, 422: asking again gets the same answer.
        if (!ctx.isCurrent()) throw err;
        finish('failed', { errorKind: 'rejected', error: message(err) });
        return;
      case 'DiscogsUnavailableError':
        recordSearchError(db, searchId, {
          errorKind: 'unavailable',
          error: message(err),
        });
        throw err;
      default:
        recordSearchError(db, searchId, {
          errorKind: errName(err) || 'Error',
          error: message(err),
        });
        throw err;
    }
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
    // D-16: a manual (dialog) search only stores its results on the row;
    // the owner picks from them.
    if (search.kind !== 'auto' && search.kind !== 'again') return;
    replaceAutoCandidates(db, {
      spineId: search.spine_id,
      searchId,
      stage: outcome.stage,
      candidates,
    });
  });
  tx.immediate();
}
