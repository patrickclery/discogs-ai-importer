// Demo bulk import (D-17): POST /api/spines/bulk-import in memory. It
// mirrors startBulkRun (src/server/bulk/store.ts), the picks check
// (eligibilityOf plus the top-match rule) and the resolve_pressing job
// without importing them. Nothing runs on a timer and nothing reaches the
// network (T-06-25): each item's lookup is queued until lookupAt, running
// until readyAt, and its outcome is decided up front from the canned
// pressing answers in demo/fixtures/pressings.json. Its import is created
// with createdAt = readyAt, so the read model shows it only from then on
// (the store's timestamp rule, RESEARCH Pattern 3).
import { eligibilityOf, topMatchOf } from '@/lib/bulk-eligibility';
import type { PressingOutcome } from '@/lib/bulk-types';
import { importPhaseOf } from '@/lib/import-types';
import { countryMatch } from '@/lib/pressing';
import pressingsJson from '../../../demo/fixtures/pressings.json';
import {
  buildSpinesResponse,
  bulkItemPhaseAt,
  importRowAt,
  latestImport,
} from '../read-model';
import {
  type DemoBulkItem,
  type DemoBulkRun,
  type DemoCandidate,
  type DemoSpine,
  type DemoState,
  nextId,
} from '../store';
import { retrySpine, startImport } from './imports';

export { bulkItemPhaseAt } from '../read-model';

/** Lookups start this far apart (the Discogs lane's pacing). */
export const BULK_STEP_MS = 1200;
/** Each lookup runs this long. */
export const BULK_LOOKUP_MS = 600;

export type StartBulkResult =
  | { status: 'ok'; runId: string; started: number; skipped: number }
  | { status: 'busy' }
  | { status: 'nothing'; skipped: number };

/** A canned versions answer: a Canadian pressing, or no master. */
export type CannedPressing =
  | { outcome: 'pressing'; releaseId: number }
  | { outcome: Extract<PressingOutcome, 'fallback_no_master'> };

const CANNED: Readonly<Record<string, CannedPressing>> = (
  pressingsJson as unknown as { byKey: Record<string, CannedPressing> }
).byKey;

type BulkPick = { spineId: string; candidateId: string };

/**
 * The picks the run accepts: first pick per spine, the spine listed and
 * eligible (eligibilityOf with its current item), and the candidate still
 * its top match (RESEARCH Pitfall 5). Everything else counts skipped.
 */
function eligiblePicks(
  state: DemoState,
  items: readonly BulkPick[],
  now: number,
): { accepted: BulkPick[]; skipped: number } {
  const listed = new Map(
    buildSpinesResponse(state, now).spines.map((s) => [s.id, s]),
  );
  const seen = new Set<string>();
  const accepted: BulkPick[] = [];
  let skipped = 0;
  for (const p of items) {
    if (seen.has(p.spineId)) {
      skipped += 1;
      continue;
    }
    seen.add(p.spineId);
    const spine = listed.get(p.spineId);
    if (
      !spine ||
      !eligibilityOf(spine, spine.bulk?.item ?? null).eligible ||
      topMatchOf(spine)?.id !== p.candidateId
    ) {
      skipped += 1;
      continue;
    }
    accepted.push({ spineId: p.spineId, candidateId: p.candidateId });
  }
  return { accepted, skipped };
}

/** The hidden candidate a canned pressing imports (source 'pressing'). */
function pressingCandidate(
  state: DemoState,
  spine: DemoSpine,
  releaseId: number,
  at: number,
): DemoCandidate | null {
  const recorded = state.candidates.find(
    (c) =>
      c.spineId === spine.id &&
      c.releaseId === releaseId &&
      c.source === 'auto',
  );
  if (!recorded) return null;
  // demo-spine-40 -> demo-cand-40-pressing-1408104 (a pristine copy too).
  const id = `${spine.id.replace('-spine-', '-cand-')}-pressing-${releaseId}`;
  const existing = state.candidates.find(
    (c) => c.id === id && c.spineId === spine.id,
  );
  if (existing) {
    existing.removedAt = null;
    if (existing.addedAt > at) existing.addedAt = at;
    return existing;
  }
  const c: DemoCandidate = {
    ...structuredClone(recorded),
    id,
    source: 'pressing',
    addedAt: at,
    removedAt: null,
  };
  state.candidates.push(c);
  return c;
}

type ItemEnd = Pick<
  DemoBulkItem,
  | 'status'
  | 'outcome'
  | 'skipReason'
  | 'dupSpineId'
  | 'releaseId'
  | 'country'
  | 'importId'
  | 'candidateId'
>;

const changed = (candidateId: string): ItemEnd => ({
  status: 'skipped',
  outcome: null,
  skipReason: 'changed',
  dupSpineId: null,
  releaseId: null,
  country: null,
  importId: null,
  candidateId,
});

/**
 * What the resolve_pressing job would do at readyAt: reconcile an earlier
 * failed add that may have landed (D-20, retried_earlier), else keep a top
 * match in the preferred country, else take the canned pressing or fall
 * back to the top match; then create the import with the real local rules.
 */
function resolveAt(
  state: DemoState,
  run: DemoBulkRun,
  pick: BulkPick,
  readyAt: number,
): ItemEnd {
  const spine = state.spines.find((s) => s.id === pick.spineId);
  const top = state.candidates.find((c) => c.id === pick.candidateId);
  if (!spine || !top) return changed(pick.candidateId);

  const earlier = latestImport(state, spine.id, readyAt);
  if (earlier) {
    const row = importRowAt(earlier, readyAt);
    if (
      importPhaseOf(row) === 'failed' &&
      row.intentAt !== null &&
      earlier.errorKind !== 'not_found' &&
      earlier.errorKind !== 'rejected'
    ) {
      const res = retrySpine(state, spine.id, readyAt);
      if (res.status !== 'ok' || res.kind !== 'import') {
        return changed(pick.candidateId);
      }
      return {
        status: 'resolved',
        outcome: 'retried_earlier',
        skipReason: null,
        dupSpineId: null,
        releaseId: earlier.releaseId,
        country: earlier.snapshot.country,
        importId: res.importId,
        candidateId: pick.candidateId,
      };
    }
  }

  let chosen = top;
  let outcome: PressingOutcome;
  const match = countryMatch(top.country, run.country);
  const canned = CANNED[spine.key];
  if (match === 'exact') {
    outcome = 'preferred';
  } else if (canned?.outcome === 'pressing') {
    const pressing = pressingCandidate(state, spine, canned.releaseId, readyAt);
    if (pressing) {
      chosen = pressing;
      outcome = 'preferred';
    } else {
      outcome = match === 'combined' ? 'preferred' : 'fallback_no_version';
    }
  } else if (canned?.outcome === 'fallback_no_master') {
    outcome = 'fallback_no_master';
  } else {
    outcome = match === 'combined' ? 'preferred' : 'fallback_no_version';
  }

  const res = startImport(
    state,
    { spineId: spine.id, candidateId: chosen.id },
    readyAt,
  );
  if (res.status === 'ok') {
    return {
      status: 'resolved',
      outcome,
      skipReason: null,
      dupSpineId: null,
      releaseId: chosen.releaseId,
      country: chosen.country,
      importId: res.importId,
      candidateId: pick.candidateId,
    };
  }
  if (res.status === 'duplicate') {
    return {
      ...changed(pick.candidateId),
      skipReason: 'duplicate',
      dupSpineId: res.spineId,
    };
  }
  return changed(pick.candidateId);
}

/**
 * Starts one demo bulk run at `now` (startBulkRun). One run at a time:
 * while any item is still finding the answer is busy and nothing changes.
 * Accepted pick i is looked up from now + i * BULK_STEP_MS for
 * BULK_LOOKUP_MS, in pick order.
 */
export function startBulk(
  state: DemoState,
  items: readonly BulkPick[],
  now: number,
): StartBulkResult {
  if (state.bulkItems.some((i) => bulkItemPhaseAt(i, now) === 'finding')) {
    return { status: 'busy' };
  }
  const { accepted, skipped } = eligiblePicks(state, items, now);
  if (accepted.length === 0) return { status: 'nothing', skipped };
  const run: DemoBulkRun = {
    id: nextId('demo-bulk-run'),
    country: state.account.preferredCountry,
    folderId: state.account.folderId,
    total: accepted.length,
    createdAt: now,
  };
  state.bulkRuns.push(run);
  accepted.forEach((pick, i) => {
    const lookupAt = now + i * BULK_STEP_MS;
    const readyAt = lookupAt + BULK_LOOKUP_MS;
    const id = nextId('demo-bulk-item');
    const end = resolveAt(state, run, pick, readyAt);
    state.bulkItems.push({
      id,
      runId: run.id,
      spineId: pick.spineId,
      createdAt: now,
      lookupAt,
      readyAt,
      ...end,
    });
  });
  return { status: 'ok', runId: run.id, started: accepted.length, skipped };
}
