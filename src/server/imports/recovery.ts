import 'server-only';
import { getDb } from '../db/client';

// The interrupted-import maintenance hook (RESEARCH Pitfall 4, T-04-11).
// When the worker gives up on an add_to_collection job (its final attempt
// failed, or recovery failed it after a crash on the final attempt, or it
// was cancelled), nothing else touches the import it was running, so the
// card would read Importing forever. Run on every lease tick after job
// recovery (handlers/index.ts maintenance): one UPDATE, no network call.
// It keeps an error kind and reason an earlier attempt recorded (the last
// attempt's 5xx reads "Discogs didn't respond"), and otherwise records
// interrupted. Retry reopens the same row, keeping intent_at and the
// snapshot, so a POST that landed is adopted, never duplicated.
// better-sqlite3 is built with DQS=0: string literals are single-quoted.

/** UI-SPEC "Interrupted" line, stored when no earlier reason exists. */
export const INTERRUPTED_REASON =
  'The import was interrupted when the app stopped. Retry checks your collection first, so it never adds a second copy.';

export function markInterruptedImports(now = Date.now()): { failed: number } {
  const info = getDb()
    .$client.prepare(
      `UPDATE imports SET status = 'failed',
         error_kind = COALESCE(error_kind, 'interrupted'),
         error = COALESCE(error, @reason),
         updated_at = @now
       WHERE status IN ('pending', 'importing')
         AND job_id IN (
           SELECT id FROM jobs WHERE status IN ('failed', 'cancelled')
         )`,
    )
    .run({ reason: INTERRUPTED_REASON, now });
  return { failed: info.changes };
}
