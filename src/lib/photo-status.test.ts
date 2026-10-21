import { describe, expect, it } from 'vitest';
import {
  DISCOGS_POLL_MS,
  formatElapsed,
  incompleteTooltip,
  isActiveStatus,
  POLL_RETRY_MS,
  photosRefetchInterval,
  pluralize,
  rowAction,
  spinesRefetchInterval,
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
    expect(
      photosRefetchInterval([photo(), photo({ status: 'calling' })], 'success'),
    ).toBe(1500);
    expect(
      photosRefetchInterval([photo(), photo({ status: 'error' })], 'success'),
    ).toBe(false);
    expect(photosRefetchInterval(undefined, 'success')).toBe(false);
  });

  it('keeps polling every 1.5 s for an active photo, even after a failed poll', () => {
    const photos = [photo(), photo({ status: 'parsing' })];
    expect(photosRefetchInterval(photos, 'success')).toBe(1500);
    expect(photosRefetchInterval(photos, 'error')).toBe(1500);
  });

  it('retries every 3 s after a failed poll when no photo is active', () => {
    const photos = [photo(), photo({ status: 'error' })];
    expect(POLL_RETRY_MS).toBe(3000);
    expect(photosRefetchInterval(photos, 'error')).toBe(POLL_RETRY_MS);
  });

  it('retries every 3 s after a failed poll with no data', () => {
    expect(photosRefetchInterval(undefined, 'error')).toBe(POLL_RETRY_MS);
  });

  it('does not poll while idle and the last poll succeeded', () => {
    const photos = [photo(), photo({ status: 'error' })];
    expect(photosRefetchInterval(photos, 'success')).toBe(false);
    expect(photosRefetchInterval(undefined, 'success')).toBe(false);
  });

  it('does not poll before the first fetch settles with no data', () => {
    expect(photosRefetchInterval(undefined, 'pending')).toBe(false);
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

describe('rowAction (/upload row actions, UI-SPEC E3)', () => {
  it('View spines for a done photo with spines', () => {
    expect(rowAction(photo({ status: 'done', spineCount: 2 }))).toBe(
      'view_spines',
    );
  });

  it('Re-scan for an error, or for done with 0 spines', () => {
    expect(rowAction(photo({ status: 'error' }))).toBe('rescan');
    expect(rowAction(photo({ status: 'done', spineCount: 0 }))).toBe('rescan');
  });

  it('no action while a run is queued or analyzing', () => {
    for (const status of [
      'queued',
      'preparing',
      'calling',
      'parsing',
    ] as const) {
      expect(rowAction(photo({ status }))).toBeNull();
    }
  });
});

describe('spinesRefetchInterval (UI-SPEC Polling)', () => {
  const options = (status: PhotoDto['status']) => [
    { id: 'p1', filename: 'a.jpg', status: 'done' as const },
    { id: 'p2', filename: 'b.jpg', status },
  ];

  it('polls every 3 s while a Discogs search is queued or running', () => {
    expect(DISCOGS_POLL_MS).toBe(3000);
    expect(
      spinesRefetchInterval(
        { photoOptions: options('done'), discogsActive: true },
        'success',
      ),
    ).toBe(3000);
  });

  it('keeps 1.5 s while a photo is analyzing (fastest wins)', () => {
    expect(
      spinesRefetchInterval(
        { photoOptions: options('calling'), discogsActive: true },
        'success',
      ),
    ).toBe(1500);
    expect(
      spinesRefetchInterval(
        { photoOptions: options('queued'), discogsActive: false },
        'error',
      ),
    ).toBe(1500);
  });

  it('stops polling once nothing is active', () => {
    expect(
      spinesRefetchInterval(
        { photoOptions: options('error'), discogsActive: false },
        'success',
      ),
    ).toBe(false);
    expect(spinesRefetchInterval(undefined, 'success')).toBe(false);
  });

  it('retries every 3 s after a failed poll, with or without searches', () => {
    expect(
      spinesRefetchInterval(
        { photoOptions: options('done'), discogsActive: true },
        'error',
      ),
    ).toBe(3000);
    expect(
      spinesRefetchInterval(
        { photoOptions: options('done'), discogsActive: false },
        'error',
      ),
    ).toBe(3000);
    expect(spinesRefetchInterval(undefined, 'error')).toBe(3000);
  });
});
