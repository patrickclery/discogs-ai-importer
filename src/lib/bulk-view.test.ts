import { describe, expect, it } from 'vitest';
import type { BulkItemDto } from './bulk-types';
import {
  countryBadgeOf,
  isFallbackSpine,
  lookupOf,
  type RunItemSummary,
  summarizeRun,
} from './bulk-view';
import type { ImportDto } from './import-types';
import type { SpineDto } from './scan-types';

// How the /spines UI reads bulk state (D-15, D-19): the run summary behind
// the progress line and the finished toast.

const RUN = {
  id: 'run-1',
  country: 'Canada',
  folderName: 'Uncategorized',
  createdAt: 1_800_000_000_000,
};

function it_(over: Partial<RunItemSummary>): RunItemSummary {
  return {
    phase: 'resolved',
    skipReason: null,
    country: 'Canada',
    importPhase: 'imported',
    hasImport: true,
    ...over,
  };
}

describe('summarizeRun', () => {
  it('a fallback-country import from the US counts in fallbacks (G-06-side-1)', () => {
    expect(summarizeRun(RUN, [it_({ country: 'US' }), it_({})]).fallbacks).toBe(
      1,
    );
  });

  it('a finding item is not done and keeps the run running', () => {
    const r = summarizeRun(RUN, [
      it_({ phase: 'finding', country: null, importPhase: null }),
      it_({ phase: 'finding', country: null, importPhase: null }),
    ]);
    expect(r).toEqual({
      ...RUN,
      total: 2,
      done: 0,
      added: 0,
      fallbacks: 0,
      alreadyInCollection: 0,
      duplicates: 0,
      changed: 0,
      failed: 0,
      running: true,
      openLookups: 0,
      busy: true,
    });
  });

  it('counts each finished outcome once and stops running when all are done', () => {
    const r = summarizeRun(RUN, [
      it_({}),
      it_({ importPhase: 'already_in_collection' }),
      it_({ importPhase: 'failed' }),
      it_({ phase: 'skipped', skipReason: 'duplicate', importPhase: null }),
      it_({ phase: 'skipped', skipReason: 'changed', importPhase: null }),
      it_({ phase: 'failed', country: null, importPhase: null }),
      it_({ importPhase: null, hasImport: false }),
    ]);
    expect(r).toMatchObject({
      total: 7,
      done: 7,
      added: 1,
      alreadyInCollection: 1,
      duplicates: 1,
      changed: 2,
      failed: 2,
      running: false,
    });
  });

  it('a resolved item whose import is waiting or importing is not done', () => {
    const r = summarizeRun(RUN, [
      it_({ importPhase: 'waiting' }),
      it_({ importPhase: 'importing' }),
      it_({}),
    ]);
    expect(r).toMatchObject({ total: 3, done: 1, added: 1, running: true });
  });

  it('counts resolved items in another country as fallbacks', () => {
    const r = summarizeRun(RUN, [
      it_({ country: 'US' }),
      it_({ country: null, importPhase: 'waiting' }),
      it_({ country: 'Canada' }),
      it_({ phase: 'failed', country: 'US', importPhase: null }),
    ]);
    expect(r.fallbacks).toBe(2);
  });

  it("D-19: 'USA & Canada' is not a fallback for a Canada run", () => {
    expect(
      summarizeRun(RUN, [it_({ country: 'USA & Canada' })]).fallbacks,
    ).toBe(0);
  });

  it('WR-03: a finished run is busy while a lookup is open in any run', () => {
    const done = [it_({})];
    expect(summarizeRun(RUN, done)).toMatchObject({
      running: false,
      busy: false,
    });
    expect(summarizeRun({ ...RUN, openLookups: 1 }, done)).toMatchObject({
      running: false,
      openLookups: 1,
      busy: true,
    });
  });

  it('WR-03: a run whose adds are still going is busy with no open lookup', () => {
    expect(summarizeRun(RUN, [it_({ importPhase: 'waiting' })])).toMatchObject({
      running: true,
      openLookups: 0,
      busy: true,
    });
  });

  it('an empty run is total 0 and not running', () => {
    expect(summarizeRun(RUN, [])).toMatchObject({
      total: 0,
      done: 0,
      running: false,
    });
  });
});

function item(over: Partial<BulkItemDto> = {}): BulkItemDto {
  return {
    id: 'item-1',
    runId: 'run-1',
    phase: 'resolved',
    preferredCountry: 'Canada',
    fallbackCountry: null,
    outcome: 'preferred',
    releaseId: 6001,
    country: 'Canada',
    importId: 'imp-1',
    skip: null,
    failure: null,
    createdAt: 1,
    ...over,
  };
}

function spine(
  bulkItem: BulkItemDto | null,
  importId: string | null = 'imp-1',
): Pick<SpineDto, 'import' | 'bulk'> {
  return {
    import: importId === null ? null : ({ id: importId } as ImportDto),
    bulk: { eligible: false, reason: 'imported', item: bulkItem },
  };
}

describe('countryBadgeOf', () => {
  it('a bulk import in the preferred country is preferred', () => {
    expect(countryBadgeOf(spine(item()))).toEqual({
      kind: 'preferred',
      country: 'Canada',
    });
  });

  it('another country is a fallback, naming it', () => {
    expect(countryBadgeOf(spine(item({ country: 'US' })))).toEqual({
      kind: 'fallback',
      country: 'US',
    });
  });

  it('an unknown country is a fallback with no country', () => {
    expect(countryBadgeOf(spine(item({ country: null })))).toEqual({
      kind: 'fallback',
      country: null,
    });
  });

  it("D-19: 'USA & Canada' reads as preferred", () => {
    expect(countryBadgeOf(spine(item({ country: 'USA & Canada' })))).toEqual({
      kind: 'preferred',
      country: 'USA & Canada',
    });
  });

  it('no badge once a later manual import replaced the bulk one', () => {
    expect(countryBadgeOf(spine(item(), 'imp-2'))).toBeNull();
    expect(countryBadgeOf(spine(item(), null))).toBeNull();
  });

  it('no badge for a finding, skipped or failed item, or no item', () => {
    expect(countryBadgeOf(spine(item({ phase: 'finding' })))).toBeNull();
    expect(countryBadgeOf(spine(item({ phase: 'failed' })))).toBeNull();
    expect(countryBadgeOf(spine(item({ phase: 'skipped' })))).toBeNull();
    expect(countryBadgeOf(spine(item({ importId: null }), 'x'))).toBeNull();
    expect(countryBadgeOf(spine(null))).toBeNull();
    expect(countryBadgeOf({ import: null, bulk: null })).toBeNull();
  });

  it('a fallback_country import from the US badges Fallback: US (G-06-side-1)', () => {
    const us = item({
      outcome: 'fallback_country',
      fallbackCountry: 'US',
      country: 'US',
    });
    expect(countryBadgeOf(spine(us))).toEqual({
      kind: 'fallback',
      country: 'US',
    });
    expect(isFallbackSpine(spine(us))).toBe(true);
  });

  it('isFallbackSpine is true only for a fallback badge', () => {
    expect(isFallbackSpine(spine(item({ country: 'US' })))).toBe(true);
    expect(isFallbackSpine(spine(item()))).toBe(false);
    expect(isFallbackSpine(spine(item({ country: 'USA & Canada' })))).toBe(
      false,
    );
    expect(isFallbackSpine(spine(null))).toBe(false);
  });
});

describe('lookupOf', () => {
  it('finding and failed items name their lookup; others none', () => {
    expect(lookupOf(item({ phase: 'finding' }))).toBe('finding');
    expect(lookupOf(item({ phase: 'failed' }))).toBe('failed');
    expect(lookupOf(item())).toBeNull();
    expect(lookupOf(item({ phase: 'skipped' }))).toBeNull();
    expect(lookupOf(null)).toBeNull();
  });
});
