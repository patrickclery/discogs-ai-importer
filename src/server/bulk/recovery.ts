import 'server-only';
import { getDb } from '../db/client';

// The interrupted-lookup maintenance hook (BULK-11, RESEARCH Pitfall 4 for
// lookups, T-06-14), copied from markInterruptedImports. When the worker
// gives up on a resolve_pressing job (its final attempt failed, recovery
// failed it after a crash on the final attempt, or it was cancelled),
// nothing else touches the item it was running. A job that finished
// succeeded while its item is still queued is abandoned the same way
// (WR-02): no attempt will ever move that item. The read model already
// reads such a queued item as failed (bulkItemPhaseOf), so no card shows
// Finding pressing forever; this hook makes the store agree, so the item
// stops holding bulk_items_spine_open_idx and the next run can start. Run on
// every lease tick after job recovery (handlers/index.ts maintenance): one
// UPDATE, never a request. It keeps an error kind and reason an earlier
// attempt recorded (unavailable stays unavailable), and otherwise records
// interrupted. Retry import re-runs the lookup on the same item.
// better-sqlite3 is built with DQS=0: string literals are single-quoted.

/** Stored when no earlier reason exists. */
export const INTERRUPTED_LOOKUP_REASON =
  'The lookup was interrupted when the app stopped. Retry runs it again.';

export function markInterruptedLookups(now = Date.now()): { failed: number } {
  const info = getDb()
    .$client.prepare(
      `UPDATE bulk_items SET status = 'failed',
         error_kind = COALESCE(error_kind, 'interrupted'),
         error = COALESCE(error, @reason),
         updated_at = @now
       WHERE status = 'queued'
         AND job_id IN (
           SELECT id FROM jobs
           WHERE status IN ('succeeded', 'failed', 'cancelled')
         )`,
    )
    .run({ reason: INTERRUPTED_LOOKUP_REASON, now });
  return { failed: info.changes };
}
