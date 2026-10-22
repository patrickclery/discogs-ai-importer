import { describe, expect, it } from 'vitest';
import { REVIEW_STATUSES, type ReviewStatus } from './import-types';
import {
  leftCount,
  movedOutOf,
  nextShownId,
  parseStatusParam,
  type ReviewStatusInput,
  reviewStatusOf,
} from './review-status';

const BASE: ReviewStatusInput = {
  importPhase: null,
  importInstanceId: null,
  notOnDiscogs: false,
  searchState: 'done',
  candidateCount: 3,
};

function status(over: Partial<ReviewStatusInput>): ReviewStatus {
  return reviewStatusOf({ ...BASE, ...over });
}

describe('reviewStatusOf (D-10 order)', () => {
  it('an import with an instance id is imported', () => {
    expect(status({ importPhase: 'imported', importInstanceId: 5001 })).toBe(
      'imported',
    );
  });

  it('a linked copy (instance id recorded) is imported', () => {
    expect(
      status({
        importPhase: 'imported',
        importInstanceId: 7,
        searchState: 'failed',
      }),
    ).toBe('imported');
  });

  it('imported wins over the not-on-Discogs mark', () => {
    expect(
      status({
        importPhase: 'imported',
        importInstanceId: 5001,
        notOnDiscogs: true,
      }),
    ).toBe('imported');
  });

  it('a marked spine with no instance is not_on_discogs', () => {
    expect(status({ notOnDiscogs: true })).toBe('not_on_discogs');
  });

  it('the mark wins over a failed import', () => {
    expect(status({ notOnDiscogs: true, importPhase: 'failed' })).toBe(
      'not_on_discogs',
    );
  });

  it('a failed import is failed', () => {
    expect(status({ importPhase: 'failed' })).toBe('failed');
  });

  it('a failed search is failed', () => {
    expect(status({ searchState: 'failed' })).toBe('failed');
  });

  it('a failed search is failed even with an open import (A-04-09)', () => {
    expect(status({ importPhase: 'waiting', searchState: 'failed' })).toBe(
      'failed',
    );
  });

  it('a waiting import is matched', () => {
    expect(status({ importPhase: 'waiting' })).toBe('matched');
  });

  it('an importing import is matched', () => {
    expect(status({ importPhase: 'importing' })).toBe('matched');
  });

  it('an already_in_collection hold is matched', () => {
    expect(status({ importPhase: 'already_in_collection' })).toBe('matched');
  });

  it('no_match with no candidate is not_found', () => {
    expect(status({ searchState: 'no_match', candidateCount: 0 })).toBe(
      'not_found',
    );
  });

  it('no_match with a manual candidate is pending', () => {
    expect(status({ searchState: 'no_match', candidateCount: 1 })).toBe(
      'pending',
    );
  });

  it.each(['not_searched', 'queued', 'searching', 'done'] as const)(
    'search state %s is pending',
    (searchState) => {
      expect(status({ searchState })).toBe('pending');
    },
  );

  it('no search summary at all is pending', () => {
    expect(status({ searchState: null, candidateCount: 0 })).toBe('pending');
  });
});

describe('parseStatusParam', () => {
  it.each(REVIEW_STATUSES)('%s round-trips', (s) => {
    expect(parseStatusParam(s)).toBe(s);
  });

  it.each(['', 'All', 'all', 'IMPORTED', 'imported ', 'bogus'])(
    '%j reads as All (undefined)',
    (v) => {
      expect(parseStatusParam(v)).toBeUndefined();
    },
  );

  it('null and undefined read as All', () => {
    expect(parseStatusParam(null)).toBeUndefined();
    expect(parseStatusParam(undefined)).toBeUndefined();
  });
});

describe('leftCount', () => {
  it('is pending + matched + not_found + failed', () => {
    expect(
      leftCount({
        pending: 5,
        matched: 2,
        imported: 40,
        not_found: 3,
        not_on_discogs: 7,
        failed: 1,
      }),
    ).toBe(11);
  });

  it('is 0 when every spine is imported or marked', () => {
    expect(
      leftCount({
        pending: 0,
        matched: 0,
        imported: 4,
        not_found: 0,
        not_on_discogs: 2,
        failed: 0,
      }),
    ).toBe(0);
  });
});

describe('movedOutOf', () => {
  it('names the new status when the spine left the active filter', () => {
    expect(movedOutOf('pending', 'matched')).toBe('matched');
  });

  it('is null under All', () => {
    expect(movedOutOf(null, 'matched')).toBeNull();
  });

  it('is null when the status is unchanged', () => {
    expect(movedOutOf('failed', 'failed')).toBeNull();
  });

  it('is null when the new status is unknown', () => {
    expect(movedOutOf('pending', undefined)).toBeNull();
  });
});

describe('nextShownId', () => {
  const order = ['a', 'b', 'c', 'd'];

  it('is the next card still shown', () => {
    expect(nextShownId(order, 'b', new Set(['a', 'c', 'd']))).toBe('c');
  });

  it('skips cards that also left', () => {
    expect(nextShownId(order, 'b', new Set(['a', 'd']))).toBe('d');
  });

  it('falls back to the nearest card before the last one', () => {
    expect(nextShownId(order, 'd', new Set(['a', 'b']))).toBe('b');
  });

  it('is null when no card is left', () => {
    expect(nextShownId(order, 'b', new Set())).toBeNull();
  });

  it('an unknown spine gives the first shown card', () => {
    expect(nextShownId(order, 'z', new Set(['c', 'd']))).toBe('c');
  });
});
