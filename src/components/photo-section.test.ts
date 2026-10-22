import { describe, expect, it } from 'vitest';
import type { PhotoDto } from '@/lib/scan-types';
import { sectionSubline } from './photo-section';

// The photo section sub-line (D-12, UI-SPEC E4): a done photo with spines
// leads with '{i} / {n} imported'; active, error and empty photos keep their
// Phase 2 lines.

const NOW = 1_800_000_000_000;

function photo(over: Partial<PhotoDto> = {}): PhotoDto {
  return {
    id: 'p1',
    filename: 'shelf.jpg',
    createdAt: NOW - 600_000,
    status: 'done',
    runNo: 1,
    model: 'claude-opus-5-5',
    modelLabel: 'Claude Opus 5.5',
    spawnedAt: null,
    finishedAt: NOW - 300_000,
    errorReason: null,
    spineCount: 40,
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

describe('sectionSubline', () => {
  it('leads a done photo with its imported progress', () => {
    expect(sectionSubline(photo(), NOW, { imported: 12, total: 40 })).toBe(
      '12 / 40 imported · Claude Opus 5.5 · scanned 5 minutes ago',
    );
  });

  it('counts orphaned spines in n, from the progress', () => {
    expect(
      sectionSubline(photo({ spineCount: 5 }), NOW, { imported: 0, total: 6 }),
    ).toBe('0 / 6 imported · Claude Opus 5.5 · scanned 5 minutes ago');
  });

  it('keeps No CDs found for a done photo without spines', () => {
    expect(
      sectionSubline(photo({ spineCount: 0 }), NOW, { imported: 0, total: 0 }),
    ).toBe('No CDs found · Claude Opus 5.5 · scanned 5 minutes ago');
  });

  it('keeps the spine count for an error photo', () => {
    expect(
      sectionSubline(photo({ status: 'error', spineCount: 3 }), NOW, {
        imported: 1,
        total: 3,
      }),
    ).toBe('3 spines · Claude Opus 5.5 · scanned 5 minutes ago');
  });

  it('falls back to the spine count without progress', () => {
    expect(sectionSubline(photo({ spineCount: 1 }), NOW)).toBe(
      '1 spine · Claude Opus 5.5 · scanned 5 minutes ago',
    );
  });
});
