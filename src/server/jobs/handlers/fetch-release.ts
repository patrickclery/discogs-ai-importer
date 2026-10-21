import 'server-only';
import { z } from 'zod';
import { getDb } from '../../db/client';
import { getDiscogsAuth, isAuthInvalid } from '../../discogs/auth';
import { type DiscogsFetchDeps, discogsFetch } from '../../discogs/client';
import { discogsGate } from '../../discogs/gate';
import { ReleaseSchema, toCandidateFromRelease } from '../../discogs/search';
import {
  finishSearch,
  getSearch,
  recordSearchError,
} from '../../discogs/store';
import { releaseDedupeKey } from '../queue';
import { type JobContext, JobDeferredError } from '../types';

// One pasted release for the Search Discogs dialog (D-15, DISC-06), on the
// discogs lane: a single signed GET /releases/{id} paced by the shared gate
// (D-05). The release is stored as the search row's one result and nothing
// else: the owner checks it against the crop and picks it explicitly before
// it becomes a candidate (RESEARCH Pitfall 5, the phase prohibition).
//
// The same checks as search_spine (search-spine.ts): a finished search
// returns; a superseded or dismissed spine finishes skipped; no sign-in
// finishes not_connected and a revoked one auth_failed; a paused gate
// defers. A 404 finishes not_found, a 429 defers without spending an
// attempt, a 401 finishes auth_failed, a network error or 5xx is recorded
// and rethrown for the worker's retry, and any other 4xx finishes failed.

export const FetchReleasePayload = z.object({
  searchId: z.string().min(1),
});
export type FetchReleasePayload = z.infer<typeof FetchReleasePayload>;

export type FetchReleaseDeps = { fetch?: DiscogsFetchDeps };

/** Owner-facing reasons are cut to this many characters (UI-SPEC). */
const REASON_MAX = 160;

/** Spine states whose queued searches never spend a request. */
const VANISHED_STATES = new Set(['superseded', 'dismissed']);

/** Thrown when this run no longer owns the job (WR-04). */
class NotCurrentError extends Error {
  constructor() {
    super('fetch_release: the job is no longer current');
    this.name = 'NotCurrentError';
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function errName(err: unknown): string {
  const name = (err as { name?: unknown } | null)?.name;
  return typeof name === 'string' ? name : '';
}

export async function runFetchRelease(
  payload: unknown,
  ctx: JobContext,
  deps: FetchReleaseDeps = {},
): Promise<void> {
  const { searchId } = FetchReleasePayload.parse(payload);
  const db = getDb().$client;
  const search = getSearch(db, searchId);
  if (!search) throw new Error(`fetch_release: search ${searchId} not found`);
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
  const finishUnauthed = (
    status: 'not_connected' | 'auth_failed',
    error?: string,
  ): void => {
    finish(status, { errorKind: status, error });
    releaseDedupeKey(ctx.job.id);
  };

  const releaseId = search.release_id;
  if (
    search.kind !== 'release' ||
    typeof releaseId !== 'number' ||
    !Number.isSafeInteger(releaseId) ||
    releaseId < 1
  ) {
    finish('failed', {
      errorKind: 'invalid',
      error: 'this search has no release number',
    });
    return;
  }

  const spine = db
    .prepare('SELECT state FROM spines WHERE id = @spineId')
    .get({ spineId: search.spine_id }) as { state: string } | undefined;
  if (!spine || VANISHED_STATES.has(spine.state)) {
    finish('skipped');
    return;
  }

  if (!getDiscogsAuth()) {
    finishUnauthed('not_connected');
    return;
  }
  if (isAuthInvalid()) {
    finishUnauthed('auth_failed', 'Discogs refused the stored sign-in');
    return;
  }

  const pausedUntil = (deps.fetch?.gate ?? discogsGate()).pausedUntil();
  if (pausedUntil !== null) {
    throw new JobDeferredError(pausedUntil, 'Discogs rate limit pause');
  }

  let release: z.infer<typeof ReleaseSchema>;
  try {
    if (!ctx.isCurrent()) throw new NotCurrentError();
    const res = await discogsFetch(
      {
        path: `/releases/${releaseId}`,
        auth: 'oauth',
        signal: ctx.signal,
      },
      deps.fetch,
    );
    const parsed = ReleaseSchema.safeParse(res.json);
    if (!parsed.success || parsed.data.id !== releaseId) {
      throw new Error('Discogs answered an unexpected release body');
    }
    release = parsed.data;
  } catch (err) {
    switch (errName(err)) {
      case 'NotCurrentError':
        throw err;
      case 'DiscogsRateLimitedError': {
        const resumeAt = (err as { resumeAt?: unknown }).resumeAt;
        throw new JobDeferredError(
          typeof resumeAt === 'number' ? resumeAt : Date.now() + 60_000,
          message(err),
        );
      }
      case 'DiscogsAuthError': {
        if (!ctx.isCurrent()) throw err;
        const status = (err as { status?: unknown }).status;
        finishUnauthed(
          status === null && !getDiscogsAuth()
            ? 'not_connected'
            : 'auth_failed',
          message(err),
        );
        return;
      }
      case 'DiscogsNotFoundError':
        if (!ctx.isCurrent()) throw err;
        finishSearch(db, searchId, {
          status: 'not_found',
          stage: 'release',
          resultCount: 0,
          totalCount: 0,
          resultsJson: '[]',
        });
        return;
      case 'DiscogsRequestError':
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

  finishSearch(db, searchId, {
    status: 'done',
    stage: 'release',
    resultCount: 1,
    totalCount: 1,
    resultsJson: JSON.stringify([toCandidateFromRelease(release)]),
  });
}
