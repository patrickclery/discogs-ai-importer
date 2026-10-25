import { describe, expect, it } from 'vitest';
import {
  type BulkItemDto,
  type BulkRunDto,
  ELIGIBILITY_REASONS,
} from '@/lib/bulk-types';
import type { CandidateDto, SpineDiscogsDto } from '@/lib/discogs-types';
import type { ImportDto } from '@/lib/import-types';
import {
  batchDoneToast,
  bulkStatusLineOf,
  countryBadgeText,
  dialogBody,
  dialogTitle,
  ELIGIBILITY_REASON_TEXT,
  eligibilityReasonText,
  fallbackLine,
  findingLine,
  hasRunFinished,
  importButtonLabel,
  importDisabledReason,
  lastResultLine,
  lookupFailureLine,
  matchDetails,
  matchSlotOf,
  progressLine,
  selectAllLabel,
  selectedCountText,
  skippedLine,
  startErrorText,
  startSkipsToast,
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
    fallbackCountry: null,
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

  // G-06-side-1: the line names the countries a fallback run tried.
  it('a fallback_country import names the preferred country it missed', () => {
    expect(
      fallbackLine(
        item({
          outcome: 'fallback_country',
          fallbackCountry: 'US',
          country: 'US',
        }),
      ),
    ).toBe('No Canadian pressing, used US');
  });

  it('no version in either country names both, with demonyms', () => {
    expect(
      fallbackLine(
        item({
          outcome: 'fallback_no_version',
          fallbackCountry: 'US',
          country: 'Hong Kong',
        }),
      ),
    ).toBe('No Canadian or US pressing, used Hong Kong');
  });

  it('a fallback country without a demonym spells each phrase in full', () => {
    expect(
      fallbackLine(
        item({
          outcome: 'fallback_no_version',
          fallbackCountry: 'Hong Kong',
          country: 'Japan',
        }),
      ),
    ).toBe('No Canadian pressing or pressing from Hong Kong, used Japan');
  });

  it('no version and no fallback country keeps the one-country line', () => {
    expect(
      fallbackLine(
        item({
          outcome: 'fallback_no_version',
          fallbackCountry: null,
          country: 'Hong Kong',
        }),
      ),
    ).toBe('No Canadian pressing, used Hong Kong');
  });

  it('a fallback equal to the preferred country is no second tier', () => {
    expect(
      fallbackLine(
        item({
          outcome: 'fallback_no_version',
          fallbackCountry: 'canada',
          country: 'US',
        }),
      ),
    ).toBe('No Canadian pressing, used US');
  });

  it('IN-01: an unusable master names both countries the run looked for', () => {
    expect(
      fallbackLine(
        item({
          outcome: 'fallback_unusable_master',
          fallbackCountry: 'US',
          country: 'UK',
        }),
      ),
    ).toBe('No Canadian or US pressing listed for this release, used UK');
    expect(
      fallbackLine(
        item({
          outcome: 'fallback_unusable_master',
          fallbackCountry: 'canada',
          country: 'UK',
        }),
      ),
    ).toBe('No Canadian pressing listed for this release, used UK');
  });

  it('the no-master, retry and no-country lines ignore the fallback country', () => {
    expect(
      fallbackLine(
        item({
          outcome: 'fallback_no_master',
          fallbackCountry: 'US',
          country: 'UK',
        }),
      ),
    ).toBe('No Canadian pressing listed for this release, used UK');
    expect(
      fallbackLine(
        item({
          outcome: 'retried_earlier',
          fallbackCountry: 'US',
          country: 'UK',
        }),
      ),
    ).toBe('Retried the earlier import of this spine, used UK');
    expect(
      fallbackLine(
        item({
          outcome: 'fallback_country',
          fallbackCountry: 'US',
          country: null,
        }),
      ),
    ).toBe('No Canadian pressing, used the top match (no country listed)');
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
    expect(
      findingLine({ preferredCountry: 'Canada', fallbackCountry: null }),
    ).toBe('Looking for the Canadian pressing…');
  });

  it('names both pressings when the run has a fallback (G-06-side-1)', () => {
    expect(
      findingLine({ preferredCountry: 'Canada', fallbackCountry: 'US' }),
    ).toBe('Looking for the Canadian or US pressing…');
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
    expect(dialogBody('Canada', null, 0)).toBe(
      `Each spine's top match is swapped for its Canadian CD pressing${BODY_TAIL}`,
    );
  });

  it('adds the low-confidence sentence at k = 2', () => {
    expect(dialogBody('Canada', null, 2)).toBe(
      `Each spine's top match is swapped for its Canadian CD pressing${BODY_TAIL} 2 of them have a field Claude wasn't sure of.`,
    );
  });

  it('reads CD pressing from the country for an unknown demonym', () => {
    expect(dialogBody('Hong Kong', null, 0)).toBe(
      `Each spine's top match is swapped for its CD pressing from Hong Kong${BODY_TAIL}`,
    );
  });
});

const FALLBACK_TAIL =
  ' If Discogs lists neither, the top match is added as is and the card says so. Spines already imported from another spine are skipped. Large imports take a while, because Discogs allows about one request per second.';

describe('dialogBody with a fallback country (G-06-side-1)', () => {
  it('names the US CD pressing as the second choice', () => {
    expect(dialogBody('Canada', 'US', 0)).toBe(
      "Each spine's top match is swapped for its Canadian CD pressing when Discogs lists one, or else for its US CD pressing. If Discogs lists neither, the top match is added as is and the card says so. Spines already imported from another spine are skipped. Large imports take a while, because Discogs allows about one request per second.",
    );
  });

  it('reads CD pressing from the fallback country without a demonym', () => {
    expect(dialogBody('Canada', 'Hong Kong', 0)).toBe(
      `Each spine's top match is swapped for its Canadian CD pressing when Discogs lists one, or else for its CD pressing from Hong Kong.${FALLBACK_TAIL}`,
    );
  });

  it('a fallback equal to the preferred country keeps the one-country body', () => {
    expect(dialogBody('Canada', 'canada', 0)).toBe(
      dialogBody('Canada', null, 0),
    );
    expect(dialogBody('Canada', null, 0)).toBe(
      `Each spine's top match is swapped for its Canadian CD pressing${BODY_TAIL}`,
    );
  });

  it('keeps the low-confidence sentence', () => {
    expect(dialogBody('Canada', 'US', 3)).toBe(
      `${dialogBody('Canada', 'US', 0)} 3 of them have a field Claude wasn't sure of.`,
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

// Why a card can't be picked, why Import is disabled, and the last result
// (D-06, D-15, D-20, UI-SPEC Copywriting Contract).

describe('eligibilityReasonText', () => {
  it('reads each ineligible reason', () => {
    expect(eligibilityReasonText('no_match')).toBe(
      'No match to import yet. Search Discogs on this card first.',
    );
    expect(eligibilityReasonText('searching')).toBe(
      'Still looking it up on Discogs.',
    );
    expect(eligibilityReasonText('imported')).toBe(
      'Already in your collection.',
    );
    expect(eligibilityReasonText('import_open')).toBe('Already being added.');
    expect(eligibilityReasonText('finding')).toBe('Already being added.');
    expect(eligibilityReasonText('import_held')).toBe(
      'Waiting for your choice on this card.',
    );
    expect(eligibilityReasonText('not_on_discogs')).toBe(
      'Marked not on Discogs.',
    );
    expect(eligibilityReasonText('orphaned')).toBe(
      'No longer detected. Re-attach it first.',
    );
    expect(eligibilityReasonText('skipped_duplicate')).toBe(
      'Already imported from another spine. Open the card to add another copy.',
    );
  });

  it('has text for every reason and none for a failed import (D-20)', () => {
    expect(Object.keys(ELIGIBILITY_REASON_TEXT).sort()).toEqual(
      [...ELIGIBILITY_REASONS].sort(),
    );
    expect(Object.values(ELIGIBILITY_REASON_TEXT)).not.toContain(
      'Import failed. Use Retry import on this card.',
    );
    expect(ELIGIBILITY_REASONS as readonly string[]).not.toContain('failed');
    expect(ELIGIBILITY_REASONS as readonly string[]).not.toContain(
      'import_failed',
    );
  });
});

describe('importDisabledReason', () => {
  const ok = {
    selected: 3,
    connected: true,
    needsReconnect: false,
    running: false,
  };

  it('is null when Import can open the dialog', () => {
    expect(importDisabledReason(ok)).toBeNull();
  });

  it('asks for a selection first', () => {
    expect(importDisabledReason({ ...ok, selected: 0 })).toBe(
      'Select spines to import first',
    );
  });

  it('asks to connect or reconnect Discogs', () => {
    expect(importDisabledReason({ ...ok, connected: false })).toBe(
      'Connect Discogs in Settings first',
    );
    expect(
      importDisabledReason({ ...ok, connected: false, needsReconnect: true }),
    ).toBe('Reconnect Discogs in Settings first');
  });

  it('waits for the current bulk import', () => {
    expect(importDisabledReason({ ...ok, running: true })).toBe(
      'Wait for the current bulk import to finish',
    );
  });

  it('WR-03: waits for a retried lookup the server still counts as busy', () => {
    expect(importDisabledReason({ ...ok, busy: true })).toBe(
      'Wait for the retried lookup to finish',
    );
    expect(importDisabledReason({ ...ok, running: true, busy: true })).toBe(
      'Wait for the current bulk import to finish',
    );
  });
});

describe('lastResultLine', () => {
  it('reads added and a single fallback, leaving out zero failed', () => {
    expect(lastResultLine({ added: 12, fallbacks: 1, failed: 0 })).toBe(
      'Last bulk import: 12 added · 1 fallback',
    );
  });

  it('always shows added and pluralizes', () => {
    expect(lastResultLine({ added: 0, fallbacks: 0, failed: 2 })).toBe(
      'Last bulk import: 0 added · 2 failed',
    );
    expect(lastResultLine({ added: 5, fallbacks: 2, failed: 1 })).toBe(
      'Last bulk import: 5 added · 2 fallbacks · 1 failed',
    );
  });
});

describe('startSkipsToast', () => {
  it('names what started and what changed since it was picked', () => {
    expect(startSkipsToast(5, 2)).toBe(
      'Started 5. 2 skipped because they changed since you picked them.',
    );
  });
});

// The batch-finished toast (D-15, UI-SPEC Batch-finished toast): one per
// run, in the browser that saw it running.

function run(over: Partial<BulkRunDto> = {}): BulkRunDto {
  return {
    id: 'run1',
    country: 'Canada',
    folderName: 'Uncategorized',
    total: 16,
    done: 16,
    added: 12,
    fallbacks: 0,
    alreadyInCollection: 0,
    duplicates: 0,
    changed: 0,
    failed: 0,
    running: false,
    openLookups: 0,
    busy: false,
    createdAt: 1,
    ...over,
  };
}

describe('batchDoneToast', () => {
  it('reads added, fallbacks, already in collection and duplicates with Show fallbacks', () => {
    expect(
      batchDoneToast(
        run({ fallbacks: 2, alreadyInCollection: 1, duplicates: 1 }),
      ),
    ).toEqual({
      message:
        'Bulk import done: 12 added to Uncategorized. 2 used another country. 1 already in your collection. 1 skipped as duplicates.',
      action: 'fallbacks',
    });
  });

  it('offers Show failed when any failed', () => {
    const t = batchDoneToast(run({ fallbacks: 2, failed: 1 }));
    expect(t.message).toBe(
      'Bulk import done: 12 added to Uncategorized. 2 used another country. 1 failed.',
    );
    expect(t.action).toBe('failed');
  });

  it('adds the job-time changed skips', () => {
    expect(batchDoneToast(run({ changed: 2 })).message).toBe(
      'Bulk import done: 12 added to Uncategorized. 2 skipped because they changed.',
    );
  });

  it('has no action when only added is nonzero', () => {
    expect(batchDoneToast(run())).toEqual({
      message: 'Bulk import done: 12 added to Uncategorized.',
      action: null,
    });
  });
});

describe('hasRunFinished', () => {
  const seen = new Set(['run1']);

  it('is true for a run seen running that has finished and was not toasted', () => {
    expect(hasRunFinished(seen, new Set(), run())).toBe(true);
  });

  it('is false while the run is still running', () => {
    expect(hasRunFinished(seen, new Set(), run({ running: true }))).toBe(false);
  });

  it('is false once the run was toasted', () => {
    expect(hasRunFinished(seen, new Set(['run1']), run())).toBe(false);
  });

  it('is false for a run first seen already finished (a reload after it)', () => {
    expect(hasRunFinished(new Set(), new Set(), run())).toBe(false);
  });

  it('is false with no run', () => {
    expect(hasRunFinished(seen, new Set(), null)).toBe(false);
  });
});
