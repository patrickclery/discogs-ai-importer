import 'server-only';
import { z } from 'zod';
import type { ExistingInstance, ImportErrorKind } from '@/lib/import-types';
import { getDb } from '../../db/client';
import { getDiscogsAuth, isAuthInvalid } from '../../discogs/auth';
import { type DiscogsFetchDeps, discogsFetch } from '../../discogs/client';
import {
  AddResponseSchema,
  addToFolderPath,
  CollectionReleasesSchema,
  collectionReleasesPath,
  foreignInstances,
  pickAdoptable,
  toInstances,
} from '../../discogs/collection';
import { discogsGate } from '../../discogs/gate';
import { getImport } from '../../imports/store';
import { releaseDedupeKey } from '../queue';
import { type JobContext, JobDeferredError } from '../types';

// Adds one confirmed release to the owner's Discogs collection, exactly once
// (D-05, D-07, D-08, IMP-04). Discogs makes the POST non-idempotent: every
// POST creates a new copy. So every attempt runs the same algorithm
// (RESEARCH Pattern 2):
//   1. read the owner's copies of the release (GET collection/releases);
//   2. when an earlier attempt wrote its intent but recorded no copy, adopt
//      the copy that POST created (pickAdoptable) and stop, with no POST;
//   3. when the release has a copy no import records and the owner did not
//      ask for another copy, stop already_in_collection (D-05);
//   4. write the intent (status importing, intent_at, the copies seen,
//      post_count + 1) in an IMMEDIATE transaction fenced on this claim;
//   5. check the claim again, then POST to the import's folder;
//   6. record the new copy's instance id and folder.
// The intent is always written before the POST (Pitfall 7), so a crash,
// timeout or 5xx after Discogs created the copy is adopted on the next
// attempt instead of duplicated (Pitfall 1). A 429 defers without spending
// an attempt; every other error is recorded on the row and rethrown for the
// worker's retry, which reconciles first. Plan 04-02 adds the D-09 failure
// classes and the interrupted hook.

export const AddToCollectionPayload = z.object({
  importId: z.string().min(1),
});
export type AddToCollectionPayload = z.infer<typeof AddToCollectionPayload>;

export type AddToCollectionDeps = { fetch?: DiscogsFetchDeps };

/** Owner-facing reasons are cut to this many characters (UI-SPEC). */
const REASON_MAX = 160;

/** Spine states whose imports never spend a request. */
const VANISHED_STATES = new Set(['superseded', 'dismissed']);

/** Thrown when this run no longer owns the job (WR-04). */
class NotCurrentError extends Error {
  constructor() {
    super('add_to_collection: the job is no longer current');
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

function parseIds(json: string | null): Set<number> {
  if (!json) return new Set();
  try {
    const v: unknown = JSON.parse(json);
    return new Set(
      Array.isArray(v)
        ? v.filter((x): x is number => Number.isSafeInteger(x))
        : [],
    );
  } catch {
    return new Set();
  }
}

export async function runAddToCollection(
  payload: unknown,
  ctx: JobContext,
  deps: AddToCollectionDeps = {},
): Promise<void> {
  const { importId } = AddToCollectionPayload.parse(payload);
  const db = getDb().$client;
  const row = getImport(db, importId);
  // Missing: cancelled before it ran. Finished rows never run again.
  if (!row || (row.status !== 'pending' && row.status !== 'importing')) return;

  const fail = (errorKind: ImportErrorKind, error: string): void => {
    db.prepare(
      `UPDATE imports SET status = 'failed', error_kind = @errorKind,
         error = @error, updated_at = @now
       WHERE id = @id AND status IN ('pending', 'importing')`,
    ).run({
      id: importId,
      errorKind,
      error: error.slice(0, REASON_MAX),
      now: Date.now(),
    });
    releaseDedupeKey(ctx.job.id);
  };
  const recordError = (errorKind: ImportErrorKind, err: unknown): void => {
    db.prepare(
      `UPDATE imports SET error_kind = @errorKind, error = @error,
         updated_at = @now
       WHERE id = @id`,
    ).run({
      id: importId,
      errorKind,
      error: message(err).slice(0, REASON_MAX),
      now: Date.now(),
    });
  };
  /** Maps a request error: defer on 429, else record and rethrow. */
  const onRequestError = (err: unknown): never => {
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
      case 'DiscogsUnavailableError':
        recordError('unavailable', err);
        throw err;
      default:
        recordError('other', err);
        throw err;
    }
  };

  const spine = db
    .prepare('SELECT state FROM spines WHERE id = @spineId')
    .get({ spineId: row.spine_id }) as { state: string } | undefined;
  if (!spine || VANISHED_STATES.has(spine.state)) {
    fail('removed', 'This spine was removed before the import ran.');
    return;
  }

  const auth = getDiscogsAuth();
  if (!auth || isAuthInvalid()) {
    fail('auth', 'Reconnect Discogs');
    return;
  }

  const pausedUntil = (deps.fetch?.gate ?? discogsGate()).pausedUntil();
  if (pausedUntil !== null) {
    throw new JobDeferredError(pausedUntil, 'Discogs rate limit pause');
  }

  // 1. The owner's copies of this release.
  let instances: ExistingInstance[];
  try {
    if (!ctx.isCurrent()) throw new NotCurrentError();
    const res = await discogsFetch(
      {
        path: collectionReleasesPath(auth.username, row.release_id),
        auth: 'oauth',
        signal: ctx.signal,
      },
      deps.fetch,
    );
    const parsed = CollectionReleasesSchema.safeParse(res.json);
    if (!parsed.success) {
      throw new Error('Discogs answered an unexpected collection body');
    }
    instances = toInstances(parsed.data);
  } catch (err) {
    return onRequestError(err);
  }
  if (!ctx.isCurrent()) throw new NotCurrentError();

  const recorded = new Set(
    (
      db
        .prepare(
          'SELECT instance_id FROM imports WHERE instance_id IS NOT NULL',
        )
        .all() as { instance_id: number }[]
    ).map((r) => r.instance_id),
  );

  // 2. An earlier POST may have landed: adopt its copy, never POST again.
  if (row.intent_at !== null && row.instance_id === null) {
    const hit = pickAdoptable(instances, {
      intentAt: row.intent_at,
      snapshot: parseIds(row.snapshot_json),
      recorded,
    });
    if (hit) {
      const now = Date.now();
      db.prepare(
        `UPDATE imports SET status = 'imported', instance_id = @instanceId,
           folder_id = @folderId, adopted = 1, imported_at = @now,
           error_kind = NULL, error = NULL, updated_at = @now
         WHERE id = @id AND instance_id IS NULL`,
      ).run({
        id: importId,
        instanceId: hit.instanceId,
        folderId: hit.folderId,
        now,
      });
      return;
    }
  }

  // 3. A copy no import records: the owner chooses (D-05).
  const foreign = foreignInstances(instances, recorded);
  if (foreign.length > 0 && row.allow_duplicate === 0) {
    db.prepare(
      `UPDATE imports SET status = 'already_in_collection',
         existing_json = @existing, error_kind = NULL, error = NULL,
         updated_at = @now
       WHERE id = @id AND status IN ('pending', 'importing')`,
    ).run({
      id: importId,
      existing: JSON.stringify(foreign),
      now: Date.now(),
    });
    releaseDedupeKey(ctx.job.id);
    return;
  }

  // 4. The intent, fenced on this claim (D-07; same predicate as
  // isClaimCurrent), written before any POST can be sent.
  const writeIntent = db.transaction((): boolean => {
    const current = db
      .prepare(
        `SELECT 1 FROM jobs WHERE id = @jobId AND status = 'running'
           AND attempts = @attempts`,
      )
      .get({ jobId: ctx.job.id, attempts: ctx.job.attempts });
    if (!current) return false;
    const now = Date.now();
    db.prepare(
      `UPDATE imports SET status = 'importing', intent_at = @now,
         snapshot_json = @snapshot, post_count = post_count + 1,
         error_kind = NULL, error = NULL, updated_at = @now
       WHERE id = @id`,
    ).run({
      id: importId,
      snapshot: JSON.stringify(instances.map((i) => i.instanceId)),
      now,
    });
    return true;
  });
  if (!writeIntent.immediate()) throw new NotCurrentError();

  // 5. The one write to the owner's account.
  let instanceId: number;
  try {
    if (!ctx.isCurrent()) throw new NotCurrentError();
    const res = await discogsFetch(
      {
        method: 'POST',
        path: addToFolderPath(auth.username, row.folder_id, row.release_id),
        auth: 'oauth',
        signal: ctx.signal,
      },
      deps.fetch,
    );
    const parsed = AddResponseSchema.safeParse(res.json);
    if (!parsed.success) {
      throw new Error('Discogs answered an unexpected add body');
    }
    instanceId = parsed.data.instance_id;
  } catch (err) {
    return onRequestError(err);
  }

  // 6. Record the copy. Discogs created it, so this is recorded even if the
  // claim was lost meanwhile.
  const now = Date.now();
  try {
    db.prepare(
      `UPDATE imports SET status = 'imported', instance_id = @instanceId,
         folder_id = @folderId, imported_at = @now, error_kind = NULL,
         error = NULL, updated_at = @now
       WHERE id = @id`,
    ).run({ id: importId, instanceId, folderId: row.folder_id, now });
  } catch (err) {
    // Another import already records this copy: something is badly wrong,
    // and a retry could POST again. Stop here.
    if ((err as { code?: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
      fail('other', 'Discogs returned a copy another import already records');
      return;
    }
    throw err;
  }
}
