import { describe, expect, it } from 'vitest';
import {
  canChangeMatchOf,
  canRetryOf,
  IMPORT_ERROR_KINDS,
  IMPORT_STATUSES,
  type ImportPhase,
  type ImportStatus,
  importPhaseOf,
} from '@/lib/import-types';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';
import { FOLDERS_CACHE_KEY } from '../discogs/folders';
import { setSetting } from '../settings';
import { toImportDto } from './queries';
import type { ImportDbRow } from './store';

// Plan 04-10's read-model rules, pinned as literal tables (D-05, D-07,
// RESEARCH Pitfall 4, UI-SPEC Change match rule). Every import status is
// crossed with every job status, with and without an intent, so a later
// change to what a card shows or offers has to change a row here too.

const JOB_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  null,
] as const;
type JobKey =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'null';
const keyOf = (j: string | null): JobKey => (j ?? 'null') as JobKey;

const INTENT_AT = 1_800_000_000_000;

/** importPhaseOf: status x jobStatus. intentAt never changes the phase. */
const PHASE: Record<ImportStatus, Record<JobKey, ImportPhase>> = {
  pending: {
    queued: 'waiting',
    running: 'importing',
    succeeded: 'waiting',
    failed: 'failed',
    cancelled: 'failed',
    null: 'failed',
  },
  importing: {
    queued: 'importing',
    running: 'importing',
    succeeded: 'importing',
    failed: 'failed',
    cancelled: 'failed',
    null: 'failed',
  },
  imported: {
    queued: 'imported',
    running: 'imported',
    succeeded: 'imported',
    failed: 'imported',
    cancelled: 'imported',
    null: 'imported',
  },
  already_in_collection: {
    queued: 'already_in_collection',
    running: 'already_in_collection',
    succeeded: 'already_in_collection',
    failed: 'already_in_collection',
    cancelled: 'already_in_collection',
    null: 'already_in_collection',
  },
  failed: {
    queued: 'failed',
    running: 'failed',
    succeeded: 'failed',
    failed: 'failed',
    cancelled: 'failed',
    null: 'failed',
  },
};

/**
 * canChangeMatchOf with no recorded error kind: [no intent, intent written],
 * the phase taken from the PHASE table.
 */
const CHANGE_MATCH: Record<ImportStatus, Record<JobKey, [boolean, boolean]>> = {
  pending: {
    queued: [true, false],
    running: [false, false],
    succeeded: [false, false],
    failed: [true, false],
    cancelled: [true, false],
    null: [true, false],
  },
  importing: {
    queued: [false, false],
    running: [false, false],
    succeeded: [false, false],
    failed: [true, false],
    cancelled: [true, false],
    null: [true, false],
  },
  imported: {
    queued: [false, false],
    running: [false, false],
    succeeded: [false, false],
    failed: [false, false],
    cancelled: [false, false],
    null: [false, false],
  },
  already_in_collection: {
    queued: [true, false],
    running: [true, false],
    succeeded: [true, false],
    failed: [true, false],
    cancelled: [true, false],
    null: [true, false],
  },
  failed: {
    queued: [true, false],
    running: [true, false],
    succeeded: [true, false],
    failed: [true, false],
    cancelled: [true, false],
    null: [true, false],
  },
};

/** A failed import with an intent: only a Discogs refusal frees the match. */
const FAILED_WITH_INTENT: Record<string, boolean> = {
  auth: false,
  not_found: true,
  rejected: true,
  unavailable: false,
  interrupted: false,
  removed: false,
  other: false,
};

describe('importPhaseOf', () => {
  for (const status of IMPORT_STATUSES) {
    for (const jobStatus of JOB_STATUSES) {
      for (const intentAt of [null, INTENT_AT]) {
        const expected = PHASE[status][keyOf(jobStatus)];
        it(`${status} + job ${jobStatus} + intent ${intentAt === null ? 'none' : 'set'} -> ${expected}`, () => {
          expect(importPhaseOf({ status, intentAt, jobStatus })).toBe(expected);
        });
      }
    }
  }
});

describe('canChangeMatchOf', () => {
  for (const status of IMPORT_STATUSES) {
    for (const jobStatus of JOB_STATUSES) {
      const [noIntent, withIntent] = CHANGE_MATCH[status][keyOf(jobStatus)];
      for (const [intentAt, expected] of [
        [null, noIntent],
        [INTENT_AT, withIntent],
      ] as const) {
        it(`${status} + job ${jobStatus} + intent ${intentAt === null ? 'none' : 'set'} -> ${expected}`, () => {
          const phase = importPhaseOf({ status, intentAt, jobStatus });
          expect(
            canChangeMatchOf({ phase, intentAt, errorKind: null, jobStatus }),
          ).toBe(expected);
        });
      }
    }
  }

  for (const [errorKind, expected] of Object.entries(FAILED_WITH_INTENT)) {
    it(`failed + intent set + error ${errorKind} -> ${expected}`, () => {
      expect(
        canChangeMatchOf({
          phase: 'failed',
          intentAt: INTENT_AT,
          errorKind,
          jobStatus: 'failed',
        }),
      ).toBe(expected);
    });
    it(`failed + no intent + error ${errorKind} -> true`, () => {
      expect(
        canChangeMatchOf({
          phase: 'failed',
          intentAt: null,
          errorKind,
          jobStatus: 'failed',
        }),
      ).toBe(true);
    });
  }

  it('a recorded error kind never frees a waiting, importing or imported import', () => {
    for (const phase of ['importing', 'imported'] as const) {
      for (const errorKind of ['not_found', 'rejected']) {
        expect(
          canChangeMatchOf({
            phase,
            intentAt: null,
            errorKind,
            jobStatus: 'running',
          }),
        ).toBe(false);
      }
    }
    expect(
      canChangeMatchOf({
        phase: 'waiting',
        intentAt: INTENT_AT,
        errorKind: 'not_found',
        jobStatus: 'queued',
      }),
    ).toBe(false);
  });
});

describe('canRetryOf', () => {
  const RETRY: Record<ImportPhase, boolean> = {
    waiting: false,
    importing: false,
    already_in_collection: false,
    imported: false,
    failed: true,
  };
  for (const [phase, expected] of Object.entries(RETRY)) {
    it(`${phase} -> ${expected}`, () => {
      expect(canRetryOf(phase as ImportPhase)).toBe(expected);
    });
  }
});

const SNAPSHOT = {
  title: 'Nevermind',
  year: 1991,
  country: 'US',
  labels: ['DGC'],
  catno: 'DGCD-24425',
  formats: [{ name: 'CD', qty: '1', descriptions: ['Album'], text: null }],
};

function row(over: Partial<ImportDbRow> = {}): ImportDbRow {
  return {
    id: 'imp-1',
    spine_id: 'spine-1',
    candidate_id: 'cand-1',
    release_id: 1011,
    folder_id: 1,
    status: 'pending',
    allow_duplicate: 0,
    adopted: 0,
    linked: 0,
    instance_id: null,
    intent_at: null,
    snapshot_json: null,
    existing_json: null,
    candidate_json: JSON.stringify(SNAPSHOT),
    post_count: 0,
    error_kind: null,
    error: null,
    job_id: 'job-1',
    created_at: 1,
    updated_at: 1,
    imported_at: null,
    ...over,
  };
}

const OPTS = {
  jobStatus: 'queued' as string | null,
  candidateExists: true,
  hasThumb: true,
  folderName: 'Uncategorized',
  nameOf: (id: number) => `Name ${id}`,
};

describe('toImportDto', () => {
  describe('checking (CR-01)', () => {
    it('a pending import whose job is a queued or running check_import is checking', () => {
      for (const jobStatus of ['queued', 'running']) {
        const dto = toImportDto(row({ status: 'pending', intent_at: 1_000 }), {
          ...OPTS,
          jobStatus,
          jobType: 'check_import',
        });
        expect(dto.checking).toBe(true);
        expect(dto.canChangeMatch).toBe(false);
      }
    });

    it('an add_to_collection job, or a check that gave up, is not checking', () => {
      expect(
        toImportDto(row(), { ...OPTS, jobType: 'add_to_collection' }).checking,
      ).toBe(false);
      expect(
        toImportDto(row({ intent_at: 1_000 }), {
          ...OPTS,
          jobStatus: 'failed',
          jobType: 'check_import',
        }).checking,
      ).toBe(false);
    });
  });

  describe('failure kind and reason', () => {
    for (const kind of IMPORT_ERROR_KINDS) {
      it(`error_kind ${kind} maps to failure kind ${kind}`, () => {
        const dto = toImportDto(
          row({ status: 'failed', error_kind: kind, error: 'Some reason' }),
          { ...OPTS, jobStatus: 'failed' },
        );
        expect(dto.phase).toBe('failed');
        expect(dto.failure?.kind).toBe(kind);
        expect(dto.failure?.reason).toBe(
          kind === 'other' ? 'Some reason' : null,
        );
      });
    }

    it('an unknown error_kind maps to other and keeps its reason', () => {
      const dto = toImportDto(
        row({ status: 'failed', error_kind: 'brand_new', error: 'Odd' }),
        { ...OPTS, jobStatus: 'failed' },
      );
      expect(dto.failure).toEqual({ kind: 'other', reason: 'Odd' });
    });

    it('a failed row with no error_kind reads as other', () => {
      const dto = toImportDto(
        row({ status: 'failed', error: 'Discogs said no' }),
        { ...OPTS, jobStatus: 'failed' },
      );
      expect(dto.failure).toEqual({ kind: 'other', reason: 'Discogs said no' });
    });

    it('the other reason is cut to 160 code points', () => {
      const dto = toImportDto(
        row({ status: 'failed', error_kind: 'other', error: 'x'.repeat(300) }),
        { ...OPTS, jobStatus: 'failed' },
      );
      expect(dto.failure?.reason).toBe('x'.repeat(160));
      const astral = toImportDto(
        row({
          status: 'failed',
          error_kind: 'other',
          error: '\u{1F4BF}'.repeat(200),
        }),
        { ...OPTS, jobStatus: 'failed' },
      );
      expect(Array.from(astral.failure?.reason ?? '')).toHaveLength(160);
    });

    it('a blank other reason is null', () => {
      const dto = toImportDto(
        row({ status: 'failed', error_kind: 'other', error: '   ' }),
        { ...OPTS, jobStatus: 'failed' },
      );
      expect(dto.failure).toEqual({ kind: 'other', reason: null });
    });

    it('a phase other than failed has no failure', () => {
      for (const [status, jobStatus] of [
        ['pending', 'queued'],
        ['importing', 'running'],
        ['imported', 'succeeded'],
        ['already_in_collection', 'succeeded'],
      ] as const) {
        const dto = toImportDto(
          row({ status, error_kind: 'unavailable', error: 'e' }),
          { ...OPTS, jobStatus },
        );
        expect(dto.failure).toBeNull();
        expect(dto.canRetry).toBe(false);
      }
    });
  });

  describe('read-model defence (D-07, RESEARCH Pitfall 4)', () => {
    for (const status of ['pending', 'importing'] as const) {
      for (const jobStatus of ['failed', 'cancelled', null]) {
        it(`a ${status} row whose job is ${jobStatus} reads failed, kind interrupted`, () => {
          const dto = toImportDto(row({ status, error: 'leftover' }), {
            ...OPTS,
            jobStatus,
          });
          expect(dto.phase).toBe('failed');
          expect(dto.failure).toEqual({ kind: 'interrupted', reason: null });
          expect(dto.canRetry).toBe(true);
        });
      }
    }

    it('a recorded error_kind wins over interrupted', () => {
      const dto = toImportDto(
        row({ status: 'pending', error_kind: 'auth', error: 'e' }),
        { ...OPTS, jobStatus: 'failed' },
      );
      expect(dto.failure).toEqual({ kind: 'auth', reason: null });
    });

    it('a recorded other keeps its reason over interrupted', () => {
      const dto = toImportDto(
        row({ status: 'importing', error_kind: 'other', error: 'Boom' }),
        { ...OPTS, jobStatus: 'cancelled' },
      );
      expect(dto.failure).toEqual({ kind: 'other', reason: 'Boom' });
    });

    it('an interrupted import with an intent cannot change match, without one it can', () => {
      const withIntent = toImportDto(
        row({ status: 'importing', intent_at: INTENT_AT }),
        { ...OPTS, jobStatus: 'failed' },
      );
      expect(withIntent.canChangeMatch).toBe(false);
      const noIntent = toImportDto(row({ status: 'pending' }), {
        ...OPTS,
        jobStatus: null,
      });
      expect(noIntent.canChangeMatch).toBe(true);
    });
  });

  describe('candidate snapshot', () => {
    it('parses candidate_json', () => {
      expect(toImportDto(row(), OPTS).candidate).toEqual(SNAPSHOT);
    });

    for (const [why, json] of [
      ['malformed JSON', '{"title": "Never'],
      ['absent', null],
      ['an array', '[]'],
      ['no title', JSON.stringify({ ...SNAPSHOT, title: undefined })],
      ['a non-numeric year', JSON.stringify({ ...SNAPSHOT, year: '1991' })],
      ['labels not an array', JSON.stringify({ ...SNAPSHOT, labels: 'DGC' })],
    ] as const) {
      it(`candidate_json ${why} gives candidate null`, () => {
        expect(
          toImportDto(row({ candidate_json: json }), OPTS).candidate,
        ).toBeNull();
      });
    }

    it('candidateId and hasThumb drop once the candidate row is gone', () => {
      const gone = toImportDto(row(), {
        ...OPTS,
        candidateExists: false,
        hasThumb: true,
      });
      expect(gone.candidateId).toBeNull();
      expect(gone.hasThumb).toBe(false);
      expect(gone.candidate).toEqual(SNAPSHOT);
      const kept = toImportDto(row(), OPTS);
      expect(kept.candidateId).toBe('cand-1');
      expect(kept.hasThumb).toBe(true);
    });
  });

  describe('existing copy (D-05)', () => {
    it('gives the count and the first copy folder, name and date', () => {
      const dto = toImportDto(
        row({
          status: 'already_in_collection',
          existing_json: JSON.stringify([
            {
              instanceId: 11,
              folderId: 7,
              dateAdded: '2020-01-02T03:04:05-08:00',
            },
            {
              instanceId: 12,
              folderId: 1,
              dateAdded: '2021-01-01T00:00:00-08:00',
            },
          ]),
        }),
        { ...OPTS, jobStatus: 'succeeded' },
      );
      expect(dto.existing).toEqual({
        count: 2,
        folderId: 7,
        folderName: 'Name 7',
        dateAdded: '2020-01-02T03:04:05-08:00',
      });
      expect(dto.phase).toBe('already_in_collection');
      expect(dto.canChangeMatch).toBe(true);
    });

    it('skips copies of the wrong shape when counting', () => {
      const dto = toImportDto(
        row({
          existing_json: JSON.stringify([
            { instanceId: '11', folderId: 7, dateAdded: 'x' },
            { instanceId: 12, folderId: 3, dateAdded: '2021-01-01' },
          ]),
        }),
        OPTS,
      );
      expect(dto.existing).toEqual({
        count: 1,
        folderId: 3,
        folderName: 'Name 3',
        dateAdded: '2021-01-01',
      });
    });

    for (const [why, json] of [
      ['malformed JSON', '[{'],
      ['absent', null],
      ['an empty list', '[]'],
      ['an object', '{"instanceId":1}'],
    ] as const) {
      it(`existing_json ${why} gives existing null`, () => {
        expect(
          toImportDto(row({ existing_json: json }), OPTS).existing,
        ).toBeNull();
      });
    }
  });

  describe('row fields', () => {
    it('maps ids, folder, flags and dates through', () => {
      const dto = toImportDto(
        row({
          status: 'imported',
          folder_id: 7,
          instance_id: 555,
          linked: 1,
          adopted: 1,
          imported_at: 42,
        }),
        { ...OPTS, jobStatus: 'succeeded', folderName: 'Jazz' },
      );
      expect(dto).toMatchObject({
        id: 'imp-1',
        phase: 'imported',
        releaseId: 1011,
        folderId: 7,
        folderName: 'Jazz',
        instanceId: 555,
        linked: true,
        adopted: true,
        importedAt: 42,
        failure: null,
        canChangeMatch: false,
        canRetry: false,
      });
    });

    it('a waiting import with no intent and a queued job can change match', () => {
      const dto = toImportDto(row(), OPTS);
      expect(dto.phase).toBe('waiting');
      expect(dto.canChangeMatch).toBe(true);
      expect(dto.linked).toBe(false);
      expect(dto.adopted).toBe(false);
    });
  });

  describe('folder names from the settings table', () => {
    useTempDataDir();

    it('without nameOf, existing folder names come from collectionFolderName', () => {
      setSetting(FOLDERS_CACHE_KEY, {
        folders: [{ id: 7, name: 'Jazz', count: 3 }],
        fetchedAt: 1,
      });
      const existing = (folderId: number) =>
        toImportDto(
          row({
            existing_json: JSON.stringify([
              { instanceId: 1, folderId, dateAdded: 'd' },
            ]),
          }),
          { ...OPTS, nameOf: undefined },
        ).existing?.folderName;
      expect(existing(7)).toBe('Jazz');
      expect(existing(1)).toBe('Uncategorized');
      expect(existing(9)).toBe('Folder 9');
    });
  });
});
