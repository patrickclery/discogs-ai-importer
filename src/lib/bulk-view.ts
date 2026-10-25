// How the /spines UI reads bulk state (Phase 6): the run summary behind the
// progress line and the finished toast (D-15). Pure and client-safe: the
// read model and the demo compute it, the cards and the bar read it.
import type {
  BulkItemDto,
  BulkItemPhase,
  BulkRunDto,
  BulkSkipReason,
} from './bulk-types';
import type { ImportPhase } from './import-types';
import { countryMatch } from './pressing';
import type { SpineDto } from './scan-types';

/** One item of a run as summarizeRun reads it. */
export type RunItemSummary = {
  phase: BulkItemPhase;
  skipReason: BulkSkipReason | null;
  /** The chosen release's country, once resolved. */
  country: string | null;
  /** The phase of the import the item created, or null. */
  importPhase: ImportPhase | null;
  /** The import the item created still exists. */
  hasImport: boolean;
};

/**
 * The run's progress and result counts. An item is done once its lookup
 * ended and, when it created an import, that import finished: a finding
 * item and a resolved item whose import is waiting or importing are not
 * done. A resolved item whose import row is gone counts as changed. A
 * resolved item whose release is not in the run's country counts as a
 * fallback (a combined country naming it is not, D-19), whatever its
 * import's phase.
 */
export function summarizeRun(
  run: { id: string; country: string; folderName: string; createdAt: number },
  items: readonly RunItemSummary[],
): BulkRunDto {
  const out: BulkRunDto = {
    ...run,
    total: items.length,
    done: 0,
    added: 0,
    fallbacks: 0,
    alreadyInCollection: 0,
    duplicates: 0,
    changed: 0,
    failed: 0,
    running: false,
  };
  for (const item of items) {
    if (item.phase === 'finding') continue;
    if (item.phase === 'failed') {
      out.failed += 1;
      out.done += 1;
      continue;
    }
    if (item.phase === 'skipped') {
      if (item.skipReason === 'duplicate') out.duplicates += 1;
      else out.changed += 1;
      out.done += 1;
      continue;
    }
    if (countryMatch(item.country, run.country) === 'none') out.fallbacks += 1;
    if (!item.hasImport) {
      out.changed += 1;
      out.done += 1;
      continue;
    }
    if (item.importPhase === 'imported') out.added += 1;
    else if (item.importPhase === 'already_in_collection') {
      out.alreadyInCollection += 1;
    } else if (item.importPhase === 'failed') out.failed += 1;
    else continue;
    out.done += 1;
  }
  out.running = out.done < out.total;
  return out;
}

/** The country badge on a bulk-imported card (D-15, D-19). */
export type CountryBadge = {
  kind: 'preferred' | 'fallback';
  /** The imported release's country, or null when Discogs gave none. */
  country: string | null;
};

/**
 * The badge for a spine whose current import came from a bulk run: its
 * item resolved and created the spine's latest import. Preferred when the
 * release's country is the run's (a combined country naming it counts,
 * D-19), fallback otherwise. Null for every other spine, including one a
 * later manual import replaced.
 */
export function countryBadgeOf(
  spine: Pick<SpineDto, 'import' | 'bulk'>,
): CountryBadge | null {
  const item = spine.bulk?.item;
  if (item?.phase !== 'resolved' || item.importId === null) {
    return null;
  }
  if (item.importId !== spine.import?.id) return null;
  return {
    kind:
      countryMatch(item.country, item.preferredCountry) === 'none'
        ? 'fallback'
        : 'preferred',
    country: item.country,
  };
}

/** The spine was bulk-imported from another country (the Fallback filter). */
export function isFallbackSpine(
  spine: Pick<SpineDto, 'import' | 'bulk'>,
): boolean {
  return countryBadgeOf(spine)?.kind === 'fallback';
}

/**
 * The spine's current lookup for reviewStatusOf: finding while its job is
 * queued or running, failed once it failed or was abandoned, else null.
 */
export function lookupOf(
  item: BulkItemDto | null,
): 'finding' | 'failed' | null {
  if (item?.phase === 'finding') return 'finding';
  if (item?.phase === 'failed') return 'failed';
  return null;
}
