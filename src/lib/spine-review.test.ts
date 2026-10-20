import { describe, expect, it } from 'vitest';
import type { SpineFieldDto } from './scan-types';
import {
  confidencePct,
  editedCount,
  formatRelativeTime,
  isEdited,
  isLowConfidence,
  needsReview,
  normalizeFieldInput,
  spineNumber,
  worstField,
} from './spine-review';

function field(over: Partial<SpineFieldDto> = {}): SpineFieldDto {
  return {
    field: 'artist',
    aiValue: 'Bjork',
    value: 'Bjork',
    confidence: 0.9,
    editBaseAiValue: null,
    ...over,
  };
}

describe('normalizeFieldInput', () => {
  it('trims and maps empty to null', () => {
    expect(normalizeFieldInput('  Low  ')).toBe('Low');
    expect(normalizeFieldInput('   ')).toBeNull();
    expect(normalizeFieldInput('')).toBeNull();
    expect(normalizeFieldInput(null)).toBeNull();
  });
});

describe('isEdited', () => {
  it('compares value and aiValue exactly', () => {
    expect(isEdited(field())).toBe(false);
    expect(isEdited(field({ value: 'bjork' }))).toBe(true);
    expect(isEdited(field({ value: null }))).toBe(true);
    expect(isEdited(field({ aiValue: null, value: null }))).toBe(false);
  });
});

describe('isLowConfidence', () => {
  it('is strict below the threshold', () => {
    expect(isLowConfidence(field({ confidence: 0.59 }), 0.6)).toBe(true);
    expect(isLowConfidence(field({ confidence: 0.6 }), 0.6)).toBe(false);
  });
  it('ignores empty AI reads and edited fields', () => {
    expect(
      isLowConfidence(
        field({ aiValue: null, value: null, confidence: 0 }),
        0.6,
      ),
    ).toBe(false);
    expect(isLowConfidence(field({ value: 'x', confidence: 0.1 }), 0.6)).toBe(
      false,
    );
  });
});

describe('worstField / editedCount / needsReview', () => {
  const fields = [
    field({ field: 'artist', confidence: 0.5 }),
    field({ field: 'title', aiValue: 'T', value: 'T', confidence: 0.3 }),
    field({ field: 'label', aiValue: 'L', value: 'L', confidence: 0.3 }),
    field({ field: 'format', aiValue: 'CD', value: 'LP', confidence: 0.1 }),
  ];
  it('picks the lowest flagged field, first on a tie, skipping edits', () => {
    expect(worstField(fields, 0.6)?.field).toBe('title');
    expect(worstField([field()], 0.6)).toBeNull();
  });
  it('counts edited fields', () => {
    expect(editedCount(fields)).toBe(1);
  });
  it('needs review when any field is low confidence', () => {
    expect(needsReview({ fields }, 0.6)).toBe(true);
    expect(needsReview({ fields: [field()] }, 0.6)).toBe(false);
  });
});

describe('confidencePct / spineNumber', () => {
  it('rounds to a whole percent', () => {
    expect(confidencePct(0.414)).toBe(41);
    expect(confidencePct(0.416)).toBe(42);
  });
  it('shows a 1-based spine number', () => {
    expect(spineNumber({ index: 0 })).toBe(1);
  });
});

describe('formatRelativeTime', () => {
  const NOW = 1_800_000_000_000;
  it('reads just now, minutes, hours and days', () => {
    expect(formatRelativeTime(NOW - 10_000, NOW)).toBe('just now');
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe('5 minutes ago');
    expect(formatRelativeTime(NOW - 2 * 3_600_000, NOW)).toBe('2 hours ago');
    expect(formatRelativeTime(NOW - 86_400_000, NOW)).toBe('yesterday');
  });
});
