// Which spines a bulk import may select (D-06, D-16, D-20), and how a bulk
// item reads on a card. Pure and client-safe: the read model computes it per
// spine and the cards and the demo reuse it.
import type {
  BulkItemDto,
  BulkItemPhase,
  BulkItemStatus,
  EligibilityReason,
} from './bulk-types';
import type { CandidateDto } from './discogs-types';
import type { SpineDto } from './scan-types';

/** The card's "Top match": the first candidate in D-10 order. */
export function topMatchOf(
  spine: Pick<SpineDto, 'discogs'>,
): CandidateDto | null {
  return spine.discogs?.topCandidates[0] ?? null;
}

/**
 * A queued item whose job failed, was cancelled or is missing reads as
 * failed (the importPhaseOf read-model defence, RESEARCH Pattern 9): no card
 * stays Finding pressing after the worker gave up.
 */
export function bulkItemPhaseOf(x: {
  status: BulkItemStatus;
  jobStatus: string | null;
}): BulkItemPhase {
  if (x.status !== 'queued') return x.status;
  return x.jobStatus === 'queued' || x.jobStatus === 'running'
    ? 'finding'
    : 'failed';
}

/**
 * The item still describes the spine: no import came after it, or the
 * latest import is the one it created. On a createdAt tie only its own
 * import counts.
 */
export function isCurrentBulkItem(
  item: { importId: string | null; createdAt: number; id: string },
  latestImport: { id: string; createdAt: number } | null,
): boolean {
  if (latestImport === null) return true;
  if (item.importId !== null && item.importId === latestImport.id) return true;
  return item.createdAt > latestImport.createdAt;
}

export type Eligibility =
  | { eligible: true; reason: null }
  | { eligible: false; reason: EligibilityReason };

const no = (reason: EligibilityReason): Eligibility => ({
  eligible: false,
  reason,
});

/**
 * One answer per spine, first reason wins. A failed import stays eligible
 * (D-20: the job reconciles it, D-07) and confidence is never read (D-16).
 * `item` is the spine's current bulk item only; pass null otherwise.
 */
export function eligibilityOf(
  spine: Pick<SpineDto, 'state' | 'notOnDiscogs' | 'discogs' | 'import'>,
  item: BulkItemDto | null,
): Eligibility {
  if (spine.state !== 'active') return no('orphaned');
  if (spine.notOnDiscogs) return no('not_on_discogs');
  const imp = spine.import;
  if (imp?.phase === 'imported') return no('imported');
  if (
    imp &&
    (imp.phase === 'waiting' || imp.phase === 'importing' || imp.checking)
  ) {
    return no('import_open');
  }
  if (imp?.phase === 'already_in_collection') return no('import_held');
  if (item?.phase === 'finding') return no('finding');
  if (item?.phase === 'skipped' && item.skip?.reason === 'duplicate') {
    return no('skipped_duplicate');
  }
  const search = spine.discogs?.state;
  if (search === 'queued' || search === 'searching') return no('searching');
  if (!topMatchOf(spine)) return no('no_match');
  return { eligible: true, reason: null };
}
