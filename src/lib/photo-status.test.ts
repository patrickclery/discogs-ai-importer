import { describe, expect, it } from 'vitest';
import {
  formatElapsed,
  incompleteTooltip,
  isActiveStatus,
  photosRefetchInterval,
  pluralize,
  statusView,
} from './photo-status';
import type { PhotoDto } from './scan-types';

const NOW = 1_800_000_000_000;

function photo(over: Partial<PhotoDto> = {}): PhotoDto {
  return {
    id: 'p1',
    filename: 'shelf.jpg',
    createdAt: NOW - 120_000,
    status: 'done',
    runNo: 1,
    model: 'claude-opus-5-5',
    modelLabel: 'Claude Opus 5.5',
    spawnedAt: null,
    finishedAt: null,
    errorReason: null,
    spineCount: 0,
    spineCountEstimate: null,
    detectedCount: null,
    truncated: false,
    densityFlags: [],
    thumbUrl: null,
    visionUrl: null,
    hasEarlierScan: false,
    ...over,
  };
}

describe('statusView', () => {
  it('reads "1 spine · Claude Opus 5.5" for a done photo with one spine', () => {
    const v = statusView(photo({ spineCount: 1 }), NOW);
    expect(v.label).toBe('Done');
    expect(v.tone).toBe('success');
    expect(v.subline).toBe('1 spine · Claude Opus 5.5');
  });

  it('pluralizes many spines', () => {
    expect(statusView(photo({ spineCount: 38 }), NOW).subline).toBe(
      '38 spines · Claude Opus 5.5',
    );
  });

  it('reads "No CDs found" for a done photo with 0 spines', () => {
    expect(statusView(photo({ spineCount: 0 }), NOW).subline).toBe(
      'No CDs found',
    );
  });

  it('shows the elapsed timer while Claude is reading (spawned 65 s ago)', () => {
    const v = statusView(
      photo({ status: 'calling', spawnedAt: NOW - 65_000 }),
      NOW,
    );
    expect(v.label).toBe('Analyzing');
    expect(v.tone).toBe('spinner');
    expect(v.subline).toBe('Claude is reading the spines… 1:05');
  });

  it('reads "Waiting for the worker" for a queued photo', () => {
    const v = statusView(photo({ status: 'queued' }), NOW);
    expect(v.label).toBe('Queued');
    expect(v.tone).toBe('muted');
    expect(v.subline).toBe('Waiting for the worker');
  });

  it('maps preparing and parsing to Analyzing with their sub-lines', () => {
    expect(statusView(photo({ status: 'preparing' }), NOW)).toEqual({
      label: 'Analyzing',
      tone: 'spinner',
      subline: 'Preparing image…',
    });
    expect(statusView(photo({ status: 'parsing' }), NOW).subline).toBe(
      'Cropping spines…',
    );
  });

  it('returns the server reason for an error', () => {
    const reason =
      "Claude's answer wasn't in the expected format. Re-scan to try again.";
    const v = statusView(photo({ status: 'error', errorReason: reason }), NOW);
    expect(v.label).toBe('Error');
    expect(v.tone).toBe('destructive');
    expect(v.subline).toBe(reason);
  });
});

describe('formatElapsed', () => {
  it('formats 65 000 ms as 1:05 and 0 as 0:00', () => {
    expect(formatElapsed(65_000)).toBe('1:05');
    expect(formatElapsed(0)).toBe('0:00');
  });

  it('reads 0:00 for a negative elapsed time (clock skew)', () => {
    expect(formatElapsed(-5_000)).toBe('0:00');
  });
});

describe('pluralize', () => {
  it('uses the plural for 0 and many, the singular for 1', () => {
    expect(pluralize(2, 'photo', 'photos')).toBe('2 photos');
    expect(pluralize(1, 'photo', 'photos')).toBe('1 photo');
    expect(pluralize(0, 'spine', 'spines')).toBe('0 spines');
  });
});

describe('isActiveStatus', () => {
  it('is true for queued, preparing, calling and parsing only', () => {
    for (const s of ['queued', 'preparing', 'calling', 'parsing'] as const) {
      expect(isActiveStatus(s)).toBe(true);
    }
    expect(isActiveStatus('done')).toBe(false);
    expect(isActiveStatus('error')).toBe(false);
  });
});

describe('photosRefetchInterval', () => {
  it('polls every 1.5 s while any photo is active and stops otherwise', () => {
    expect(photosRefetchInterval([photo(), photo({ status: 'calling' })])).toBe(
      1500,
    );
    expect(photosRefetchInterval([photo(), photo({ status: 'error' })])).toBe(
      false,
    );
    expect(photosRefetchInterval(undefined)).toBe(false);
  });
});

describe('incompleteTooltip', () => {
  it('reads the estimate and the returned count', () => {
    expect(
      incompleteTooltip(
        photo({ spineCountEstimate: 40, detectedCount: 25, spineCount: 24 }),
      ),
    ).toBe(
      'Claude estimated 40 spines but returned 25. Re-scan, or photograph a narrower section.',
    );
  });
});
