// Bulk selection helpers (D-05, D-06). Pure and client-safe.
import type { SpineDto } from './scan-types';

export type SelectAllState = 'checked' | 'indeterminate' | 'unchecked';

export function eligibleShownIds(
  _spines: readonly Pick<SpineDto, 'id' | 'bulk'>[],
): string[] {
  return [];
}

export function pruneSelection(
  _selected: ReadonlySet<string>,
  _allowed: readonly string[],
): Set<string> {
  return new Set();
}

export function selectAllState(
  _selected: ReadonlySet<string>,
  _eligible: readonly string[],
): SelectAllState {
  return 'unchecked';
}
