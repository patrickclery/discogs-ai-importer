import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SearchStatus } from '@/lib/discogs-types';
import { getDb } from '@/server/db/client';
import { clearAuthInvalid, saveDiscogsAuth } from '@/server/discogs/auth';
import {
  enqueueAutoSearch,
  enqueueMissingSearches,
} from '@/server/discogs/enqueue';
import { inputHash, loadSpineInputs } from '@/server/discogs/inputs';
import { discogsForSpines } from '@/server/discogs/queries';
import { createSearch, finishSearch } from '@/server/discogs/store';
import { updateSpineField } from '@/server/scan/fields';
import { SECRET_ENV_NAMES, saveSecrets } from '@/server/secrets';
import { fieldOf, orphanScenario } from '../../test/helpers/scan-runs';
import { useTempDataDir } from '../../test/helpers/temp-data-dir';
import {
  matchesAction,
  NOT_SEARCHED_LINE,
  notSearchedLine,
  ORPHANED_LINE,
  showsFieldsChanged,
  UNSURE_MEDIA_LINE,
} from './discogs-matches';

// The card state of a spine whose latest auto search ended skipped (DISC-03):
// the read model shows it as not searched, and the header offers no action
// (it is neither failed nor a changed-fields baseline).

describe('skipped search card state', () => {
  useTempDataDir();

  it('a skipped latest auto search reads not_searched with no header action', async () => {
    const { spineIds } = await orphanScenario();
    const id = spineIds[0];
    const db = getDb().$client;
    const inputs = loadSpineInputs(db, id);
    const searchId = createSearch(db, {
      spineId: id,
      kind: 'auto',
      inputs,
      inputHash: inputHash(inputs),
    });
    finishSearch(db, searchId, { status: 'skipped' });
    const discogs = discogsForSpines(db, [{ id }]).get(id) ?? null;
    expect(discogs).toMatchObject({
      state: 'not_searched',
      failure: null,
      fieldsChanged: false,
      candidateCount: 0,
    });
    expect(matchesAction({ discogs })).toBeNull();
  });

  it('matchesAction maps failed to retry and changed fields to again, except while not searched, queued or searching', () => {
    const base = {
      candidateCount: 0,
      topCandidates: [],
      failure: null,
      fieldsChanged: false,
    };
    expect(matchesAction({ discogs: null })).toBeNull();
    expect(
      matchesAction({
        discogs: { ...base, state: 'failed', fieldsChanged: true },
      }),
    ).toBe('retry');
    expect(
      matchesAction({
        discogs: { ...base, state: 'done', fieldsChanged: true },
      }),
    ).toBe('again');
    expect(
      matchesAction({
        discogs: { ...base, state: 'no_match', fieldsChanged: true },
      }),
    ).toBe('again');
    // WR-01: a not-searched card already says what happens next.
    expect(
      matchesAction({
        discogs: { ...base, state: 'not_searched', fieldsChanged: true },
      }),
    ).toBeNull();
    for (const state of ['queued', 'searching'] as const) {
      expect(
        matchesAction({ discogs: { ...base, state, fieldsChanged: true } }),
      ).toBeNull();
    }
    expect(matchesAction({ discogs: { ...base, state: 'done' } })).toBeNull();
  });

  it('showsFieldsChanged: never on a not-searched card (WR-01)', () => {
    const base = {
      candidateCount: 0,
      topCandidates: [],
      failure: null,
      fieldsChanged: true,
    };
    expect(showsFieldsChanged(null)).toBe(false);
    expect(showsFieldsChanged(undefined)).toBe(false);
    expect(
      showsFieldsChanged({
        ...base,
        state: 'not_searched',
        fieldsChanged: true,
      }),
    ).toBe(false);
    for (const state of [
      'done',
      'no_match',
      'failed',
      'queued',
      'searching',
    ] as const) {
      expect(showsFieldsChanged({ ...base, state })).toBe(true);
      expect(showsFieldsChanged({ ...base, state, fieldsChanged: false })).toBe(
        false,
      );
    }
  });
});

function useTempSecrets(): void {
  let dir = '';
  const names = ['SECRETS_FILE', ...Object.values(SECRET_ENV_NAMES)];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const n of names) {
      saved[n] = process.env[n];
      delete process.env[n];
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-card-'));
    process.env.SECRETS_FILE = path.join(dir, 'secrets.json');
    saveSecrets({
      discogsConsumerKey: 'CANARYDISCOGSKEY-0123456789wxyz',
      discogsConsumerSecret: 'CANARYDISCOGSSECRET-0123456789abcd',
    });
  });
  afterEach(() => {
    clearAuthInvalid();
    for (const n of names) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

function connect(): void {
  saveDiscogsAuth({
    token: 'CANARYTOKEN-0123456789efgh',
    tokenSecret: 'CANARYTOKENSECRET-0123456789ijkl',
    username: 'fake-owner',
  });
}

function autoSearchCount(spineId: string): number {
  return (
    getDb()
      .$client.prepare(
        `SELECT COUNT(*) AS n FROM discogs_searches
         WHERE kind = 'auto' AND spine_id = ?`,
      )
      .get(spineId) as { n: number }
  ).n;
}

/** current = the spine's current inputs hash; other* = a different one. */
type Hash = 'current' | 'other' | 'other2';
type Step = {
  status: Exclude<SearchStatus, 'queued'>;
  hash: Hash;
  errorKind?: string;
};

type Row = {
  name: string;
  steps: Step[] | 'enqueue';
  state: string;
  queues: boolean;
  action?: 'retry' | 'again' | null;
  padTitle?: boolean;
  /** A connect (includeAuthFailed) replays the rejected search once. */
  connectQueues?: boolean;
};

const ROWS: Row[] = [
  { name: 'none', steps: [], state: 'not_searched', queues: true },
  {
    name: 'skipped(other)',
    steps: [{ status: 'skipped', hash: 'other' }],
    state: 'not_searched',
    queues: true,
  },
  {
    name: 'not_connected(other)',
    steps: [{ status: 'not_connected', hash: 'other' }],
    state: 'not_searched',
    queues: true,
  },
  {
    name: 'no_match(current), skipped(other)',
    steps: [
      { status: 'no_match', hash: 'current' },
      { status: 'skipped', hash: 'other' },
    ],
    state: 'no_match',
    queues: false,
    action: null,
  },
  {
    name: 'no_match(current), not_connected(other)',
    steps: [
      { status: 'no_match', hash: 'current' },
      { status: 'not_connected', hash: 'other' },
    ],
    state: 'no_match',
    queues: false,
  },
  {
    name: 'no_match(other), skipped(other2)',
    steps: [
      { status: 'no_match', hash: 'other' },
      { status: 'skipped', hash: 'other2' },
    ],
    state: 'not_searched',
    queues: true,
    action: null,
  },
  {
    name: 'failed(current, rejected), skipped(other)',
    steps: [
      { status: 'failed', hash: 'current', errorKind: 'rejected' },
      { status: 'skipped', hash: 'other' },
    ],
    state: 'failed',
    queues: false,
    action: 'retry',
  },
  {
    name: 'auth_failed(current)',
    steps: [{ status: 'auth_failed', hash: 'current' }],
    state: 'failed',
    queues: false,
    connectQueues: true,
  },
  {
    name: 'failed(current), auth_failed(current)',
    steps: [
      { status: 'failed', hash: 'current' },
      { status: 'auth_failed', hash: 'current' },
    ],
    state: 'failed',
    queues: false,
    connectQueues: true,
  },
  {
    name: 'no_match(current), auth_failed(current)',
    steps: [
      { status: 'no_match', hash: 'current' },
      { status: 'auth_failed', hash: 'current' },
    ],
    state: 'failed',
    queues: false,
    connectQueues: true,
  },
  {
    name: 'no_match(other), auth_failed(current)',
    steps: [
      { status: 'no_match', hash: 'other' },
      { status: 'auth_failed', hash: 'current' },
    ],
    state: 'failed',
    queues: false,
    connectQueues: true,
  },
  {
    name: 'no_match(current)',
    steps: [{ status: 'no_match', hash: 'current' }],
    state: 'no_match',
    queues: false,
  },
  {
    name: 'failed(current)',
    steps: [{ status: 'failed', hash: 'current' }],
    state: 'failed',
    queues: false,
  },
  { name: 'queued', steps: 'enqueue', state: 'queued', queues: false },
  {
    name: 'no_match(current), skipped(other), title padded with spaces',
    steps: [
      { status: 'no_match', hash: 'current' },
      { status: 'skipped', hash: 'other' },
    ],
    state: 'no_match',
    queues: false,
    padTitle: true,
  },
];

describe('waiting its turn only when the maintenance hook will queue it', () => {
  useTempDataDir();
  useTempSecrets();

  async function activeCdSpine(): Promise<string> {
    const { spineIds } = await orphanScenario();
    connect();
    return spineIds[0];
  }

  function addSearch(spineId: string, step: Step, current: string): string {
    const db = getDb().$client;
    const id = createSearch(db, {
      spineId,
      kind: 'auto',
      inputs: loadSpineInputs(db, spineId),
      inputHash:
        step.hash === 'current'
          ? current
          : step.hash === 'other'
            ? 'other-inputs'
            : 'other-inputs-2',
    });
    finishSearch(db, id, {
      status: step.status,
      errorKind: step.errorKind ?? null,
    });
    return id;
  }

  for (const row of ROWS) {
    it(`${row.name}: ${row.state}, ${row.queues ? 'queues' : 'queues nothing'}`, async () => {
      const s0 = await activeCdSpine();
      const db = getDb().$client;
      const current = inputHash(loadSpineInputs(db, s0));
      if (row.steps === 'enqueue') {
        expect(enqueueAutoSearch(db, s0)).toBe(true);
      } else {
        for (const step of row.steps) addSearch(s0, step, current);
      }
      if (row.padTitle) {
        const title = fieldOf(s0, 'title').value ?? '';
        updateSpineField(s0, 'title', `   ${title.split(' ').join('   ')}  `);
      }
      const card = discogsForSpines(db, [{ id: s0 }]).get(s0);
      expect(card?.state).toBe(row.state);
      if (row.connectQueues) expect(card?.failure?.kind).toBe('auth');
      if (row.action !== undefined) {
        expect(matchesAction({ discogs: card ?? null })).toBe(row.action);
      }
      const before = autoSearchCount(s0);
      enqueueMissingSearches({ includeAuthFailed: false });
      const grew = autoSearchCount(s0) > before;
      expect(grew).toBe(row.queues);
      const waitingLine =
        card?.state === 'not_searched' &&
        notSearchedLine({ state: 'active', mediaKind: 'cd' }, true) ===
          NOT_SEARCHED_LINE;
      expect(waitingLine).toBe(grew);

      if (row.connectQueues) {
        // CR-01: a connect or a passing Test connection replays it once.
        const beforeConnect = autoSearchCount(s0);
        enqueueMissingSearches({ includeAuthFailed: true });
        expect(autoSearchCount(s0)).toBe(beforeConnect + 1);
        expect(discogsForSpines(db, [{ id: s0 }]).get(s0)).toMatchObject({
          state: 'queued',
          failure: null,
        });
        enqueueMissingSearches({ includeAuthFailed: true });
        expect(autoSearchCount(s0)).toBe(beforeConnect + 1);
      }
    });
  }

  it('notSearchedLine: not connected, orphaned, unsure media, else waiting its turn', () => {
    expect(notSearchedLine({ state: 'active', mediaKind: 'cd' }, false)).toBe(
      null,
    );
    expect(notSearchedLine({ state: 'orphaned', mediaKind: 'cd' }, true)).toBe(
      ORPHANED_LINE,
    );
    expect(
      notSearchedLine({ state: 'active', mediaKind: 'unsure' }, true),
    ).toBe(UNSURE_MEDIA_LINE);
    expect(notSearchedLine({ state: 'active', mediaKind: 'cd' }, true)).toBe(
      NOT_SEARCHED_LINE,
    );
  });

  it('ordering tie: two searches in the same millisecond order by id, in the card and the enqueue alike', async () => {
    const s0 = await activeCdSpine();
    const db = getDb().$client;
    const current = inputHash(loadSpineInputs(db, s0));
    const a = addSearch(s0, { status: 'no_match', hash: 'current' }, current);
    const b = addSearch(s0, { status: 'no_match', hash: 'other' }, current);
    expect(a < b).toBe(true);
    db.prepare(
      'UPDATE discogs_searches SET created_at = 1000 WHERE id IN (?, ?)',
    ).run(a, b);
    expect(discogsForSpines(db, [{ id: s0 }]).get(s0)?.fieldsChanged).toBe(
      true,
    );
    expect(enqueueAutoSearch(db, s0)).toBe(true);
  });
});
