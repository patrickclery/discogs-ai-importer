import 'server-only';
import type Database from 'better-sqlite3';
import type { CandidateFormat } from '@/lib/discogs-types';
import {
  canChangeMatchOf,
  type ExistingInstance,
  type ImportCandidateSnapshot,
  type ImportPhase,
  type ImportStatus,
  importPhaseOf,
} from '@/lib/import-types';
import { enqueueExplicitSearch } from '../discogs/enqueue';
import { getCollectionFolderId } from '../discogs/folders';
import { discogsForSpines } from '../discogs/queries';
import { newId } from '../ids';
import { cancelQueuedJob, enqueue, releaseDedupeKey } from '../jobs/queue';
import { fileUrl } from '../scan/queries';

// Imports (D-01, D-02, D-03, D-07, D-08, D-13). createImport is the only
// path that creates an import; enqueueImport, reached from createImport and
// retryImport, is the only place add_to_collection is enqueued (IMP-01,
// guarded by the enqueue-site scan in store.test.ts). cancelImport (Change
// match), retrySpine (Retry), linkExisting and addAnotherCopy (the
// already-in-collection decision, D-05) are the owner's other import
// actions.
// The release id always comes from the spine's own candidate row, never from
// the request (T-04-02). Raw SQL with @named parameters; better-sqlite3 is
// built with DQS=0, so string literals are single-quoted.

export const ADD_TO_COLLECTION_JOB_TYPE = 'add_to_collection';
/** Change match's reconcile-only job (CR-01): reads, never POSTs. */
export const CHECK_IMPORT_JOB_TYPE = 'check_import';

export type CreateImportResult =
  | { status: 'ok'; importId: string; jobId: string }
  | { status: 'not_found' }
  | { status: 'not_importable' }
  | { status: 'not_on_discogs' }
  | { status: 'already_confirmed' }
  | { status: 'retry_first' }
  | { status: 'no_candidate' }
  | ({ status: 'duplicate' } & DuplicateOf);

/** The other spine already holding the release (D-04), as the dialog shows it. */
export type DuplicateOf = {
  /** The other spine's photo file name. */
  photo: string;
  /** The other spine's number on its photo (#n). */
  spineNumber: number;
  cropUrl: string | null;
  /** The other spine's import already finished. */
  done: boolean;
};

export type ImportDbRow = {
  id: string;
  spine_id: string;
  candidate_id: string | null;
  release_id: number;
  folder_id: number;
  status: ImportStatus;
  allow_duplicate: number;
  adopted: number;
  linked: number;
  instance_id: number | null;
  intent_at: number | null;
  snapshot_json: string | null;
  existing_json: string | null;
  candidate_json: string | null;
  post_count: number;
  error_kind: string | null;
  error: string | null;
  job_id: string | null;
  created_at: number;
  updated_at: number;
  imported_at: number | null;
};

type CandidateRow = {
  release_id: number;
  title: string;
  year: number | null;
  country: string | null;
  labels_json: string;
  catno: string | null;
  formats_json: string;
};

function jsonArray(json: string): unknown[] {
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function snapshotOf(c: CandidateRow): ImportCandidateSnapshot {
  const formats: CandidateFormat[] = [];
  for (const f of jsonArray(c.formats_json)) {
    if (!f || typeof f !== 'object') continue;
    const o = f as Record<string, unknown>;
    if (typeof o.name !== 'string') continue;
    formats.push({
      name: o.name,
      qty: typeof o.qty === 'string' ? o.qty : null,
      descriptions: Array.isArray(o.descriptions)
        ? o.descriptions.filter((d): d is string => typeof d === 'string')
        : [],
      text: typeof o.text === 'string' ? o.text : null,
    });
  }
  return {
    title: c.title,
    year: c.year,
    country: c.country,
    labels: jsonArray(c.labels_json).filter(
      (x): x is string => typeof x === 'string',
    ),
    catno: c.catno,
    formats,
  };
}

function isUniqueViolation(err: unknown, index: string): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  if (e?.code !== 'SQLITE_CONSTRAINT_UNIQUE') return false;
  // SQLite names the columns of a violated index, not the index itself.
  return typeof e.message === 'string' && e.message.includes(index);
}

export function getImport(
  db: Database.Database,
  id: string,
): ImportDbRow | undefined {
  return db.prepare('SELECT * FROM imports WHERE id = @id').get({ id }) as
    | ImportDbRow
    | undefined;
}

/**
 * The local duplicate check (D-04, IMP-03), with no Discogs request: the
 * oldest import of the same release held by another listed spine (active or
 * orphaned) that is pending, importing, imported or already_in_collection.
 * Overlapping photos of one shelf are caught the same way as two copies on
 * one photo.
 */
function duplicateOf(
  db: Database.Database,
  spineId: string,
  releaseId: number,
): DuplicateOf | null {
  const row = db
    .prepare(
      `SELECT i.status, p.original_name AS photo, d.idx, d.crop_path
       FROM imports i
       JOIN spines s ON s.id = i.spine_id
       JOIN photos p ON p.id = s.photo_id
       LEFT JOIN spine_detections d ON d.id = s.current_detection_id
       WHERE i.release_id = @releaseId
         AND i.spine_id <> @spineId
         AND s.state IN ('active', 'orphaned')
         AND i.status IN ('pending', 'importing', 'imported',
           'already_in_collection')
       ORDER BY i.created_at, i.id
       LIMIT 1`,
    )
    .get({ releaseId, spineId }) as
    | {
        status: string;
        photo: string;
        idx: number | null;
        crop_path: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    photo: row.photo,
    spineNumber: (row.idx ?? 0) + 1,
    cropUrl: fileUrl(row.crop_path),
    done: row.status === 'imported',
  };
}

/**
 * Confirms one candidate of one spine (D-01): checks, in order, that the
 * spine exists, is active or orphaned, is not marked not on Discogs, has no
 * non-failed import, and lists that candidate; unless allowDuplicate, that
 * no other listed spine holds the same release (duplicateOf, D-04); then
 * writes the pending import and its add_to_collection job. allowDuplicate
 * is the owner's local "Add another copy" and does not set
 * imports.allow_duplicate: that flag stays the answer to a remote hold
 * (A-04-17), and the other spine's copy is recorded, so the handler does
 * not hold this one; while the other spine's add is still unresolved, the
 * handler waits for it first (WR-05). One IMMEDIATE transaction, so two
 * confirms sent at once cannot both pass; the partial unique index
 * imports_spine_open_idx is the race-proof backstop (D-08, Pitfall 8).
 */
export function createImport(
  db: Database.Database,
  input: { spineId: string; candidateId: string; allowDuplicate?: boolean },
): CreateImportResult {
  const tx = db.transaction((): CreateImportResult => {
    const spine = db
      .prepare('SELECT state, not_on_discogs FROM spines WHERE id = @spineId')
      .get({ spineId: input.spineId }) as
      | { state: string; not_on_discogs: number }
      | undefined;
    if (!spine) return { status: 'not_found' };
    if (spine.state !== 'active' && spine.state !== 'orphaned') {
      return { status: 'not_importable' };
    }
    if (spine.not_on_discogs === 1) return { status: 'not_on_discogs' };
    const open = db
      .prepare(
        `SELECT 1 FROM imports WHERE spine_id = @spineId AND status <> 'failed'`,
      )
      .get({ spineId: input.spineId });
    if (open) return { status: 'already_confirmed' };
    // D-07: a failed add whose intent was written may have reached Discogs
    // (no answer, a crash, a timeout). Only Retry reconciles it, so a new
    // confirm is refused until then; a refused add (not_found, rejected)
    // or one that never wrote an intent is safe to replace.
    const latest = db
      .prepare(
        `SELECT status, intent_at, error_kind FROM imports
         WHERE spine_id = @spineId
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
      )
      .get({ spineId: input.spineId }) as
      | { status: string; intent_at: number | null; error_kind: string | null }
      | undefined;
    if (
      latest?.status === 'failed' &&
      latest.intent_at !== null &&
      latest.error_kind !== 'not_found' &&
      latest.error_kind !== 'rejected'
    ) {
      return { status: 'retry_first' };
    }
    const candidate = db
      .prepare(
        `SELECT release_id, title, year, country, labels_json, catno, formats_json
         FROM discogs_candidates WHERE id = @candidateId AND spine_id = @spineId`,
      )
      .get({ candidateId: input.candidateId, spineId: input.spineId }) as
      | CandidateRow
      | undefined;
    if (!candidate) return { status: 'no_candidate' };
    if (!input.allowDuplicate) {
      const other = duplicateOf(db, input.spineId, candidate.release_id);
      if (other) return { status: 'duplicate', ...other };
    }

    const now = Date.now();
    const importId = newId();
    db.prepare(
      `INSERT INTO imports (id, spine_id, candidate_id, release_id, folder_id,
         status, candidate_json, created_at, updated_at)
       VALUES (@id, @spineId, @candidateId, @releaseId, @folderId,
         'pending', @candidateJson, @now, @now)`,
    ).run({
      id: importId,
      spineId: input.spineId,
      candidateId: input.candidateId,
      releaseId: candidate.release_id,
      folderId: getCollectionFolderId(),
      candidateJson: JSON.stringify(snapshotOf(candidate)),
      now,
    });
    const job = enqueueImport(db, importId);
    return { status: 'ok', importId, jobId: job.id };
  });
  try {
    return tx.immediate();
  } catch (err) {
    if (isUniqueViolation(err, 'imports.spine_id')) {
      return { status: 'already_confirmed' };
    }
    throw err;
  }
}

/**
 * Queues the import's add_to_collection job under the dedupe key
 * import:{spineId}:{releaseId}. A job with that key that is queued or
 * running is reused; a finished one gives up its key first, so a retry or
 * "Add another copy" is never a silent no-op (RESEARCH Pitfall 3). Sets
 * imports.job_id. Call inside an IMMEDIATE transaction; on its own it opens
 * one (nested, it becomes a savepoint).
 */
export function enqueueImport(
  db: Database.Database,
  importId: string,
): { id: string; created: boolean } {
  const tx = db.transaction(() => {
    const row = db
      .prepare('SELECT spine_id, release_id FROM imports WHERE id = @importId')
      .get({ importId }) as
      | { spine_id: string; release_id: number }
      | undefined;
    if (!row) throw new Error(`enqueueImport: import ${importId} not found`);
    const dedupeKey = `import:${row.spine_id}:${row.release_id}`;
    const holder = db
      .prepare('SELECT id, status FROM jobs WHERE dedupe_key = @dedupeKey')
      .get({ dedupeKey }) as { id: string; status: string } | undefined;
    let job: { id: string; created: boolean };
    if (holder && (holder.status === 'queued' || holder.status === 'running')) {
      job = { id: holder.id, created: false };
    } else {
      if (holder) releaseDedupeKey(holder.id);
      job = enqueue({
        lane: 'discogs',
        type: ADD_TO_COLLECTION_JOB_TYPE,
        payload: { importId },
        dedupeKey,
      });
    }
    db.prepare(
      'UPDATE imports SET job_id = @jobId, updated_at = @now WHERE id = @importId',
    ).run({ jobId: job.id, now: Date.now(), importId });
    return job;
  });
  return tx.immediate();
}

/**
 * Queues the check_import job (CR-01) for a failed import whose POST may
 * have landed, under the dedupe key import-check:{importId}, and sets
 * imports.job_id to it so the card and markInterruptedImports follow it. A
 * queued or running check is reused; a finished one gives up its key first.
 * Call inside an IMMEDIATE transaction.
 */
function enqueueImportCheck(
  db: Database.Database,
  importId: string,
): { id: string; created: boolean } {
  const dedupeKey = `import-check:${importId}`;
  const holder = db
    .prepare('SELECT id, status FROM jobs WHERE dedupe_key = @dedupeKey')
    .get({ dedupeKey }) as { id: string; status: string } | undefined;
  let job: { id: string; created: boolean };
  if (holder && (holder.status === 'queued' || holder.status === 'running')) {
    job = { id: holder.id, created: false };
  } else {
    if (holder) releaseDedupeKey(holder.id);
    job = enqueue({
      lane: 'discogs',
      type: CHECK_IMPORT_JOB_TYPE,
      payload: { importId },
      dedupeKey,
    });
  }
  db.prepare(
    'UPDATE imports SET job_id = @jobId, updated_at = @now WHERE id = @importId',
  ).run({ jobId: job.id, now: Date.now(), importId });
  return job;
}

export type CancelImportResult =
  | { status: 'ok' }
  | { status: 'not_found' }
  | { status: 'started' }
  | { status: 'checking'; jobId: string };

type LatestImport = ImportDbRow & { job_status: string | null };

/** The spine's latest import with its job's status (null when none). */
function latestImport(
  db: Database.Database,
  spineId: string,
): LatestImport | undefined {
  return db
    .prepare(
      `SELECT i.*, j.status AS job_status FROM imports i
       LEFT JOIN jobs j ON j.id = i.job_id
       WHERE i.spine_id = @spineId
       ORDER BY i.created_at DESC, i.id DESC
       LIMIT 1`,
    )
    .get({ spineId }) as LatestImport | undefined;
}

function phaseOf(row: LatestImport): ImportPhase {
  return importPhaseOf({
    status: row.status,
    intentAt: row.intent_at,
    jobStatus: row.job_status,
  });
}

/**
 * Change match (D-02): undoes the spine's latest import only while nothing
 * can have reached Discogs, by the same rule the card uses
 * (canChangeMatchOf): a waiting import with no intent whose job is still
 * queued (the job is cancelled and its dedupe key freed), an
 * already_in_collection hold with no intent, or a failed import with no
 * intent or one Discogs refused (not_found, rejected). The row is deleted:
 * nothing reached Discogs, so there is nothing to audit (A-04-10, A-04-11).
 * A failed import whose POST may have landed answers checking (CR-01): the
 * row goes back to pending, error cleared, and a check_import job reads the
 * owner's copies without ever POSTing; it adopts a copy that landed, or
 * deletes the row when nothing did, which completes the change. Anything
 * else answers started and changes nothing. One IMMEDIATE
 * transaction, so a worker cannot claim the job between the check and the
 * cancel (T-04-14); cancelQueuedJob's status = 'queued' predicate is the
 * fence regardless.
 */
export function cancelImport(
  db: Database.Database,
  spineId: string,
): CancelImportResult {
  const tx = db.transaction((): CancelImportResult => {
    const row = latestImport(db, spineId);
    if (!row) return { status: 'not_found' };
    const phase = phaseOf(row);
    const allowed = canChangeMatchOf({
      phase,
      intentAt: row.intent_at,
      errorKind: row.error_kind,
      jobStatus: row.job_status,
    });
    if (!allowed) {
      // canChangeMatchOf refuses a failed import only when its intent is
      // written and Discogs did not refuse the add: check, never POST.
      if (phase !== 'failed' || row.intent_at === null) {
        return { status: 'started' };
      }
      db.prepare(
        `UPDATE imports SET status = 'pending', error = NULL,
           error_kind = NULL, updated_at = @now
         WHERE id = @id`,
      ).run({ id: row.id, now: Date.now() });
      const job = enqueueImportCheck(db, row.id);
      return { status: 'checking', jobId: job.id };
    }
    if (phase === 'waiting') {
      if (!row.job_id || !cancelQueuedJob(row.job_id)) {
        return { status: 'started' };
      }
    }
    db.prepare('DELETE FROM imports WHERE id = @id').run({ id: row.id });
    return { status: 'ok' };
  });
  return tx.immediate();
}

export type RetrySpineResult =
  | { status: 'ok'; kind: 'import'; importId: string; jobId: string }
  | { status: 'ok'; kind: 'search'; searchId: string }
  | { status: 'nothing_to_retry' }
  | { status: 'busy' }
  | { status: 'not_found' };

/**
 * Retry import (D-13, REV-04, T-04-15): the same row goes back to pending
 * with its error cleared, keeping intent_at, snapshot_json, allow_duplicate
 * and existing_json, so the handler reconciles before any POST and adopts a
 * copy that already landed (D-07). enqueueImport reuses an in-flight job or
 * frees a finished one's dedupe key first, so there is never a second job.
 * Call inside an IMMEDIATE transaction; on its own it opens one.
 */
export function retryImport(
  db: Database.Database,
  importRow: Pick<ImportDbRow, 'id'>,
): { id: string; created: boolean } {
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE imports SET status = 'pending', error = NULL, error_kind = NULL,
         updated_at = @now
       WHERE id = @id`,
    ).run({ id: importRow.id, now: Date.now() });
    return enqueueImport(db, importRow.id);
  });
  return tx.immediate();
}

/**
 * Per-spine Retry (REV-04, D-13), never re-uploading or re-scanning the
 * photo. The latest import wins (adjacency: import first):
 * - failed (importPhaseOf, so a pending or importing row whose job failed,
 *   was cancelled or is missing counts) -> retryImport;
 * - waiting (its job still queued) -> the same job again, so a second
 *   click never makes a second job;
 * - importing -> busy;
 * - imported or already_in_collection -> nothing_to_retry.
 * With no import, a failed search (the card's own state, discogsForSpines)
 * is re-run with the current fields (enqueueExplicitSearch kind again).
 * A superseded or dismissed spine, or one marked not on Discogs, has
 * nothing to retry. One IMMEDIATE transaction, so two clicks serialize.
 */
export function retrySpine(
  db: Database.Database,
  spineId: string,
): RetrySpineResult {
  const tx = db.transaction((): RetrySpineResult => {
    const spine = db
      .prepare('SELECT state, not_on_discogs FROM spines WHERE id = @spineId')
      .get({ spineId }) as
      | { state: string; not_on_discogs: number }
      | undefined;
    if (!spine) return { status: 'not_found' };
    if (spine.state !== 'active' && spine.state !== 'orphaned') {
      return { status: 'nothing_to_retry' };
    }
    // A marked spine is never imported (WR-02), so its failed import is
    // not retried either: the owner unmarks it first.
    if (spine.not_on_discogs === 1) return { status: 'nothing_to_retry' };
    const row = latestImport(db, spineId);
    if (row) {
      switch (phaseOf(row)) {
        case 'failed': {
          const job = retryImport(db, row);
          return {
            status: 'ok',
            kind: 'import',
            importId: row.id,
            jobId: job.id,
          };
        }
        case 'waiting':
          if (row.job_id) {
            return {
              status: 'ok',
              kind: 'import',
              importId: row.id,
              jobId: row.job_id,
            };
          }
          return { status: 'busy' };
        case 'importing':
          return { status: 'busy' };
        default:
          return { status: 'nothing_to_retry' };
      }
    }
    const search = discogsForSpines(db, [{ id: spineId }]).get(spineId);
    if (search?.state !== 'failed') return { status: 'nothing_to_retry' };
    const res = enqueueExplicitSearch(db, { spineId, kind: 'again' });
    switch (res.status) {
      case 'ok':
        return { status: 'ok', kind: 'search', searchId: res.searchId };
      case 'busy':
        return { status: 'busy' };
      case 'not_found':
        return { status: 'not_found' };
      default:
        return { status: 'nothing_to_retry' };
    }
  });
  return tx.immediate();
}

export type LinkExistingResult =
  | { status: 'ok'; importId: string; instanceId: number }
  | { status: 'not_found' }
  | { status: 'not_held' }
  | { status: 'no_existing' };

/** existing_json as written by the handler; anything unreadable is empty. */
function existingCopies(json: string | null): ExistingInstance[] {
  if (!json) return [];
  const out: ExistingInstance[] = [];
  for (const e of jsonArray(json)) {
    if (!e || typeof e !== 'object') continue;
    const o = e as Record<string, unknown>;
    if (
      !Number.isSafeInteger(o.instanceId) ||
      !Number.isSafeInteger(o.folderId)
    ) {
      continue;
    }
    out.push({
      instanceId: o.instanceId as number,
      folderId: o.folderId as number,
      dateAdded: typeof o.dateAdded === 'string' ? o.dateAdded : '',
    });
  }
  return out;
}

/**
 * Link existing copy (D-05, T-04-30): the spine's latest import must be
 * held already_in_collection (else not_held). It takes the first copy in
 * existing_json (ascending instance_id) that no imports row records and
 * marks the import imported with that copy's instance and folder, linked 1.
 * No Discogs request. One IMMEDIATE transaction; imports_instance_idx is the
 * backstop, so one copy is linked to at most one spine (no_existing).
 */
export function linkExisting(
  db: Database.Database,
  spineId: string,
): LinkExistingResult {
  const tx = db.transaction((): LinkExistingResult => {
    const row = latestImport(db, spineId);
    if (!row) return { status: 'not_found' };
    if (row.status !== 'already_in_collection') return { status: 'not_held' };
    const recorded = db.prepare(
      'SELECT 1 FROM imports WHERE instance_id = @instanceId',
    );
    const copy = existingCopies(row.existing_json).find(
      (c) => !recorded.get({ instanceId: c.instanceId }),
    );
    if (!copy) return { status: 'no_existing' };
    const now = Date.now();
    db.prepare(
      `UPDATE imports SET status = 'imported', instance_id = @instanceId,
         folder_id = @folderId, linked = 1, imported_at = @now,
         error = NULL, error_kind = NULL, updated_at = @now
       WHERE id = @id`,
    ).run({
      id: row.id,
      instanceId: copy.instanceId,
      folderId: copy.folderId,
      now,
    });
    return { status: 'ok', importId: row.id, instanceId: copy.instanceId };
  });
  try {
    return tx.immediate();
  } catch (err) {
    if (isUniqueViolation(err, 'imports.instance_id')) {
      return { status: 'no_existing' };
    }
    throw err;
  }
}

export type AddAnotherCopyResult =
  | { status: 'ok'; importId: string; jobId: string }
  | { status: 'not_found' }
  | { status: 'not_held' };

/**
 * Add another copy (D-05, the remote decision; T-04-31): the owner owns
 * two, so the held import (already_in_collection) gets allow_duplicate 1,
 * goes back to pending with its error cleared, the held copies join its
 * snapshot (WR-04), and it is re-enqueued on the same row; that attempt
 * skips the hold and adds once. A second call while
 * that job is still queued returns the same job; anything else is not_held.
 * One IMMEDIATE transaction.
 */
export function addAnotherCopy(
  db: Database.Database,
  spineId: string,
): AddAnotherCopyResult {
  const tx = db.transaction((): AddAnotherCopyResult => {
    const row = latestImport(db, spineId);
    if (!row) return { status: 'not_found' };
    if (row.status !== 'already_in_collection') {
      if (
        row.allow_duplicate === 1 &&
        row.job_id &&
        phaseOf(row) === 'waiting'
      ) {
        return { status: 'ok', importId: row.id, jobId: row.job_id };
      }
      return { status: 'not_held' };
    }
    // The owner saw the held copies and wants one more: they join the
    // snapshot, so the add neither adopts nor holds on them again (WR-04).
    const seen = new Set<number>();
    if (row.snapshot_json) {
      for (const id of jsonArray(row.snapshot_json)) {
        if (Number.isSafeInteger(id)) seen.add(id as number);
      }
    }
    for (const c of existingCopies(row.existing_json)) seen.add(c.instanceId);
    db.prepare(
      `UPDATE imports SET allow_duplicate = 1, status = 'pending',
         snapshot_json = @snapshot, error = NULL, error_kind = NULL,
         updated_at = @now
       WHERE id = @id`,
    ).run({
      id: row.id,
      snapshot: JSON.stringify([...seen].sort((a, b) => a - b)),
      now: Date.now(),
    });
    const job = enqueueImport(db, row.id);
    return { status: 'ok', importId: row.id, jobId: job.id };
  });
  return tx.immediate();
}
