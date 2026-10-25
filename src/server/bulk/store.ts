import 'server-only';
import type Database from 'better-sqlite3';
import type {
  BulkItemStatus,
  BulkSkipReason,
  LookupErrorKind,
  PressingOutcome,
} from '@/lib/bulk-types';

// RED stub (Plan 06-02 Task 1): signatures only.

export const RESOLVE_PRESSING_JOB_TYPE = 'resolve_pressing';

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
  _db: Database.Database,
  _id: string,
): BulkItemDbRow | undefined {
  return undefined;
}

export function getBulkRun(
  _db: Database.Database,
  _id: string,
): BulkRunDbRow | undefined {
  return undefined;
}

export function openBulkItemCount(_db: Database.Database): number {
  return 0;
}

export function startBulkRun(
  _db: Database.Database,
  _input: {
    items: Array<{ spineId: string; candidateId: string }>;
    country: string;
    folderId: number;
    now?: number;
  },
): StartBulkRunResult {
  return { status: 'busy' };
}
