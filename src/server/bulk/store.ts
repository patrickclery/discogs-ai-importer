import 'server-only';
import type Database from 'better-sqlite3';
import type {
  BulkItemStatus,
  BulkSkipReason,
  LookupErrorKind,
  PressingOutcome,
} from '@/lib/bulk-types';
import { capCodePoints } from '../discogs/inputs';
import { newId } from '../ids';
import { enqueue, releaseDedupeKey } from '../jobs/queue';

// Bulk runs and their items (D-08, D-09, D-14). startBulkRun writes one run
// and one queued item per pick, each with its own resolve_pressing job on
// the Discogs lane; the job moves the item to resolved, skipped or failed
// through the compare-and-set helpers below, which only ever change a
// queued item. Raw SQL with @named parameters; better-sqlite3 is built with
// DQS=0, so string literals are single-quoted.

export const RESOLVE_PRESSING_JOB_TYPE = 'resolve_pressing';

/** Owner-facing reasons are cut to this many code points (UI-SPEC). */
const REASON_MAX = 160;

export type BulkItemDbRow = {
  id: string;
  run_id: string;
  spine_id: string;
  candidate_id: string;
  status: BulkItemStatus;
  outcome: PressingOutcome | null;
  skip_reason: BulkSkipReason | null;
  dup_spine_id: string | null;
  release_id: number | null;
  country: string | null;
  import_id: string | null;
  error_kind: LookupErrorKind | null;
  error: string | null;
  job_id: string | null;
  created_at: number;
  updated_at: number;
};

export type BulkRunDbRow = {
  id: string;
  folder_id: number;
  country: string;
  total: number;
  created_at: number;
};

export type StartBulkRunResult =
  | { status: 'ok'; runId: string; started: number; skipped: number }
  | { status: 'busy' };

export function getBulkItem(
  db: Database.Database,
  id: string,
): BulkItemDbRow | undefined {
  return db.prepare('SELECT * FROM bulk_items WHERE id = @id').get({ id }) as
    | BulkItemDbRow
    | undefined;
}

export function getBulkRun(
  db: Database.Database,
  id: string,
): BulkRunDbRow | undefined {
  return db.prepare('SELECT * FROM bulk_runs WHERE id = @id').get({ id }) as
    | BulkRunDbRow
    | undefined;
}

/** Items whose resolve_pressing job has not finished. */
export function openBulkItemCount(db: Database.Database): number {
  return (
    db
      .prepare(`SELECT COUNT(*) AS n FROM bulk_items WHERE status = 'queued'`)
      .get() as { n: number }
  ).n;
}

/**
 * A pick that cannot be written: the spine already has an open item
 * (bulk_items_spine_open_idx, e.g. listed twice) or no longer exists.
 */
function isRefusedPick(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  if (e?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return true;
  if (e?.code !== 'SQLITE_CONSTRAINT_UNIQUE') return false;
  // SQLite names the columns of a violated index, not the index itself.
  return (
    typeof e.message === 'string' && e.message.includes('bulk_items.spine_id')
  );
}

/**
 * Starts one bulk run (D-08). One run at a time: while any item is still
 * queued the answer is busy and nothing is written. Each pick gets a queued
 * item and a resolve_pressing job (dedupe key pressing:{itemId}) whose
 * run_after is start + its index, so the lane claims them in pick order and
 * each spine's add job, which inherits its lookup's run_after, runs right
 * after that lookup. A pick the index or a foreign key refuses rolls back
 * alone and counts as skipped. One IMMEDIATE transaction.
 */
export function startBulkRun(
  db: Database.Database,
  input: {
    items: Array<{ spineId: string; candidateId: string }>;
    country: string;
    folderId: number;
    now?: number;
  },
): StartBulkRunResult {
  const start = input.now ?? Date.now();
  const tx = db.transaction((): StartBulkRunResult => {
    if (openBulkItemCount(db) > 0) return { status: 'busy' };
    const runId = newId();
    db.prepare(
      `INSERT INTO bulk_runs (id, folder_id, country, total, created_at)
       VALUES (@runId, @folderId, @country, 0, @start)`,
    ).run({
      runId,
      folderId: input.folderId,
      country: input.country,
      start,
    });
    const insertItem = db.prepare(
      `INSERT INTO bulk_items (id, run_id, spine_id, candidate_id, status,
         created_at, updated_at)
       VALUES (@id, @runId, @spineId, @candidateId, 'queued', @at, @at)`,
    );
    const setJob = db.prepare(
      'UPDATE bulk_items SET job_id = @jobId WHERE id = @id',
    );
    let started = 0;
    let skipped = 0;
    input.items.forEach((pick, i) => {
      const one = db.transaction(() => {
        const id = newId();
        insertItem.run({
          id,
          runId,
          spineId: pick.spineId,
          candidateId: pick.candidateId,
          at: start + i,
        });
        const job = enqueue({
          lane: 'discogs',
          type: RESOLVE_PRESSING_JOB_TYPE,
          payload: { itemId: id },
          dedupeKey: `pressing:${id}`,
          runAfter: start + i,
        });
        setJob.run({ jobId: job.id, id });
      });
      try {
        one();
        started++;
      } catch (err) {
        if (!isRefusedPick(err)) throw err;
        skipped++;
      }
    });
    db.prepare('UPDATE bulk_runs SET total = @started WHERE id = @runId').run({
      started,
      runId,
    });
    return { status: 'ok', runId, started, skipped };
  });
  return tx.immediate();
}

/** The item imports this release (an import was created). */
export function resolveBulkItem(
  db: Database.Database,
  itemId: string,
  out: {
    importId: string;
    releaseId: number;
    country: string | null;
    outcome: PressingOutcome;
  },
): boolean {
  return (
    db
      .prepare(
        `UPDATE bulk_items SET status = 'resolved', import_id = @importId,
           release_id = @releaseId, country = @country, outcome = @outcome,
           error_kind = NULL, error = NULL, updated_at = @now
         WHERE id = @itemId AND status = 'queued'`,
      )
      .run({ ...out, itemId, now: Date.now() }).changes === 1
  );
}

/** createImport refused the item (D-09) or the spine changed. */
export function skipBulkItem(
  db: Database.Database,
  itemId: string,
  out: { reason: BulkSkipReason; dupSpineId?: string | null },
): boolean {
  return (
    db
      .prepare(
        `UPDATE bulk_items SET status = 'skipped', skip_reason = @reason,
           dup_spine_id = @dupSpineId, error_kind = NULL, error = NULL,
           updated_at = @now
         WHERE id = @itemId AND status = 'queued'`,
      )
      .run({
        itemId,
        reason: out.reason,
        dupSpineId: out.dupSpineId ?? null,
        now: Date.now(),
      }).changes === 1
  );
}

/** The lookup failed for good; the reason is cut to 160 code points. */
export function failBulkItem(
  db: Database.Database,
  itemId: string,
  out: { errorKind: LookupErrorKind; error: string | null },
): boolean {
  return (
    db
      .prepare(
        `UPDATE bulk_items SET status = 'failed', error_kind = @errorKind,
           error = @error, updated_at = @now
         WHERE id = @itemId AND status = 'queued'`,
      )
      .run({
        itemId,
        errorKind: out.errorKind,
        error: out.error === null ? null : capCodePoints(out.error, REASON_MAX),
        now: Date.now(),
      }).changes === 1
  );
}

/** A retryable failure: the error is kept and the item stays queued. */
export function recordBulkItemError(
  db: Database.Database,
  itemId: string,
  out: { errorKind: LookupErrorKind; error: string | null },
): boolean {
  return (
    db
      .prepare(
        `UPDATE bulk_items SET error_kind = @errorKind, error = @error,
           updated_at = @now
         WHERE id = @itemId AND status = 'queued'`,
      )
      .run({
        itemId,
        errorKind: out.errorKind,
        error: out.error === null ? null : capCodePoints(out.error, REASON_MAX),
        now: Date.now(),
      }).changes === 1
  );
}

export type LatestBulkItem = BulkItemDbRow & { job_status: string | null };

/** The spine's newest bulk item with its job's status (null when none). */
export function latestBulkItemFor(
  db: Database.Database,
  spineId: string,
): LatestBulkItem | undefined {
  return db
    .prepare(
      `SELECT b.*, j.status AS job_status FROM bulk_items b
       LEFT JOIN jobs j ON j.id = b.job_id
       WHERE b.spine_id = @spineId
       ORDER BY b.created_at DESC, b.id DESC
       LIMIT 1`,
    )
    .get({ spineId }) as LatestBulkItem | undefined;
}

/**
 * Retry import on a failed lookup (BULK-11): the item goes back to queued
 * with its error cleared, under the job holding pressing:{itemId}. A queued
 * holder is reused, as is a running one while the item is still queued; a
 * finished one gives up its key first, so a retry is never a silent no-op
 * and never a second job (the enqueueImport pattern). A running holder of
 * an item that already left queued (it failed the item and has not been
 * marked finished yet) answers null, busy: reusing it would strand the item
 * queued under a job about to succeed (WR-02). The run keeps its country,
 * so the retry looks up the country the owner started with. Call inside an
 * IMMEDIATE transaction; on its own it opens one (nested, it becomes a
 * savepoint).
 */
export function retryBulkItem(
  db: Database.Database,
  itemId: string,
): { id: string; created: boolean } | null {
  const tx = db.transaction((): { id: string; created: boolean } | null => {
    const dedupeKey = `pressing:${itemId}`;
    const holder = db
      .prepare('SELECT id, status FROM jobs WHERE dedupe_key = @dedupeKey')
      .get({ dedupeKey }) as { id: string; status: string } | undefined;
    const current = getBulkItem(db, itemId);
    if (!current) throw new Error(`retryBulkItem: item ${itemId} not found`);
    let job: { id: string; created: boolean };
    if (
      holder &&
      (holder.status === 'queued' ||
        (holder.status === 'running' && current.status === 'queued'))
    ) {
      job = { id: holder.id, created: false };
    } else if (holder?.status === 'running') {
      return null;
    } else {
      if (holder) releaseDedupeKey(holder.id);
      job = enqueue({
        lane: 'discogs',
        type: RESOLVE_PRESSING_JOB_TYPE,
        payload: { itemId },
        dedupeKey,
      });
    }
    const info = db
      .prepare(
        `UPDATE bulk_items SET status = 'queued', error_kind = NULL,
           error = NULL, job_id = @jobId, updated_at = @now
         WHERE id = @itemId`,
      )
      .run({ jobId: job.id, now: Date.now(), itemId });
    if (info.changes !== 1) {
      throw new Error(`retryBulkItem: item ${itemId} not found`);
    }
    return job;
  });
  return tx.immediate();
}
