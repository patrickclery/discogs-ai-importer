import { describe, expect, it } from 'vitest';
import type { BulkItemDto } from '@/lib/bulk-types';
import type { CandidateDto, SpineDiscogsDto } from '@/lib/discogs-types';
import type { ImportDto } from '@/lib/import-types';
import {
  bulkStatusLineOf,
  countryBadgeText,
  dialogBody,
  dialogTitle,
  fallbackLine,
  findingLine,
  importButtonLabel,
  lookupFailureLine,
  matchDetails,
  matchSlotOf,
  progressLine,
  selectAllLabel,
  selectedCountText,
  skippedLine,
  startErrorText,
} from './bulk-copy';

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

// Bulk-state copy (UI-SPEC Per-spine bulk states, D-04, D-09, D-15,
// BULK-11): the country badge text and the card's one status line.

function item(over: Partial<BulkItemDto> = {}): BulkItemDto {
  return {
    id: 'bi1',
    runId: 'run1',
    phase: 'resolved',
    preferredCountry: 'Canada',
    outcome: 'preferred',
    releaseId: 777,
    country: 'Canada',
    importId: 'i1',
    skip: null,
    failure: null,
    createdAt: 1,
    ...over,
  };
}

function bulk(it: BulkItemDto | null) {
  return { eligible: false, reason: null, item: it };
}

describe('countryBadgeText', () => {
  it('reads the preferred country verbatim', () => {
    expect(countryBadgeText({ kind: 'preferred', country: 'Canada' })).toBe(
      'Canada',
    );
  });

  it('reads Fallback: {country}, or no country listed', () => {
    expect(countryBadgeText({ kind: 'fallback', country: 'US' })).toBe(
      'Fallback: US',
    );
    expect(countryBadgeText({ kind: 'fallback', country: null })).toBe(
      'Fallback: no country listed',
    );
  });
});

describe('fallbackLine', () => {
  it('no version in the preferred country', () => {
    expect(
      fallbackLine(item({ outcome: 'fallback_no_version', country: 'US' })),
    ).toBe('No Canadian pressing, used US');
  });

  it('no master, or an unusable master', () => {
    expect(
      fallbackLine(item({ outcome: 'fallback_no_master', country: 'US' })),
    ).toBe('No Canadian pressing listed for this release, used US');
    expect(
      fallbackLine(
        item({ outcome: 'fallback_unusable_master', country: 'US' }),
      ),
    ).toBe('No Canadian pressing listed for this release, used US');
  });

  it('a top match with no country', () => {
    expect(
      fallbackLine(item({ outcome: 'fallback_no_version', country: null })),
    ).toBe('No Canadian pressing, used the top match (no country listed)');
  });

  it('a retried earlier import', () => {
    expect(
      fallbackLine(item({ outcome: 'retried_earlier', country: 'UK' })),
    ).toBe('Retried the earlier import of this spine, used UK');
  });

  it('an unknown demonym reads pressing from {country}', () => {
    expect(
      fallbackLine(
        item({
          preferredCountry: 'Hong Kong',
          outcome: 'fallback_no_version',
          country: 'US',
        }),
      ),
    ).toBe('No pressing from Hong Kong, used US');
  });
});

describe('skippedLine', () => {
  it('same photo names only the spine number', () => {
    expect(
      skippedLine({
        reason: 'duplicate',
        photo: 'IMG_1.jpg',
        spineNumber: 12,
        samePhoto: true,
      }),
    ).toBe('Already imported from spine #12');
  });

  it('another photo names the photo too', () => {
    expect(
      skippedLine({
        reason: 'duplicate',
        photo: 'IMG_1.jpg',
        spineNumber: 12,
        samePhoto: false,
      }),
    ).toBe('Already imported from IMG_1.jpg, spine #12');
  });

  it('a holder that is gone reads another spine', () => {
    expect(
      skippedLine({
        reason: 'duplicate',
        photo: null,
        spineNumber: null,
        samePhoto: false,
      }),
    ).toBe('Already imported from another spine');
  });
});

describe('lookupFailureLine', () => {
  it('no response', () => {
    expect(lookupFailureLine({ kind: 'unavailable', reason: null })).toEqual({
      text: "Couldn't look up pressings: Discogs didn't respond. Retry the import.",
      link: null,
    });
  });

  it('a rejected connection links to Settings', () => {
    const line = lookupFailureLine({ kind: 'auth', reason: null });
    expect(line.text).toBe(
      "Couldn't look up pressings: Discogs rejected the connection.",
    );
    expect(line.link?.label).toBe('Open Settings');
    expect(line.link?.href).toBe('/settings');
    expect(line.link?.tail).toBe(' to reconnect, then retry.');
  });

  it('other carries its short reason', () => {
    expect(
      lookupFailureLine({ kind: 'other', reason: 'bad request' }).text,
    ).toBe("Couldn't look up pressings: bad request. Retry the import.");
  });

  it('an interrupted lookup says the app stopped', () => {
    expect(lookupFailureLine({ kind: 'interrupted', reason: null }).text).toBe(
      "Couldn't look up pressings: the app stopped before it finished. Retry the import.",
    );
  });
});

describe('findingLine', () => {
  it('names the preferred pressing', () => {
    expect(findingLine({ preferredCountry: 'Canada' })).toBe(
      'Looking for the Canadian pressing…',
    );
  });
});

describe('bulkStatusLineOf', () => {
  const imp = importDto({ id: 'i1', phase: 'waiting' });

  it('a failed lookup comes first', () => {
    const line = bulkStatusLineOf({
      import: imp,
      bulk: bulk(
        item({
          phase: 'failed',
          importId: null,
          failure: { kind: 'unavailable', reason: null },
        }),
      ),
    });
    expect(line?.kind).toBe('failed');
  });

  it('a resolved fallback import reads the fallback line', () => {
    const line = bulkStatusLineOf({
      import: imp,
      bulk: bulk(item({ outcome: 'fallback_no_version', country: 'US' })),
    });
    expect(line?.kind).toBe('fallback');
    expect(line?.text).toBe('No Canadian pressing, used US');
  });

  it('a skipped duplicate reads the skipped line', () => {
    const line = bulkStatusLineOf({
      import: null,
      bulk: bulk(
        item({
          phase: 'skipped',
          importId: null,
          outcome: null,
          country: null,
          skip: {
            reason: 'duplicate',
            photo: 'IMG_1.jpg',
            spineNumber: 3,
            samePhoto: true,
          },
        }),
      ),
    });
    expect(line?.kind).toBe('skipped');
    expect(line?.text).toBe('Already imported from spine #3');
  });

  it('a finding item reads the finding line', () => {
    const line = bulkStatusLineOf({
      import: null,
      bulk: bulk(item({ phase: 'finding', importId: null, outcome: null })),
    });
    expect(line?.kind).toBe('finding');
    expect(line?.text).toBe('Looking for the Canadian pressing…');
  });

  it('a changed skip, a preferred import and a manual import show none', () => {
    expect(
      bulkStatusLineOf({
        import: null,
        bulk: bulk(
          item({
            phase: 'skipped',
            importId: null,
            skip: {
              reason: 'changed',
              photo: null,
              spineNumber: null,
              samePhoto: false,
            },
          }),
        ),
      }),
    ).toBeNull();
    expect(bulkStatusLineOf({ import: imp, bulk: bulk(item()) })).toBeNull();
    expect(bulkStatusLineOf({ import: imp, bulk: null })).toBeNull();
  });
});

// Bulk bar and confirm dialog copy (D-05, D-07, D-16, UI-SPEC
// Copywriting Contract).

describe('dialogTitle', () => {
  it('names the count, the folder and Canadian pressings', () => {
    expect(dialogTitle(12, 'Uncategorized', 'Canada')).toBe(
      'Import 12 to Uncategorized as Canadian pressings',
    );
  });

  it('reads pressings from the country for an unknown demonym', () => {
    expect(dialogTitle(3, 'CDs', 'Hong Kong')).toBe(
      'Import 3 to CDs as pressings from Hong Kong',
    );
  });
});

const BODY_TAIL =
  " when Discogs lists one. If it doesn't, the top match is added as is and the card says so. Spines already imported from another spine are skipped. Large imports take a while, because Discogs allows about one request per second.";

describe('dialogBody', () => {
  it('names the Canadian CD pressing with no low-confidence sentence at k = 0', () => {
    expect(dialogBody('Canada', 0)).toBe(
      `Each spine's top match is swapped for its Canadian CD pressing${BODY_TAIL}`,
    );
  });

  it('adds the low-confidence sentence at k = 2', () => {
    expect(dialogBody('Canada', 2)).toBe(
      `Each spine's top match is swapped for its Canadian CD pressing${BODY_TAIL} 2 of them have a field Claude wasn't sure of.`,
    );
  });

  it('reads CD pressing from the country for an unknown demonym', () => {
    expect(dialogBody('Hong Kong', 0)).toBe(
      `Each spine's top match is swapped for its CD pressing from Hong Kong${BODY_TAIL}`,
    );
  });
});

describe('startErrorText', () => {
  it('wraps the reason and drops its final period', () => {
    expect(startErrorText('Wait for the current bulk import to finish.')).toBe(
      "Couldn't start the import: Wait for the current bulk import to finish. Try again.",
    );
    expect(startErrorText('the server answered 500')).toBe(
      "Couldn't start the import: the server answered 500. Try again.",
    );
  });
});

describe('bulk bar copy', () => {
  it('reads the progress line', () => {
    expect(progressLine({ done: 0, total: 40 })).toBe(
      'Bulk import: 0 / 40 done',
    );
  });

  it('reads the selected count, the Import label and Select all', () => {
    expect(selectedCountText(3)).toBe('3 selected');
    expect(importButtonLabel(3)).toBe('Import 3 selected');
    expect(selectAllLabel(12)).toBe('Select all shown (12)');
  });
});
