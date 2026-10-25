import { describe, expect, it } from 'vitest';
import { type RunItemSummary, summarizeRun } from './bulk-view';

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

  it('an empty run is total 0 and not running', () => {
    expect(summarizeRun(RUN, [])).toMatchObject({
      total: 0,
      done: 0,
      running: false,
    });
  });
});
