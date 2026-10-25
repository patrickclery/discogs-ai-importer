// Demo bulk import (D-17): stub, implemented in the GREEN step.
import type { PressingOutcome } from '@/lib/bulk-types';
import type { DemoBulkItem, DemoState } from '../store';

export const BULK_STEP_MS = 1200;
export const BULK_LOOKUP_MS = 600;

export type StartBulkResult =
  | { status: 'ok'; runId: string; started: number; skipped: number }
  | { status: 'busy' }
  | { status: 'nothing'; skipped: number };

export type CannedPressing =
  | { outcome: 'pressing'; releaseId: number }
  | { outcome: Extract<PressingOutcome, 'fallback_no_master'> };

export function bulkItemPhaseAt(
  item: DemoBulkItem,
  _now: number,
): 'finding' | DemoBulkItem['status'] {
  return item.status;
}

export function startBulk(
  _state: DemoState,
  items: Array<{ spineId: string; candidateId: string }>,
  _now: number,
): StartBulkResult {
  return { status: 'nothing', skipped: items.length };
}
