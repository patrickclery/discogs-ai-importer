import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BulkItemDto } from '@/lib/bulk-types';
import type {
  CandidateDto,
  SearchStatus,
  SpineDiscogsDto,
} from '@/lib/discogs-types';
import type { ImportDto } from '@/lib/import-types';
import type { SpineDto } from '@/lib/scan-types';
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
  bulkNoticeKind,
  FIELDS_CHANGED_LINE,
  matchesAction,
  NOT_SEARCHED_LINE,
  noticeLineKind,
  notSearchedLine,
  ORPHANED_LINE,
  showsFieldsChanged,
  UNSURE_MEDIA_LINE,
} from './discogs-matches';
import { SpineView } from './photo-section';
import { TooltipProvider } from './ui/tooltip';

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

// Phase 6 bulk states on Detailed and expanded cards (UI-SPEC Detailed
// layout): the country badge before the state badge, the fallback line in
// the confirmed panel, and the skipped / lookup-failure line as the Discogs
// section's notice line, which loses to not connected and the paused
// countdown and wins over Fields changed.

function bulkItem(over: Partial<BulkItemDto> = {}): BulkItemDto {
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
    createdAt: 10,
    ...over,
  };
}

const FAILED_ITEM = bulkItem({
  phase: 'failed',
  importId: null,
  outcome: null,
  country: null,
  failure: { kind: 'unavailable', reason: null },
});

const SKIPPED_ITEM = bulkItem({
  phase: 'skipped',
  importId: null,
  outcome: null,
  country: null,
  skip: {
    reason: 'duplicate',
    photo: 'IMG_1.jpg',
    spineNumber: 4,
    samePhoto: true,
  },
});

function cand(over: Partial<CandidateDto> = {}): CandidateDto {
  return {
    id: 'cand-1',
    releaseId: 1234,
    title: 'Nirvana - Nevermind',
    year: 1991,
    country: 'US',
    labels: ['DGC'],
    catno: 'DGCD-24425',
    formats: [],
    hasThumb: false,
    source: 'auto',
    catnoMatch: false,
    stage: null,
    ...over,
  };
}

function discogsDto(over: Partial<SpineDiscogsDto> = {}): SpineDiscogsDto {
  return {
    state: 'done',
    candidateCount: 1,
    topCandidates: [cand()],
    failure: null,
    fieldsChanged: false,
    ...over,
  };
}

function imp(over: Partial<ImportDto> = {}): ImportDto {
  return {
    id: 'i1',
    phase: 'waiting',
    releaseId: 777,
    candidateId: 'cand-1',
    candidate: {
      title: 'Nirvana - Nevermind',
      year: 1991,
      country: 'US',
      labels: ['DGC'],
      catno: 'DGCD-24425',
      formats: [],
    },
    hasThumb: false,
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

function card(over: Partial<SpineDto> = {}): SpineDto {
  return {
    id: 'sp-1',
    photoId: 'p1',
    index: 0,
    state: 'active',
    legibility: null,
    crop: { url: '/api/files/crops/sp-1.jpg', width: 400, height: 60 },
    fields: [],
    createdRunId: 'r1',
    orphanedRunNo: null,
    mediaKind: 'cd',
    discogs: discogsDto(),
    import: null,
    notOnDiscogs: false,
    reviewStatus: 'pending',
    bulk: null,
    ...over,
  };
}

const withItem = (item: BulkItemDto, over: Partial<SpineDto> = {}) =>
  card({ ...over, bulk: { eligible: false, reason: null, item } });

function detailed(s: SpineDto, connected = true): string {
  return renderToStaticMarkup(
    h(
      QueryClientProvider,
      { client: new QueryClient() },
      h(
        TooltipProvider,
        null,
        h(SpineView, {
          spine: s,
          threshold: 0.7,
          discogs: { connected, needsReconnect: false, pausedUntil: null },
        }),
      ),
    ),
  );
}

describe('bulkNoticeKind', () => {
  it('a failed lookup and a skipped duplicate are notice lines', () => {
    expect(bulkNoticeKind(withItem(FAILED_ITEM))).toBe('failed');
    expect(bulkNoticeKind(withItem(SKIPPED_ITEM))).toBe('skipped');
  });

  it('a fallback, a finding item and no item are not', () => {
    const fallback = withItem(
      bulkItem({ outcome: 'fallback_no_version', country: 'US' }),
      { import: imp() },
    );
    expect(bulkNoticeKind(fallback)).toBeNull();
    expect(
      bulkNoticeKind(withItem(bulkItem({ phase: 'finding', importId: null }))),
    ).toBeNull();
    expect(bulkNoticeKind(card())).toBeNull();
  });
});

describe('noticeLineKind precedence', () => {
  const on = { connected: true, pausedSeconds: 0 };

  it('not connected wins over a failed lookup', () => {
    expect(
      noticeLineKind(withItem(FAILED_ITEM), {
        connected: false,
        pausedSeconds: 0,
      }),
    ).toBe('not_connected');
  });

  it('the paused countdown wins over a skipped duplicate', () => {
    expect(
      noticeLineKind(withItem(SKIPPED_ITEM), {
        connected: true,
        pausedSeconds: 12,
      }),
    ).toBe('paused');
  });

  it('a bulk line wins over Fields changed', () => {
    const changed = discogsDto({ fieldsChanged: true });
    expect(
      noticeLineKind(withItem(FAILED_ITEM, { discogs: changed }), on),
    ).toBe('lookup_failed');
    expect(
      noticeLineKind(withItem(SKIPPED_ITEM, { discogs: changed }), on),
    ).toBe('skipped');
    expect(noticeLineKind(card({ discogs: changed }), on)).toBe(
      'fields_changed',
    );
  });

  it('an imported card shows no notice line', () => {
    expect(
      noticeLineKind(
        withItem(FAILED_ITEM, { import: imp({ phase: 'imported' }) }),
        {
          connected: false,
          pausedSeconds: 0,
        },
      ),
    ).toBeNull();
  });

  it('a failed search with no import still reads search_failed', () => {
    expect(
      noticeLineKind(
        card({
          discogs: discogsDto({
            state: 'failed',
            failure: { kind: 'unavailable', reason: null },
          }),
        }),
        on,
      ),
    ).toBe('search_failed');
  });
});

describe('Detailed card bulk states', () => {
  it('a resolved fallback shows Fallback: US before the state badge, and the fallback line between the box and the state line', () => {
    const html = detailed(
      withItem(bulkItem({ outcome: 'fallback_no_version', country: 'US' }), {
        import: imp({ phase: 'waiting' }),
      }),
    );
    const badge = html.indexOf('Fallback: US');
    expect(badge).toBeGreaterThan(-1);
    expect(badge).toBeLessThan(html.indexOf('Waiting to import'));
    const line = html.indexOf('No Canadian pressing, used US');
    expect(line).toBeGreaterThan(html.indexOf('Nirvana - Nevermind'));
    expect(line).toBeLessThan(html.lastIndexOf('Change match'));
  });

  it('a skipped duplicate shows the skipped line above the candidate list', () => {
    const html = detailed(withItem(SKIPPED_ITEM));
    const line = html.indexOf('Already imported from spine #4');
    expect(line).toBeGreaterThan(-1);
    expect(line).toBeLessThan(html.indexOf('Nirvana - Nevermind'));
  });

  it('a failed lookup shows its line and Retry import above an older failed import panel', () => {
    const html = detailed(
      withItem(FAILED_ITEM, {
        import: imp({
          phase: 'failed',
          canRetry: true,
          failure: { kind: 'unavailable', reason: null },
        }),
      }),
    );
    const line = html.indexOf(
      'Couldn&#x27;t look up pressings: Discogs didn&#x27;t respond.',
    );
    expect(line).toBeGreaterThan(-1);
    expect(line).toBeLessThan(html.indexOf('Nirvana - Nevermind'));
    expect(html).toContain('Retry import');
  });

  it('not connected replaces the failed lookup line', () => {
    const html = detailed(withItem(FAILED_ITEM), false);
    expect(html).toContain('Connect Discogs to find matches.');
    expect(html).not.toContain('Couldn&#x27;t look up pressings');
  });

  it('a bulk line replaces Fields changed', () => {
    const html = detailed(
      withItem(SKIPPED_ITEM, { discogs: discogsDto({ fieldsChanged: true }) }),
    );
    expect(html).toContain('Already imported from spine #4');
    expect(html).not.toContain(FIELDS_CHANGED_LINE);
  });

  it('a manual import shows no country badge', () => {
    const html = detailed(card({ import: imp({ phase: 'waiting' }) }));
    expect(html).not.toContain('Fallback:');
    expect(html).not.toContain('No Canadian pressing');
  });
});
