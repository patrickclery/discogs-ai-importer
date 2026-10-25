// Bulk selection over the shown list (D-05, D-06). Pure and client-safe.
// The selection only ever holds shown, eligible spines: every data update
// prunes it, so the selected count always matches what is visible.
import type { SpineDto } from './scan-types';

export type SelectAllState = 'checked' | 'indeterminate' | 'unchecked';

/** The shown spines a bulk import accepts, in list order. */
export function eligibleShownIds(
  spines: readonly Pick<SpineDto, 'id' | 'bulk'>[],
): string[] {
  return spines.filter((s) => s.bulk?.eligible === true).map((s) => s.id);
}

/** The selected ids that are still allowed, in selection order. */
export function pruneSelection(
  selected: ReadonlySet<string>,
  allowed: readonly string[],
): Set<string> {
  const ok = new Set(allowed);
  return new Set([...selected].filter((id) => ok.has(id)));
}

/** The Select all shown checkbox: every, some or none of `eligible` picked. */
export function selectAllState(
  selected: ReadonlySet<string>,
  eligible: readonly string[],
): SelectAllState {
  if (eligible.length === 0) return 'unchecked';
  const picked = eligible.filter((id) => selected.has(id)).length;
  if (picked === 0) return 'unchecked';
  return picked === eligible.length ? 'checked' : 'indeterminate';
}
