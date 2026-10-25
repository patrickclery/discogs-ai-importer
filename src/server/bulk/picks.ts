import 'server-only';
import type Database from 'better-sqlite3';
import { eligibilityOf, topMatchOf } from '@/lib/bulk-eligibility';
import { discogsForSpines } from '../discogs/queries';
import { importsForSpines } from '../imports/queries';
import { loadSpineDtos } from '../scan/queries';
import { bulkForSpines } from './queries';

// The server's re-check of the owner's bulk picks (D-07, T-06-17, RESEARCH
// Pitfall 5): the browser may have picked from a stale page, so each pick
// is accepted only when its spine still exists, is still eligible under the
// same rule the cards use, and the picked candidate is still the spine's
// top match. Run inside the start route's IMMEDIATE transaction.

export type BulkPick = { spineId: string; candidateId: string };

export function eligiblePicks(
  db: Database.Database,
  items: readonly BulkPick[],
): { accepted: BulkPick[]; skipped: number } {
  const seen = new Set<string>();
  const unique: BulkPick[] = [];
  let skipped = 0;
  for (const item of items) {
    if (seen.has(item.spineId)) {
      skipped++;
      continue;
    }
    seen.add(item.spineId);
    unique.push(item);
  }
  if (unique.length === 0) return { accepted: [], skipped };

  const spines = loadSpineDtos('s.id IN (SELECT value FROM json_each(@ids))', {
    ids: JSON.stringify(unique.map((p) => p.spineId)),
  });
  const summaries = discogsForSpines(db, spines);
  const imports = importsForSpines(db, spines);
  const bulkItems = bulkForSpines(db, spines);
  const byId = new Map(spines.map((s) => [s.id, s]));

  const accepted: BulkPick[] = [];
  for (const pick of unique) {
    const spine = byId.get(pick.spineId);
    if (!spine) {
      skipped++;
      continue;
    }
    spine.discogs = summaries.get(spine.id) ?? null;
    spine.import = imports.get(spine.id) ?? null;
    const item = bulkItems.get(spine.id) ?? null;
    if (
      !eligibilityOf(spine, item).eligible ||
      topMatchOf(spine)?.id !== pick.candidateId
    ) {
      skipped++;
      continue;
    }
    accepted.push({ spineId: pick.spineId, candidateId: pick.candidateId });
  }
  return { accepted, skipped };
}
