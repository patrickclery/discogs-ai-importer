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
// (RESEARCH Pattern 2), in this order:
//   0. pre-checks, no request: a finished or missing import returns; a
//      superseded or dismissed spine fails removed; no sign-in, or one known
//      to be invalid, fails auth; a paused gate defers;
//   1. read the owner's copies of the release (GET collection/releases);
//   2. when an earlier attempt wrote its intent but recorded no copy, adopt
//      the copy that POST created (pickAdoptable) and stop, with no POST;
//   3. when the release has a copy no import records and the owner did not
//      ask for another copy, hold it already_in_collection (D-05);
//   4. check the gate again and build the add path, then write the intent
//      (status importing, intent_at, the copies seen, post_count + 1) in an
//      IMMEDIATE transaction fenced on this claim, so a deferral that sends
//      nothing records no intent (CR-01);
//   5. check the claim again (isCurrent), then POST to the import's folder;
//   6. record the new copy's instance id and folder.
// The intent is always written before the POST (Pitfall 7), so a crash,
// timeout or 5xx after Discogs created the copy is adopted on the next
// attempt instead of duplicated (Pitfall 1).
//
// The check_import job (runCheckImport, CR-01) is Change match on a failed
// import whose POST may have landed: steps 0-2 only, never a POST. It adopts
// a copy that landed; when the read proves nothing landed it deletes the
// import, which completes the change; when it cannot prove that, the import
// ends failed again and Retry stays the only way on.
//
// Failure classes (D-09), the same for the read and the add:
//   429                         JobDeferredError, no attempt spent, the
//                               row's status unchanged; a 429 on the add
//                               also takes back the intent it wrote, since
//                               Discogs created nothing (CR-01);
//   401, 403, no sign-in        failed, auth ("Reconnect Discogs");
//   404 on the add              failed, not_found (the release is gone;
//                               the read answers 200 empty for it);
//   422, any other 4xx          failed, rejected; on the read of an import
//                               whose intent is written, failed other
//                               instead, since an earlier POST may have
//                               landed (canChangeMatchOf);
//   network, timeout, 5xx       error_kind unavailable recorded, rethrown;
//   anything else               error_kind other recorded, rethrown; this
//                               includes a 201 without a usable
//                               instance_id (RESEARCH A5), so the retry
//                               adopts the copy instead of posting blind.
// A rethrow goes to the worker's retry (up to 3 attempts), and every retry
// reconciles first. Terminal endings write only while the claim is
// current, and release the job's dedupe key so a Retry can enqueue again.
// When the worker gives up, markInterruptedImports (imports/recovery.ts)
// fails a row left pending or importing.

export const AddToCollectionPayload = z.object({
  importId: z.string().min(1),
});
export type AddToCollectionPayload = z.infer<typeof AddToCollectionPayload>;

export type AddToCollectionDeps = { fetch?: DiscogsFetchDeps };

/** check_import has the same payload: the import to reconcile. */
export const CheckImportPayload = AddToCollectionPayload;

/** Owner-facing reasons are cut to this many characters (UI-SPEC). */
const REASON_MAX = 160;

/**
 * The check could not prove nothing reached Discogs (more than one page of
 * copies, or a copy it cannot place): the import stays Retry-only.
 */
export const CHECK_UNSURE_REASON =
  "Couldn't confirm Discogs has no copy from this import. Retry the import instead.";

type Mode = 'add' | 'check';

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

/** True for a violation of imports_instance_idx. */
function isInstanceTaken(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  // SQLite names the columns of a violated index, not the index itself.
  return (
    e?.code === 'SQLITE_CONSTRAINT_UNIQUE' &&
    typeof e.message === 'string' &&
    e.message.includes('imports.instance_id')
  );
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
  return runImportJob(importId, ctx, deps, 'add');
}

/** Change match's reconcile (CR-01): reads, may adopt, never POSTs. */
export async function runCheckImport(
  payload: unknown,
  ctx: JobContext,
  deps: AddToCollectionDeps = {},
): Promise<void> {
  const { importId } = CheckImportPayload.parse(payload);
  return runImportJob(importId, ctx, deps, 'check');
}

async function runImportJob(
  importId: string,
  ctx: JobContext,
  deps: AddToCollectionDeps,
  mode: Mode,
): Promise<void> {
  const db = getDb().$client;
  const row = getImport(db, importId);
  // Missing: cancelled before it ran. Finished rows never run again.
  if (!row || (row.status !== 'pending' && row.status !== 'importing')) return;
  // A check acts only on the import that queued it (cancelImport).
  if (mode === 'check' && row.job_id !== ctx.job.id) return;

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
  /** A terminal ending, written only while this run owns the job. */
  const endWith = (errorKind: ImportErrorKind, err: unknown): void => {
    if (!ctx.isCurrent()) throw err;
    fail(errorKind, message(err));
  };
  /**
   * Maps a request error (D-09). Throws to defer or retry; returns after a
   * terminal ending, and the caller then returns too.
   */
  const onRequestError = (err: unknown, stage: 'read' | 'add'): void => {
    const status = (err as { status?: unknown } | null)?.status;
    // not_found and rejected say nothing reached Discogs (canChangeMatchOf).
    // A refused read proves that only when no earlier POST was sent.
    const refused = stage === 'add' || row.intent_at === null;
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
      case 'DiscogsAuthError':
        endWith('auth', err);
        return;
      case 'DiscogsNotFoundError':
        endWith(
          !refused ? 'other' : stage === 'add' ? 'not_found' : 'rejected',
          err,
        );
        return;
      case 'DiscogsRequestError':
        // The client maps 403 here, not to DiscogsAuthError (A-04-08).
        endWith(status === 403 ? 'auth' : refused ? 'rejected' : 'other', err);
        return;
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
  let pages: number;
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
    pages = parsed.data.pagination.pages;
  } catch (err) {
    onRequestError(err, 'read');
    return;
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

  /** The claim check, inside an IMMEDIATE transaction (isClaimCurrent). */
  const claimIsCurrent = (): boolean =>
    db
      .prepare(
        `SELECT 1 FROM jobs WHERE id = @jobId AND status = 'running'
           AND attempts = @attempts`,
      )
      .get({ jobId: ctx.job.id, attempts: ctx.job.attempts }) !== undefined;

  const snapshot = parseIds(row.snapshot_json);

  // 2. An earlier POST may have landed: adopt its copy, never POST again.
  if (row.intent_at !== null && row.instance_id === null) {
    const hit = pickAdoptable(instances, {
      intentAt: row.intent_at,
      snapshot,
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

  const foreign = foreignInstances(instances, recorded);

  // Check mode (CR-01) stops here, with no POST. Nothing landed only when
  // the read saw every copy and none is outside the pre-POST snapshot and
  // unrecorded; then the import is deleted, which completes Change match.
  if (mode === 'check') {
    const unplaced =
      row.intent_at !== null &&
      foreign.some((i) => !snapshot.has(i.instanceId));
    if (pages > 1 || unplaced) {
      fail('other', CHECK_UNSURE_REASON);
      return;
    }
    const drop = db.transaction((): boolean => {
      if (!claimIsCurrent()) return false;
      db.prepare(
        `DELETE FROM imports WHERE id = @id
           AND status IN ('pending', 'importing') AND instance_id IS NULL`,
      ).run({ id: importId });
      return true;
    });
    if (!drop.immediate()) throw new NotCurrentError();
    releaseDedupeKey(ctx.job.id);
    return;
  }

  // 3. A copy no import records: the owner chooses (D-05).
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

  // 4. A pause set since the read sends nothing, so it records no intent
  // (CR-01); neither does an add path that cannot be built.
  const pausedBeforeAdd = (deps.fetch?.gate ?? discogsGate()).pausedUntil();
  if (pausedBeforeAdd !== null) {
    throw new JobDeferredError(pausedBeforeAdd, 'Discogs rate limit pause');
  }
  let addPath: string;
  try {
    addPath = addToFolderPath(auth.username, row.folder_id, row.release_id);
  } catch (err) {
    endWith('other', err);
    return;
  }

  // The intent, fenced on this claim (D-07; same predicate as
  // isClaimCurrent), written before any POST can be sent.
  const writeIntent = db.transaction((): number | null => {
    if (!claimIsCurrent()) return null;
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
    return now;
  });
  const intentAt = writeIntent.immediate();
  if (intentAt === null) throw new NotCurrentError();

  // 5. The one write to the owner's account.
  let instanceId: number;
  try {
    if (!ctx.isCurrent()) throw new NotCurrentError();
    const res = await discogsFetch(
      { method: 'POST', path: addPath, auth: 'oauth', signal: ctx.signal },
      deps.fetch,
    );
    const parsed = AddResponseSchema.safeParse(res.json);
    if (!parsed.success) {
      throw new Error('Discogs answered an unexpected add body');
    }
    instanceId = parsed.data.instance_id;
  } catch (err) {
    if (errName(err) === 'DiscogsRateLimitedError') {
      // A 429, or the client's deferral before sending: Discogs created no
      // copy, so this attempt's intent is taken back (CR-01).
      db.prepare(
        `UPDATE imports SET status = @status, intent_at = @prevIntentAt,
           snapshot_json = @prevSnapshot, post_count = post_count - 1,
           updated_at = @now
         WHERE id = @id AND intent_at = @intentAt AND instance_id IS NULL`,
      ).run({
        id: importId,
        status: row.status,
        prevIntentAt: row.intent_at,
        prevSnapshot: row.snapshot_json,
        intentAt,
        now: Date.now(),
      });
    }
    onRequestError(err, 'add');
    return;
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
    // Another import already records this copy (imports_instance_idx):
    // something is badly wrong, and a retry could POST again. Stop here.
    if (isInstanceTaken(err)) {
      fail('other', 'Discogs returned a copy another import already records');
      return;
    }
    throw err;
  }
}
