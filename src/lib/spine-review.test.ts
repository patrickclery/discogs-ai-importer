import { describe, expect, it } from 'vitest';
import type { SpineFieldDto } from './scan-types';
import {
  confidencePct,
  editedCount,
  FIELD_LABELS,
  formatRelativeTime,
  isEdited,
  isLowConfidence,
  lowConfidenceTooltip,
  needsReview,
  normalizeFieldInput,
  rescanHint,
  resolveDisplayedValue,
  revertTooltip,
  spineNumber,
  withSpineField,
  worstField,
  worstFieldText,
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
    expect(needsReview({ fields, state: 'active' }, 0.6)).toBe(true);
    expect(needsReview({ fields: [field()], state: 'active' }, 0.6)).toBe(
      false,
    );
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

// Plan 02-09 (REV-02, D-08..D-10): edit detection, the warning rule, the
// polling guard and the copy the field and card show.
describe('isEdited (02-09)', () => {
  it('is exact: a case change is an edit', () => {
    expect(isEdited(field({ aiValue: 'Sigur Rós', value: 'sigur rós' }))).toBe(
      true,
    );
  });
  it('compares after trimming, so padding alone is not an edit', () => {
    expect(isEdited(field({ aiValue: 'abc', value: '  abc ' }))).toBe(false);
    expect(isEdited(field({ aiValue: '  ', value: null }))).toBe(false);
  });
});

describe('isLowConfidence (02-09)', () => {
  it('flags 0.59 at threshold 0.6 and not exactly 0.6', () => {
    expect(isLowConfidence(field({ confidence: 0.59 }), 0.6)).toBe(true);
    expect(isLowConfidence(field({ confidence: 0.6 }), 0.6)).toBe(false);
  });
  it('never flags a null AI read', () => {
    expect(
      isLowConfidence(
        field({ aiValue: null, value: 'typed', confidence: 0 }),
        0.6,
      ),
    ).toBe(false);
  });
  it('never flags an edited field, and flags it again after a revert', () => {
    const low = field({ aiValue: 'Bjork', confidence: 0.2 });
    expect(isLowConfidence({ ...low, value: 'Björk' }, 0.6)).toBe(false);
    expect(isLowConfidence({ ...low, value: 'Bjork' }, 0.6)).toBe(true);
  });
});

describe('worstField (02-09)', () => {
  it('returns the lowest flagged confidence', () => {
    const fields = [
      field({ field: 'artist', confidence: 0.5 }),
      field({ field: 'title', confidence: 0.41 }),
      field({ field: 'format', confidence: 0.9 }),
    ];
    expect(worstField(fields, 0.6)?.field).toBe('title');
  });
  it('returns null when nothing is flagged', () => {
    const fields = [
      field({ confidence: 0.6 }),
      field({ field: 'title', aiValue: null, value: null, confidence: 0 }),
    ];
    expect(worstField(fields, 0.6)).toBeNull();
  });
});

describe('resolveDisplayedValue (02-09, Pitfall 6)', () => {
  it('keeps the draft while focused', () => {
    expect(
      resolveDisplayedValue({
        serverValue: 'from poll',
        draft: 'typing',
        focused: true,
        dirty: false,
      }),
    ).toBe('typing');
  });
  it('keeps an unsaved draft after the field loses focus', () => {
    expect(
      resolveDisplayedValue({
        serverValue: 'from poll',
        draft: 'unsaved',
        focused: false,
        dirty: true,
      }),
    ).toBe('unsaved');
  });
  it('shows the server value otherwise, empty for null', () => {
    const idle = { draft: 'old', focused: false, dirty: false };
    expect(resolveDisplayedValue({ ...idle, serverValue: 'new' })).toBe('new');
    expect(resolveDisplayedValue({ ...idle, serverValue: null })).toBe('');
  });
});

describe('field and card copy (02-09)', () => {
  it('reads the low-confidence tooltip with a whole percent', () => {
    expect(lowConfidenceTooltip(0.414)).toBe(
      'Claude is 41% sure of this. Check it against the crop.',
    );
  });
  it('previews the AI read in the revert tooltip, or says empty', () => {
    expect(revertTooltip('Homogenic')).toBe(
      "Revert to Claude's read: \u201cHomogenic\u201d",
    );
    expect(revertTooltip(null)).toBe("Revert to Claude's read (empty)");
  });
  it('names the worst field in lower case with its percent', () => {
    const spine = {
      legibility: 'clear' as const,
      fields: [
        field({
          field: 'catalog_number',
          aiValue: 'TPLP1',
          value: 'TPLP1',
          confidence: 0.33,
        }),
        field({ field: 'title', confidence: 0.41 }),
      ],
    };
    expect(worstFieldText(spine, 0.6)).toBe('Check catalog number · 33%');
    expect(FIELD_LABELS.catalog_number).toBe('Catalog number');
  });
  it('reads Hard to read for an illegible detection, nothing when fine', () => {
    expect(
      worstFieldText(
        { legibility: 'illegible', fields: [field({ confidence: 0.2 })] },
        0.6,
      ),
    ).toBe('Hard to read');
    expect(
      worstFieldText({ legibility: 'clear', fields: [field()] }, 0.6),
    ).toBeNull();
  });
});

describe('withSpineField (02-09)', () => {
  const spine = {
    id: 's1',
    photoId: 'p1',
    index: 0,
    state: 'active' as const,
    legibility: 'clear' as const,
    crop: null,
    fields: [field(), field({ field: 'title', aiValue: 'T', value: 'T' })],
    createdRunId: null,
    orphanedRunNo: null,
    mediaKind: 'cd' as const,
    discogs: null,
  };
  it('replaces one field of one spine and keeps the AI read it is given', () => {
    const next = withSpineField({ spines: [spine] }, 's1', {
      ...spine.fields[1],
      value: 'T2',
      editBaseAiValue: 'T',
    });
    expect(next.spines[0].fields[1]).toMatchObject({
      value: 'T2',
      aiValue: 'T',
    });
    expect(next.spines[0].fields[0]).toBe(spine.fields[0]);
  });
  it('returns the same object when the spine is not listed', () => {
    const data = { spines: [spine] };
    expect(withSpineField(data, 'other', spine.fields[0])).toBe(data);
    expect(withSpineField(undefined, 's1', spine.fields[0])).toBeUndefined();
  });
});

describe('needsReview (02-12, D-07)', () => {
  const low = field({
    field: 'title',
    aiValue: 'T',
    value: 'T',
    confidence: 0.3,
  });
  it('is true for an orphaned spine even when every field is fine', () => {
    expect(needsReview({ state: 'orphaned', fields: [field()] }, 0.6)).toBe(
      true,
    );
  });
  it('is true for an active spine with a non-empty unedited field below the threshold', () => {
    expect(needsReview({ state: 'active', fields: [field(), low] }, 0.6)).toBe(
      true,
    );
  });
  it('is false when the low field is edited', () => {
    const edited = { ...low, value: 'Owner title', editBaseAiValue: 'T' };
    expect(needsReview({ state: 'active', fields: [edited] }, 0.6)).toBe(false);
  });
  it('is false when the low field was not read', () => {
    const empty = { ...low, aiValue: null, value: null };
    expect(needsReview({ state: 'active', fields: [empty] }, 0.6)).toBe(false);
  });
  it('is false exactly at the threshold', () => {
    const at = { ...low, confidence: 0.6 };
    expect(needsReview({ state: 'active', fields: [at] }, 0.6)).toBe(false);
  });
  it('is false for superseded and dismissed spines', () => {
    expect(needsReview({ state: 'superseded', fields: [low] }, 0.6)).toBe(
      false,
    );
    expect(needsReview({ state: 'dismissed', fields: [low] }, 0.6)).toBe(false);
  });
});

describe('rescanHint (02-12, D-15)', () => {
  const edited = field({
    field: 'title',
    aiValue: 'New read',
    value: 'Owner title',
    editBaseAiValue: 'Old read',
  });
  it('returns the new read when an edited field was re-read differently', () => {
    expect(rescanHint(edited)).toBe('New read');
  });
  it('returns null for an unedited field', () => {
    expect(rescanHint({ ...edited, value: 'New read' })).toBeNull();
  });
  it('returns null when the latest read is empty (A-18)', () => {
    expect(rescanHint({ ...edited, aiValue: null })).toBeNull();
  });
  it('returns null when the latest read equals the read the owner edited', () => {
    expect(rescanHint({ ...edited, aiValue: 'Old read' })).toBeNull();
  });
});
