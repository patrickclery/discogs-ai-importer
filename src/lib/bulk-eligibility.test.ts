import { describe, expect, it } from 'vitest';
import {
  bulkItemPhaseOf,
  eligibilityOf,
  isCurrentBulkItem,
  topMatchOf,
} from './bulk-eligibility';
import {
  BULK_MAX_ITEMS,
  BULK_START_BODY,
  type BulkItemDto,
} from './bulk-types';
import type { CandidateDto, SpineDiscogsDto } from './discogs-types';
import type { ImportDto, ImportPhase } from './import-types';
import type { SpineDto } from './scan-types';

type Spine = Pick<SpineDto, 'state' | 'notOnDiscogs' | 'discogs' | 'import'>;

const CANDIDATE: CandidateDto = {
  id: 'cand-1',
  releaseId: 2000001,
  title: 'Nirvana - Nevermind',
  year: 1991,
  country: 'US',
  labels: ['DGC'],
  catno: 'DGCD-24425',
  formats: [],
  hasThumb: false,
  source: 'auto',
  catnoMatch: false,
  stage: 'artist_title',
};

const DISCOGS: SpineDiscogsDto = {
  state: 'done',
  candidateCount: 1,
  topCandidates: [CANDIDATE],
  failure: null,
  fieldsChanged: false,
};

const spine = (over: Partial<Spine> = {}): Spine => ({
  state: 'active',
  notOnDiscogs: false,
  discogs: DISCOGS,
  import: null,
  ...over,
});

const imp = (phase: ImportPhase, over: Partial<ImportDto> = {}): ImportDto => ({
  id: 'imp-1',
  phase,
  releaseId: 2000001,
  candidateId: 'cand-1',
  candidate: null,
  hasThumb: false,
  folderId: 1,
  folderName: 'Uncategorized',
  instanceId: null,
  linked: false,
  adopted: false,
  importedAt: null,
  existing: null,
  failure: null,
  canChangeMatch: false,
  canRetry: false,
  checking: false,
  ...over,
});

const item = (over: Partial<BulkItemDto> = {}): BulkItemDto => ({
  id: 'item-1',
  runId: 'run-1',
  phase: 'resolved',
  preferredCountry: 'Canada',
  outcome: 'preferred',
  releaseId: 2000001,
  country: 'Canada',
  importId: null,
  skip: null,
  failure: null,
  createdAt: 1000,
  ...over,
});

const ineligible = (reason: string) => ({ eligible: false, reason });

describe('topMatchOf', () => {
  it('is the first top candidate', () => {
    expect(topMatchOf(spine())).toBe(CANDIDATE);
  });
  it('is null without a search or candidates', () => {
    expect(topMatchOf(spine({ discogs: null }))).toBeNull();
    expect(
      topMatchOf(spine({ discogs: { ...DISCOGS, topCandidates: [] } })),
    ).toBeNull();
  });
});

describe('eligibilityOf (D-06)', () => {
  it('an active spine with a top match and no import is eligible', () => {
    expect(eligibilityOf(spine(), null)).toEqual({
      eligible: true,
      reason: null,
    });
  });

  it.each([
    ['orphaned', spine({ state: 'orphaned' }), null],
    ['not_on_discogs', spine({ notOnDiscogs: true }), null],
    ['imported', spine({ import: imp('imported') }), null],
    ['import_open', spine({ import: imp('waiting') }), null],
    ['import_open', spine({ import: imp('importing') }), null],
    ['import_open', spine({ import: imp('failed', { checking: true }) }), null],
    ['import_held', spine({ import: imp('already_in_collection') }), null],
    ['finding', spine(), item({ phase: 'finding' })],
    [
      'skipped_duplicate',
      spine(),
      item({
        phase: 'skipped',
        skip: {
          reason: 'duplicate',
          photo: 'shelf.jpg',
          spineNumber: 3,
          samePhoto: false,
        },
      }),
    ],
    [
      'searching',
      spine({ discogs: { ...DISCOGS, state: 'queued', topCandidates: [] } }),
      null,
    ],
    ['searching', spine({ discogs: { ...DISCOGS, state: 'searching' } }), null],
    [
      'no_match',
      spine({ discogs: { ...DISCOGS, state: 'no_match', topCandidates: [] } }),
      null,
    ],
    ['no_match', spine({ discogs: null }), null],
  ] as const)('%s', (reason, s, i) => {
    expect(eligibilityOf(s, i)).toEqual(ineligible(reason));
  });

  it('D-20: a spine whose import phase is failed is eligible', () => {
    expect(eligibilityOf(spine({ import: imp('failed') }), null)).toEqual({
      eligible: true,
      reason: null,
    });
  });

  it('D-20: a failed bulk item is eligible', () => {
    expect(
      eligibilityOf(
        spine(),
        item({ phase: 'failed', failure: { kind: 'other', reason: 'x' } }),
      ).eligible,
    ).toBe(true);
  });

  it('an item skipped because the spine changed is eligible', () => {
    expect(
      eligibilityOf(
        spine(),
        item({
          phase: 'skipped',
          skip: {
            reason: 'changed',
            photo: null,
            spineNumber: null,
            samePhoto: false,
          },
        }),
      ).eligible,
    ).toBe(true);
  });

  it('D-16: low confidence never changes the answer', () => {
    const lowConfidence = {
      ...spine(),
      legibility: 'low',
      fields: [{ field: 'artist', confidence: 0.1 }],
    } as unknown as Spine;
    expect(eligibilityOf(lowConfidence, null).eligible).toBe(true);
  });

  it('orphaned beats every other reason', () => {
    expect(
      eligibilityOf(
        spine({
          state: 'orphaned',
          notOnDiscogs: true,
          import: imp('imported'),
          discogs: null,
        }),
        item({ phase: 'finding' }),
      ),
    ).toEqual(ineligible('orphaned'));
  });

  it('imported beats searching', () => {
    expect(
      eligibilityOf(
        spine({
          import: imp('imported'),
          discogs: { ...DISCOGS, state: 'searching' },
        }),
        null,
      ),
    ).toEqual(ineligible('imported'));
  });
});

describe('bulkItemPhaseOf', () => {
  it('queued with a queued or running job is finding', () => {
    expect(bulkItemPhaseOf({ status: 'queued', jobStatus: 'running' })).toBe(
      'finding',
    );
    expect(bulkItemPhaseOf({ status: 'queued', jobStatus: 'queued' })).toBe(
      'finding',
    );
  });
  it.each(['failed', 'cancelled', null])(
    'queued with job %s reads as failed',
    (jobStatus) => {
      expect(bulkItemPhaseOf({ status: 'queued', jobStatus })).toBe('failed');
    },
  );
  it('a terminal status maps to itself', () => {
    expect(bulkItemPhaseOf({ status: 'resolved', jobStatus: null })).toBe(
      'resolved',
    );
    expect(bulkItemPhaseOf({ status: 'skipped', jobStatus: 'done' })).toBe(
      'skipped',
    );
    expect(bulkItemPhaseOf({ status: 'failed', jobStatus: 'done' })).toBe(
      'failed',
    );
  });
});

describe('isCurrentBulkItem', () => {
  const it0 = { id: 'item-1', importId: null, createdAt: 1000 };
  it('is current with no latest import', () => {
    expect(isCurrentBulkItem(it0, null)).toBe(true);
  });
  it("is current when the latest import is the item's own", () => {
    expect(
      isCurrentBulkItem(
        { ...it0, importId: 'imp-9' },
        { id: 'imp-9', createdAt: 5000 },
      ),
    ).toBe(true);
  });
  it('is current when the item is newer than the latest import', () => {
    expect(isCurrentBulkItem(it0, { id: 'imp-1', createdAt: 999 })).toBe(true);
  });
  it('is not current when a newer import that is not its own exists', () => {
    expect(isCurrentBulkItem(it0, { id: 'imp-2', createdAt: 2000 })).toBe(
      false,
    );
  });
  it('a createdAt tie counts only when the import is its own', () => {
    expect(isCurrentBulkItem(it0, { id: 'imp-2', createdAt: 1000 })).toBe(
      false,
    );
    expect(
      isCurrentBulkItem(
        { ...it0, importId: 'imp-2' },
        { id: 'imp-2', createdAt: 1000 },
      ),
    ).toBe(true);
  });
});

describe('BULK_START_BODY (T-06-03)', () => {
  const one = { spineId: 'sp-1', candidateId: 'cand-1' };
  const ok = (body: unknown) => BULK_START_BODY.safeParse(body).success;

  it('accepts 1 and BULK_MAX_ITEMS items', () => {
    expect(ok({ items: [one] })).toBe(true);
    expect(BULK_MAX_ITEMS).toBe(2000);
    expect(ok({ items: Array.from({ length: 2000 }, () => one) })).toBe(true);
  });
  it('refuses 0 and 2001 items', () => {
    expect(ok({ items: [] })).toBe(false);
    expect(ok({ items: Array.from({ length: 2001 }, () => one) })).toBe(false);
  });
  it('refuses extra keys on the body and on an item', () => {
    expect(ok({ items: [one], country: 'Canada' })).toBe(false);
    expect(ok({ items: [{ ...one, extra: 1 }] })).toBe(false);
  });
  it('refuses an item carrying a releaseId key (T-04-02)', () => {
    expect(ok({ items: [{ ...one, releaseId: 12009956 }] })).toBe(false);
  });
  it('refuses empty ids and ids longer than 40', () => {
    expect(ok({ items: [{ ...one, spineId: '' }] })).toBe(false);
    expect(ok({ items: [{ ...one, candidateId: '' }] })).toBe(false);
    expect(ok({ items: [{ ...one, spineId: 'x'.repeat(41) }] })).toBe(false);
    expect(ok({ items: [{ ...one, candidateId: 'x'.repeat(40) }] })).toBe(true);
  });
});
