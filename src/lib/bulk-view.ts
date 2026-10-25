// How the /spines UI reads bulk state (Phase 6). Pure and client-safe.
import type { BulkItemPhase, BulkRunDto, BulkSkipReason } from './bulk-types';
import type { ImportPhase } from './import-types';

export type RunItemSummary = {
  phase: BulkItemPhase;
  skipReason: BulkSkipReason | null;
  country: string | null;
  importPhase: ImportPhase | null;
  hasImport: boolean;
};

export function summarizeRun(
  run: { id: string; country: string; folderName: string; createdAt: number },
  _items: RunItemSummary[],
): BulkRunDto {
  return {
    ...run,
    total: 0,
    done: 0,
    added: 0,
    fallbacks: 0,
    alreadyInCollection: 0,
    duplicates: 0,
    changed: 0,
    failed: 0,
    running: false,
  };
}
