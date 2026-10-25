import { describe, expect, it } from 'vitest';
import {
  eligibleShownIds,
  pruneSelection,
  selectAllState,
} from './bulk-selection';
import type { EligibilityReason } from './bulk-types';

// Selection over the shown list (D-05, D-06): only shown, eligible spines
// can be selected, and the selection never holds anything else.

function row(id: string, eligible: boolean | null) {
  return {
    id,
    bulk:
      eligible === null
        ? null
        : {
            eligible,
            reason: (eligible ? null : 'no_match') as EligibilityReason | null,
            item: null,
          },
  };
}

describe('eligibleShownIds', () => {
  it('keeps the eligible spines in list order', () => {
    expect(
      eligibleShownIds([
        row('c', true),
        row('a', false),
        row('b', true),
        row('d', null),
      ]),
    ).toEqual(['c', 'b']);
  });

  it('is empty for an empty list', () => {
    expect(eligibleShownIds([])).toEqual([]);
  });
});

describe('pruneSelection', () => {
  it('drops ids that are not allowed', () => {
    expect([
      ...pruneSelection(new Set(['a', 'b', 'x']), ['b', 'a', 'c']),
    ]).toEqual(['a', 'b']);
  });

  it('keeps the same contents when nothing drops', () => {
    const before = new Set(['a', 'b']);
    const after = pruneSelection(before, ['a', 'b', 'c']);
    expect([...after]).toEqual(['a', 'b']);
  });

  it('empties when nothing is allowed', () => {
    expect(pruneSelection(new Set(['a']), []).size).toBe(0);
  });
});

describe('selectAllState', () => {
  it('is checked when every eligible spine is selected', () => {
    expect(selectAllState(new Set(['a', 'b']), ['a', 'b'])).toBe('checked');
  });

  it('is indeterminate when some are', () => {
    expect(selectAllState(new Set(['a']), ['a', 'b'])).toBe('indeterminate');
  });

  it('is unchecked when none are', () => {
    expect(selectAllState(new Set(), ['a', 'b'])).toBe('unchecked');
  });

  it('is unchecked when nothing shown is eligible', () => {
    expect(selectAllState(new Set(['a']), [])).toBe('unchecked');
  });
});
