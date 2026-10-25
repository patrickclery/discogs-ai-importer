import { describe, expect, it } from 'vitest';
import type { CandidateDto, SpineDiscogsDto } from '@/lib/discogs-types';
import type { ImportDto } from '@/lib/import-types';
import { matchDetails, matchSlotOf } from './bulk-copy';

// The compact card's match slot (D-10, UI-SPEC "Match slot labels" and
// "Match slot placeholders"): the confirmed import's release, else the
// rank-1 candidate, else one line naming the search state.

function candidate(over: Partial<CandidateDto> = {}): CandidateDto {
  return {
    id: 'c1',
    releaseId: 1234,
    title: 'Nirvana - Nevermind',
    year: 1991,
    country: 'US',
    labels: ['DGC'],
    catno: 'DGCD-24425',
    formats: [],
    hasThumb: true,
    source: 'auto',
    catnoMatch: false,
    stage: null,
    ...over,
  };
}

function discogs(over: Partial<SpineDiscogsDto> = {}): SpineDiscogsDto {
  return {
    state: 'done',
    candidateCount: 1,
    topCandidates: [candidate()],
    failure: null,
    fieldsChanged: false,
    ...over,
  };
}

function importDto(over: Partial<ImportDto> = {}): ImportDto {
  return {
    id: 'i1',
    phase: 'waiting',
    releaseId: 777,
    candidateId: 'c9',
    candidate: {
      title: 'Nirvana - Nevermind',
      year: 1991,
      country: 'Canada',
      labels: ['DGC'],
      catno: 'CDGC-24425',
      formats: [],
    },
    hasThumb: true,
    folderId: 1,
    folderName: 'Uncategorized',
    instanceId: null,
    linked: false,
    adopted: false,
    importedAt: null,
    existing: null,
    failure: null,
    canChangeMatch: true,
    canRetry: false,
    checking: false,
    ...over,
  };
}

const base = { import: null, discogs: discogs(), notOnDiscogs: false };

describe('matchDetails', () => {
  it('joins year, country and catalog number', () => {
    expect(
      matchDetails({ year: 1991, country: 'US', catno: 'DGCD-24425' }),
    ).toBe('1991 · US · DGCD-24425');
  });

  it('omits missing parts', () => {
    expect(
      matchDetails({ year: 1991, country: null, catno: 'DGCD-24425' }),
    ).toBe('1991 · DGCD-24425');
    expect(matchDetails({ year: 0, country: '  ', catno: 'X1' })).toBe('X1');
  });

  it('reads No details when every part is missing', () => {
    expect(matchDetails({ year: null, country: null, catno: null })).toBe(
      'No details',
    );
  });
});

describe('matchSlotOf', () => {
  it('shows the rank-1 candidate as the Top match', () => {
    expect(matchSlotOf(base)).toEqual({
      label: 'Top match',
      match: {
        candidateId: 'c1',
        releaseId: 1234,
        title: 'Nirvana - Nevermind',
        details: '1991 · US · DGCD-24425',
        hasThumb: true,
      },
      placeholder: null,
    });
  });

  it('shows the import snapshot as the Confirmed match', () => {
    expect(matchSlotOf({ ...base, import: importDto() })).toEqual({
      label: 'Confirmed match',
      match: {
        candidateId: 'c9',
        releaseId: 777,
        title: 'Nirvana - Nevermind',
        details: '1991 · Canada · CDGC-24425',
        hasThumb: true,
      },
      placeholder: null,
    });
  });

  it('keeps Confirmed match for an import in any phase', () => {
    for (const phase of [
      'waiting',
      'importing',
      'imported',
      'already_in_collection',
      'failed',
    ] as const) {
      expect(matchSlotOf({ ...base, import: importDto({ phase }) }).label).toBe(
        'Confirmed match',
      );
    }
  });

  it('falls back to Release {id} when the snapshot is gone', () => {
    const slot = matchSlotOf({
      ...base,
      import: importDto({ candidate: null, candidateId: null }),
    });
    expect(slot.label).toBe('Confirmed match');
    expect(slot.match).toEqual({
      candidateId: null,
      releaseId: 777,
      title: 'Release 777',
      details: 'No details',
      hasThumb: false,
    });
  });

  it('names the search state when there are no candidates', () => {
    const none = (state: SpineDiscogsDto['state']) =>
      matchSlotOf({
        ...base,
        discogs: discogs({ state, candidateCount: 0, topCandidates: [] }),
      });
    expect(none('not_searched').placeholder).toBe('Not looked up yet');
    expect(none('queued').placeholder).toBe('Looking it up on Discogs…');
    expect(none('searching').placeholder).toBe('Looking it up on Discogs…');
    expect(none('no_match').placeholder).toBe('No matches on Discogs');
    expect(none('failed').placeholder).toBe(
      'Search failed. Open the card to retry.',
    );
    for (const s of ['not_searched', 'no_match', 'failed'] as const) {
      expect(none(s).label).toBe('Top match');
      expect(none(s).match).toBeNull();
    }
  });

  it('reads Not looked up yet without a search summary', () => {
    expect(matchSlotOf({ ...base, discogs: null }).placeholder).toBe(
      'Not looked up yet',
    );
  });

  it('lets the Not on Discogs mark win over candidates and an import', () => {
    for (const imp of [null, importDto()]) {
      expect(matchSlotOf({ ...base, import: imp, notOnDiscogs: true })).toEqual(
        {
          label: 'Top match',
          match: null,
          placeholder: 'Marked not on Discogs',
        },
      );
    }
  });
});
