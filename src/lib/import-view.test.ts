import { describe, expect, it } from 'vitest';
import type { ImportDto } from './import-types';
import {
  ALREADY_CONFIRMED_ERROR,
  addButtonLabel,
  addDisabledReason,
  addErrorText,
  addFolderName,
  BEING_ADDED_TOOLTIP,
  CHANGE_STARTED_ERROR,
  CONNECT_FIRST,
  changeMatchState,
  duplicateDialogTitle,
  importFailureLine,
  importStateLine,
  NOT_ON_DISCOGS_ERROR,
  RECONNECT_FIRST,
  RETRY_FIRST_TOOLTIP,
} from './import-view';

const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);

function dto(over: Partial<ImportDto> = {}): ImportDto {
  return {
    id: 'imp1',
    phase: 'waiting',
    releaseId: 123,
    candidateId: 'cand1',
    candidate: {
      title: 'Artist - Title',
      year: 1999,
      country: 'UK',
      labels: ['Label'],
      catno: 'CAT 1',
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
    ...over,
  };
}

describe('addButtonLabel', () => {
  it('names the Settings folder', () => {
    expect(addButtonLabel('CDs')).toBe('Add to CDs');
  });

  it('falls back to Uncategorized for an empty name', () => {
    expect(addButtonLabel('')).toBe('Add to Uncategorized');
    expect(addButtonLabel('  ')).toBe('Add to Uncategorized');
    expect(addFolderName(null)).toBe('Uncategorized');
  });

  it('keeps a long folder name whole (the button truncates it with CSS)', () => {
    const long = 'x'.repeat(60);
    expect(addButtonLabel(long)).toBe(`Add to ${long}`);
  });
});

describe('addDisabledReason', () => {
  it('is null when Discogs is connected', () => {
    expect(addDisabledReason({ connected: true, needsReconnect: false })).toBe(
      null,
    );
  });

  it('asks to connect when never connected', () => {
    expect(addDisabledReason({ connected: false, needsReconnect: false })).toBe(
      CONNECT_FIRST,
    );
    expect(CONNECT_FIRST).toBe('Connect Discogs in Settings first');
  });

  it('asks to reconnect when Discogs refused the stored sign-in', () => {
    expect(addDisabledReason({ connected: false, needsReconnect: true })).toBe(
      RECONNECT_FIRST,
    );
    expect(RECONNECT_FIRST).toBe('Reconnect Discogs in Settings first');
  });
});

describe('addErrorText', () => {
  it('maps already_confirmed to the UI-SPEC copy', () => {
    expect(addErrorText('already_confirmed', 'x')).toBe(
      ALREADY_CONFIRMED_ERROR,
    );
    expect(ALREADY_CONFIRMED_ERROR).toBe(
      'This spine already has a match being added. It will show here in a moment.',
    );
  });

  it('maps not_on_discogs to the UI-SPEC copy', () => {
    expect(addErrorText('not_on_discogs', 'x')).toBe(NOT_ON_DISCOGS_ERROR);
    expect(NOT_ON_DISCOGS_ERROR).toBe(
      'This spine is marked not on Discogs. Unmark it first.',
    );
  });

  it('wraps any other reason', () => {
    expect(addErrorText('no_candidate', 'That match is no longer listed')).toBe(
      "Couldn't add it: That match is no longer listed.",
    );
    expect(addErrorText(null, 'the server answered 500')).toBe(
      "Couldn't add it: the server answered 500.",
    );
  });
});

describe('importStateLine', () => {
  it('waiting names the import folder and the rate limit', () => {
    expect(importStateLine(dto({ folderName: 'CDs' }), NOW)).toEqual({
      tone: 'waiting',
      text: 'Waiting its turn to be added to CDs. Discogs allows about one request per second.',
    });
  });

  it('importing names the import folder', () => {
    expect(importStateLine(dto({ phase: 'importing' }), NOW)).toEqual({
      tone: 'importing',
      text: 'Adding it to Uncategorized on Discogs…',
    });
  });

  it('imported says where and when', () => {
    expect(
      importStateLine(
        dto({ phase: 'imported', importedAt: NOW - 5 * 60_000 }),
        NOW,
      ),
    ).toEqual({
      tone: 'success',
      text: 'In your Discogs collection, in Uncategorized. Added 5 minutes ago.',
    });
  });

  it('imported just now', () => {
    expect(
      importStateLine(dto({ phase: 'imported', importedAt: NOW }), NOW)?.text,
    ).toBe('In your Discogs collection, in Uncategorized. Added just now.');
  });

  it('imported with no recorded time leaves out the Added sentence', () => {
    expect(
      importStateLine(dto({ phase: 'imported', importedAt: null }), NOW)?.text,
    ).toBe('In your Discogs collection, in Uncategorized.');
  });

  it('linked uses the linked line', () => {
    expect(
      importStateLine(
        dto({ phase: 'imported', linked: true, folderName: 'Jazz' }),
        NOW,
      ),
    ).toEqual({
      tone: 'success',
      text: 'Linked to the copy already in your Discogs collection, in Jazz.',
    });
  });

  it('has no line for failed or already in collection', () => {
    expect(importStateLine(dto({ phase: 'failed' }), NOW)).toBe(null);
    expect(importStateLine(dto({ phase: 'already_in_collection' }), NOW)).toBe(
      null,
    );
  });
});

describe('importFailureLine (D-09)', () => {
  it('auth gives the reconnect line', () => {
    expect(importFailureLine({ kind: 'auth', reason: null }).text).toBe(
      'Import failed: Discogs rejected the connection.',
    );
  });

  it('auth carries the accent Open Settings link and its tail', () => {
    expect(
      importFailureLine({ kind: 'auth', reason: null }).settingsLink,
    ).toEqual({
      label: 'Open Settings',
      href: '/settings',
      after: ' to reconnect, then retry.',
    });
  });

  it('not_found asks to change the match', () => {
    expect(importFailureLine({ kind: 'not_found', reason: null })).toEqual({
      text: 'Import failed: Release not found on Discogs. Change the match.',
      settingsLink: null,
    });
  });

  it('rejected says Discogs would not add it', () => {
    expect(importFailureLine({ kind: 'rejected', reason: null }).text).toBe(
      "Import failed: Discogs wouldn't add this release. Change the match, or retry later.",
    );
  });

  it('unavailable promises Retry checks the collection first', () => {
    expect(importFailureLine({ kind: 'unavailable', reason: null }).text).toBe(
      "Import failed: Discogs didn't respond. Retry checks your collection first, so it never adds a second copy.",
    );
  });

  it('interrupted explains the app stopped', () => {
    expect(importFailureLine({ kind: 'interrupted', reason: null }).text).toBe(
      'The import was interrupted when the app stopped. Retry checks your collection first, so it never adds a second copy.',
    );
  });

  it('other shows the short reason without a doubled period', () => {
    expect(
      importFailureLine({ kind: 'other', reason: 'Discogs said no.' }).text,
    ).toBe('Import failed: Discogs said no. Retry the import.');
  });

  it('other without a reason still reads as a sentence', () => {
    expect(importFailureLine({ kind: 'other', reason: null }).text).toBe(
      'Import failed: something went wrong. Retry the import.',
    );
  });

  it('removed uses the other line', () => {
    expect(importFailureLine({ kind: 'removed', reason: null }).text).toBe(
      'Import failed: the spine was removed before the import ran. Retry the import.',
    );
  });

  it('a missing failure falls back to the other line', () => {
    expect(importFailureLine(null).text).toBe(
      'Import failed: something went wrong. Retry the import.',
    );
  });
});

describe('changeMatchState (D-02)', () => {
  it('a waiting import that can change is enabled', () => {
    expect(
      changeMatchState(dto({ phase: 'waiting', canChangeMatch: true })),
    ).toEqual({
      show: true,
      enabled: true,
      tooltip: null,
    });
  });

  it('importing is disabled with the being-added tooltip', () => {
    expect(
      changeMatchState(dto({ phase: 'importing', canChangeMatch: false })),
    ).toEqual({ show: true, enabled: false, tooltip: BEING_ADDED_TOOLTIP });
    expect(BEING_ADDED_TOOLTIP).toBe(
      "It's being added now. Wait for it to finish.",
    );
  });

  it('a failed import without canChangeMatch says retry first', () => {
    expect(
      changeMatchState(dto({ phase: 'failed', canChangeMatch: false })),
    ).toEqual({ show: true, enabled: false, tooltip: RETRY_FIRST_TOOLTIP });
    expect(RETRY_FIRST_TOOLTIP).toBe(
      'Retry first. Discogs may already have added it.',
    );
  });

  it('a failed import Discogs refused can change', () => {
    expect(
      changeMatchState(dto({ phase: 'failed', canChangeMatch: true })).enabled,
    ).toBe(true);
  });

  it('already in collection follows canChangeMatch', () => {
    expect(
      changeMatchState(
        dto({ phase: 'already_in_collection', canChangeMatch: true }),
      ),
    ).toEqual({ show: true, enabled: true, tooltip: null });
  });

  it('a waiting import the server no longer lets change is disabled', () => {
    expect(
      changeMatchState(dto({ phase: 'waiting', canChangeMatch: false })),
    ).toEqual({ show: true, enabled: false, tooltip: BEING_ADDED_TOOLTIP });
  });

  it('an imported spine offers no Change match', () => {
    expect(
      changeMatchState(dto({ phase: 'imported', canChangeMatch: false })),
    ).toEqual({ show: false, enabled: false, tooltip: null });
  });

  it('the started refusal copy matches the route', () => {
    expect(CHANGE_STARTED_ERROR).toBe(
      "It's already being added to Discogs, so the match can't be changed now.",
    );
  });
});

describe('duplicateDialogTitle (D-04, IMP-03)', () => {
  it('names the photo and spine an import already finished from', () => {
    expect(
      duplicateDialogTitle({
        photo: 'shelf-2.jpg',
        spineNumber: 3,
        done: true,
      }),
    ).toBe('Already imported from shelf-2.jpg, spine #3');
  });

  it('says being imported while that import is still on its way', () => {
    expect(
      duplicateDialogTitle({
        photo: 'shelf-2.jpg',
        spineNumber: 3,
        done: false,
      }),
    ).toBe('Already being imported from shelf-2.jpg, spine #3');
  });
});
