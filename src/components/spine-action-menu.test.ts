import { describe, expect, it } from 'vitest';
import type { ImportDto } from '@/lib/import-types';
import {
  canMarkNotOnDiscogs,
  IMPORTED_REFUSAL,
  markErrorText,
} from './spine-action-menu';

// UI-SPEC E10: when the menu offers Mark, and the inline error copy.

function withPhase(
  phase: ImportDto['phase'],
  canChangeMatch = true,
): ImportDto {
  return { phase, canChangeMatch } as ImportDto;
}

describe('canMarkNotOnDiscogs', () => {
  it('offers Mark on pending, not found and failed spines with no open import', () => {
    for (const reviewStatus of ['pending', 'not_found', 'failed'] as const) {
      expect(
        canMarkNotOnDiscogs({
          notOnDiscogs: false,
          import: null,
          reviewStatus,
        }),
      ).toBe(true);
    }
    expect(
      canMarkNotOnDiscogs({
        notOnDiscogs: false,
        import: withPhase('failed'),
        reviewStatus: 'failed',
      }),
    ).toBe(true);
  });

  it('never offers Mark when marked, matched, imported or an import is open', () => {
    expect(
      canMarkNotOnDiscogs({
        notOnDiscogs: true,
        import: null,
        reviewStatus: 'not_on_discogs',
      }),
    ).toBe(false);
    for (const phase of [
      'waiting',
      'importing',
      'already_in_collection',
      'imported',
    ] as const) {
      expect(
        canMarkNotOnDiscogs({
          notOnDiscogs: false,
          import: withPhase(phase),
          reviewStatus: 'failed',
        }),
      ).toBe(false);
    }
  });
});

describe('canMarkNotOnDiscogs on a failed import (WR-03)', () => {
  it('never offers Mark while a failed import may be on Discogs (Change match not open)', () => {
    expect(
      canMarkNotOnDiscogs({
        notOnDiscogs: false,
        import: withPhase('failed', false),
        reviewStatus: 'failed',
      }),
    ).toBe(false);
  });
});

describe('markErrorText', () => {
  it('shows the imported refusal verbatim', () => {
    expect(markErrorText(true, { error: 'imported', message: 'x' }, 409)).toBe(
      IMPORTED_REFUSAL,
    );
  });

  it('wraps the server reason for mark and unmark', () => {
    expect(
      markErrorText(
        true,
        {
          error: 'import_open',
          message:
            'This spine has a match being added. Change the match first.',
        },
        409,
      ),
    ).toBe(
      "Couldn't mark it: This spine has a match being added. Change the match first.",
    );
    expect(markErrorText(false, null, 500)).toBe(
      "Couldn't unmark it: the server answered 500.",
    );
  });
});
