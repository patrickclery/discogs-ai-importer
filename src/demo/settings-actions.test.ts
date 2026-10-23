import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import type * as RealActions from '@/app/settings/actions';
import { VISION_MODELS } from '@/lib/claude-types';
import * as DemoActions from './settings-actions';
import {
  clearSecretAction,
  saveCollectionFolder,
  saveDiscogsCredentials,
  saveVisionModel,
  testClaudeAction,
} from './settings-actions';
import { getState, resetStore, setClock, subscribe } from './store';

// D-12, D-03, D-04, T-05-23: the demo build aliases '@/app/settings/actions'
// to this module. Each action answers what the real server action answers
// and only changes page memory; a typed credential is kept as a masked tail.

const T0 = Date.UTC(2026, 9, 23, 12, 0, 0);
const EMPTY_COPY = "Paste the full value. It can't be empty or contain spaces.";
const CANARY = 'CANARYKEY0123456789abcdefWXYZ1234';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  setClock(() => T0);
  resetStore();
});

afterEach(() => {
  setClock(null);
  vi.useRealTimers();
});

async function settle<T>(p: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return p;
}

function form(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

describe('demo settings actions', () => {
  it('is a drop-in for the real actions module (types)', () => {
    const asReal: typeof RealActions = DemoActions;
    expect(Object.keys(asReal).sort()).toEqual([
      'clearSecretAction',
      'saveCollectionFolder',
      'saveDiscogsCredentials',
      'saveVisionModel',
      'testClaudeAction',
    ]);
    expectTypeOf<DemoActions.ActionState>().toEqualTypeOf<RealActions.ActionState>();
  });

  it('saves either listed vision model and refuses any other id', async () => {
    for (const m of [...VISION_MODELS].reverse()) {
      expect(await settle(saveVisionModel(m.id))).toEqual({ ok: true });
      expect(getState().account.model).toBe(m.id);
    }
    const before = getState().account.model;
    expect(await settle(saveVisionModel('claude-haiku-4-5'))).toEqual({
      ok: false,
      formError: 'Choose one of the listed models.',
    });
    expect(getState().account.model).toBe(before);
  });

  it('notifies subscribers after a change', async () => {
    const fn = vi.fn();
    const off = subscribe(fn);
    await settle(saveVisionModel('claude-sonnet-5-5'));
    off();
    expect(fn).toHaveBeenCalled();
  });

  it('saves a listed collection folder and refuses an unlisted one', async () => {
    const account = getState().account;
    account.folders = [
      { id: 1, name: 'Uncategorized', count: 0 },
      { id: 7, name: 'CDs', count: 12 },
    ];
    expect(await settle(saveCollectionFolder(7))).toEqual({
      ok: true,
      name: 'CDs',
    });
    expect(getState().account.folderId).toBe(7);
    for (const bad of [99, 0, 1.5, Number.NaN]) {
      expect(await settle(saveCollectionFolder(bad))).toEqual({
        ok: false,
        formError: 'that folder is not in your Discogs folder list',
      });
    }
    expect(getState().account.folderId).toBe(7);
  });

  it('keeps only a masked tail of a saved credential and disconnects', async () => {
    const res = await settle(
      saveDiscogsCredentials(null, form({ discogsConsumerKey: ` ${CANARY} ` })),
    );
    expect(res).toEqual({ ok: true, savedKeys: ['discogsConsumerKey'] });
    const account = getState().account;
    expect(account.consumerKeyTail).toBe('…1234');
    expect(account.connected).toBe(false);
    expect(JSON.stringify(getState())).not.toContain(CANARY);
    expect(JSON.stringify(getState())).not.toContain('CANARYKEY');
    expect(JSON.stringify(res)).not.toContain('CANARY');
  });

  it('masks short values fully', async () => {
    await settle(
      saveDiscogsCredentials(null, form({ discogsConsumerSecret: 'abc123' })),
    );
    expect(getState().account.consumerSecretTail).toBe('••••');
  });

  it('answers the real refusals for empty, spaced and missing values', async () => {
    expect(
      await settle(
        saveDiscogsCredentials(
          null,
          form({ discogsConsumerKey: '   ', discogsConsumerSecret: 'a b' }),
        ),
      ),
    ).toEqual({
      ok: false,
      fieldErrors: {
        discogsConsumerKey: EMPTY_COPY,
        discogsConsumerSecret: EMPTY_COPY,
      },
    });
    expect(await settle(saveDiscogsCredentials(null, form({})))).toEqual({
      ok: false,
      formError: 'Nothing to save. Paste a value first.',
    });
    expect(getState().account.connected).toBe(true);
    expect(getState().account.consumerKeyTail).toBe('••••demo');
  });

  it('clears a tail and, like the real app, disconnects', async () => {
    getState().account.pendingConnectAt = T0;
    expect(await settle(clearSecretAction('discogsConsumerSecret'))).toEqual({
      ok: true,
    });
    const account = getState().account;
    expect(account.consumerSecretTail).toBeNull();
    expect(account.consumerKeyTail).toBe('••••demo');
    expect(account.connected).toBe(false);
    expect(account.pendingConnectAt).toBeNull();
  });

  it('refuses an unknown key without changing anything', async () => {
    const before = JSON.stringify(getState().account);
    expect(
      await settle(clearSecretAction('nope' as 'discogsConsumerKey')),
    ).toEqual({ ok: false, formError: 'Unknown setting.' });
    expect(JSON.stringify(getState().account)).toBe(before);
  });

  it('Test Claude answers success with the selected model after a delay', async () => {
    await settle(saveVisionModel('claude-sonnet-5-5'));
    let done = false;
    const pending = testClaudeAction().then((r) => {
      done = true;
      return r;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    expect(await settle(pending)).toEqual({
      ok: true,
      model: 'claude-sonnet-5-5',
      message:
        'Claude works. claude-sonnet-5-5 answered through your subscription.',
    });
  });
});
