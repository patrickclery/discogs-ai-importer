import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from 'next/cache';
import { getDb } from '@/server/db/client';
import { getDiscogsAuth, saveDiscogsAuth } from '@/server/discogs/auth';
import {
  COLLECTION_FOLDER_KEY,
  FOLDERS_CACHE_KEY,
  getCollectionFolderId,
} from '@/server/discogs/folders';
import {
  FALLBACK_COUNTRY_KEY,
  getFallbackCountry,
  getPreferredCountry,
  getSetting,
  PREFERRED_COUNTRY_KEY,
  setSetting,
} from '@/server/settings';
import {
  clearSecretAction,
  saveCollectionFolder,
  saveDiscogsCredentials,
  saveFallbackCountry,
  savePreferredCountry,
} from './actions';

const CANARY_KEY = 'CANARYKEY-0123456789wxyz';
const CANARY_SECRET = 'CANARYSECRET-0123456789abcd';
const EMPTY_COPY = "Paste the full value. It can't be empty or contain spaces.";

function form(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

describe('settings actions', () => {
  useTempDataDir();
  let dir = '';
  let previous: string | undefined;
  const file = () => path.join(dir, 'secrets.json');
  const readFile = () => JSON.parse(fs.readFileSync(file(), 'utf8'));

  beforeEach(() => {
    previous = process.env.SECRETS_FILE;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-actions-'));
    process.env.SECRETS_FILE = file();
    delete process.env.DISCOGS_CONSUMER_KEY;
    delete process.env.DISCOGS_CONSUMER_SECRET;
    vi.mocked(revalidatePath).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (previous === undefined) delete process.env.SECRETS_FILE;
    else process.env.SECRETS_FILE = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('saves both credentials, returns savedKeys only and revalidates /settings', async () => {
    const res = await saveDiscogsCredentials(
      null,
      form({
        discogsConsumerKey: `  ${CANARY_KEY} `,
        discogsConsumerSecret: CANARY_SECRET,
      }),
    );
    expect(res).toEqual({
      ok: true,
      savedKeys: ['discogsConsumerKey', 'discogsConsumerSecret'],
    });
    expect(JSON.stringify(res)).not.toContain('CANARY');
    expect(readFile()).toEqual({
      discogsConsumerKey: CANARY_KEY,
      discogsConsumerSecret: CANARY_SECRET,
    });
    expect(revalidatePath).toHaveBeenCalledWith('/settings');
  });

  it('ignores an absent field and saves the present one', async () => {
    const res = await saveDiscogsCredentials(
      null,
      form({ discogsConsumerSecret: CANARY_SECRET }),
    );
    expect(res).toEqual({ ok: true, savedKeys: ['discogsConsumerSecret'] });
    expect(readFile()).toEqual({ discogsConsumerSecret: CANARY_SECRET });
  });

  it('rejects a value containing a space with the UI-SPEC copy and writes nothing', async () => {
    const res = await saveDiscogsCredentials(
      null,
      form({ discogsConsumerKey: 'CANARY KEY', discogsConsumerSecret: 'ok-1' }),
    );
    expect(res).toEqual({
      ok: false,
      fieldErrors: { discogsConsumerKey: EMPTY_COPY },
    });
    expect(JSON.stringify(res)).not.toContain('CANARY');
    expect(fs.existsSync(file())).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('returns field errors on both fields when both are empty', async () => {
    const res = await saveDiscogsCredentials(
      null,
      form({ discogsConsumerKey: '', discogsConsumerSecret: '   ' }),
    );
    expect(res).toEqual({
      ok: false,
      fieldErrors: {
        discogsConsumerKey: EMPTY_COPY,
        discogsConsumerSecret: EMPTY_COPY,
      },
    });
  });

  it('two concurrent saves of different keys both persist', async () => {
    const [a, b] = await Promise.all([
      saveDiscogsCredentials(null, form({ discogsConsumerKey: CANARY_KEY })),
      saveDiscogsCredentials(
        null,
        form({ discogsConsumerSecret: CANARY_SECRET }),
      ),
    ]);
    expect(a?.ok).toBe(true);
    expect(b?.ok).toBe(true);
    expect(readFile()).toEqual({
      discogsConsumerKey: CANARY_KEY,
      discogsConsumerSecret: CANARY_SECRET,
    });
  });

  it('clearSecretAction removes only the named key and revalidates', async () => {
    await saveDiscogsCredentials(
      null,
      form({
        discogsConsumerKey: CANARY_KEY,
        discogsConsumerSecret: CANARY_SECRET,
      }),
    );
    vi.mocked(revalidatePath).mockClear();
    const res = await clearSecretAction('discogsConsumerKey');
    expect(res).toEqual({ ok: true });
    expect(readFile()).toEqual({ discogsConsumerSecret: CANARY_SECRET });
    expect(revalidatePath).toHaveBeenCalledWith('/settings');
  });

  it('clearSecretAction rejects an unknown key', async () => {
    const res = await clearSecretAction('anthropicApiKey' as never);
    expect(res.ok).toBe(false);
  });

  it('an I/O failure returns the save I/O copy with the reason cut to 160 chars', async () => {
    await saveDiscogsCredentials(
      null,
      form({ discogsConsumerKey: CANARY_KEY }),
    );
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('x'.repeat(500));
    });
    const res = await clearSecretAction('discogsConsumerKey');
    expect(res.ok).toBe(false);
    const msg = res.ok ? '' : res.formError;
    expect(msg.startsWith("Couldn't write secrets.json: ")).toBe(true);
    expect(msg).toContain('x'.repeat(160));
    expect(msg).not.toContain('x'.repeat(161));
    expect(
      msg.endsWith(
        'Check that the file and its folder are writable, then try again.',
      ),
    ).toBe(true);

    const save = await saveDiscogsCredentials(
      null,
      form({ discogsConsumerSecret: CANARY_SECRET }),
    );
    expect(save?.ok).toBe(false);
    expect(JSON.stringify(save)).not.toContain('CANARY');
    expect(save && !save.ok && save.formError).toMatch(
      /^Couldn't write secrets\.json: x{160}\. Check/,
    );
  });
  // RESEARCH Pitfall 7 / A4, T-03-13: the Discogs sign-in is bound to the
  // consumer key, so clearing a consumer value also disconnects.
  it('clearSecretAction on the consumer key while connected also disconnects', async () => {
    await saveDiscogsCredentials(
      null,
      form({
        discogsConsumerKey: CANARY_KEY,
        discogsConsumerSecret: CANARY_SECRET,
      }),
    );
    saveDiscogsAuth({
      token: 'CANARYTOKEN-0123456789efgh',
      tokenSecret: 'CANARYTOKENSECRET-0123456789ijkl',
      username: 'fake-owner',
    });
    expect(getDiscogsAuth()).not.toBeNull();
    const res = await clearSecretAction('discogsConsumerKey');
    expect(res).toEqual({ ok: true });
    expect(getDiscogsAuth()?.username ?? null).toBeNull();
    const stored = readFile();
    expect(stored).not.toHaveProperty('discogsOAuthToken');
    expect(stored).not.toHaveProperty('discogsOAuthTokenSecret');
    expect(stored).not.toHaveProperty('discogsUsername');
    expect(stored.discogsConsumerSecret).toBe(CANARY_SECRET);
  });

  it('clearSecretAction on the consumer secret while connected also disconnects', async () => {
    await saveDiscogsCredentials(
      null,
      form({
        discogsConsumerKey: CANARY_KEY,
        discogsConsumerSecret: CANARY_SECRET,
      }),
    );
    saveDiscogsAuth({
      token: 'CANARYTOKEN-0123456789efgh',
      tokenSecret: 'CANARYTOKENSECRET-0123456789ijkl',
      username: 'fake-owner',
    });
    expect(await clearSecretAction('discogsConsumerSecret')).toEqual({
      ok: true,
    });
    expect(getDiscogsAuth()?.username ?? null).toBeNull();
    expect(readFile().discogsConsumerKey).toBe(CANARY_KEY);
  });

  it('clearSecretAction while not connected still succeeds', async () => {
    await saveDiscogsCredentials(
      null,
      form({ discogsConsumerKey: CANARY_KEY }),
    );
    expect(await clearSecretAction('discogsConsumerKey')).toEqual({
      ok: true,
    });
    expect(getDiscogsAuth()).toBeNull();
    expect(readFile()).not.toHaveProperty('discogsConsumerKey');
  });

  // Nyquist gap audit (WR-03): the sign-in is bound to the consumer key, so
  // saving a different key must drop the old token, as clearing it does.
  it('WR-03: re-saving the same consumer key keeps the sign-in', async () => {
    await saveDiscogsCredentials(
      null,
      form({
        discogsConsumerKey: CANARY_KEY,
        discogsConsumerSecret: CANARY_SECRET,
      }),
    );
    saveDiscogsAuth({
      token: 'CANARYTOKEN-0123456789efgh',
      tokenSecret: 'CANARYTOKENSECRET-0123456789ijkl',
      username: 'fake-owner',
    });
    await saveDiscogsCredentials(
      null,
      form({ discogsConsumerKey: CANARY_KEY }),
    );
    expect(getDiscogsAuth()?.username).toBe('fake-owner');
  });

  it('WR-03: saving a new consumer key while connected drops the old sign-in', async () => {
    await saveDiscogsCredentials(
      null,
      form({
        discogsConsumerKey: CANARY_KEY,
        discogsConsumerSecret: CANARY_SECRET,
      }),
    );
    saveDiscogsAuth({
      token: 'CANARYTOKEN-0123456789efgh',
      tokenSecret: 'CANARYTOKENSECRET-0123456789ijkl',
      username: 'fake-owner',
    });
    expect(getDiscogsAuth()).not.toBeNull();
    const res = await saveDiscogsCredentials(
      null,
      form({ discogsConsumerKey: 'CANARYKEY-NEW-0123456789' }),
    );
    expect(res).toMatchObject({ ok: true });
    expect(getDiscogsAuth()).toBeNull();
  });
});

// saveCollectionFolder (D-03, IMP-02, T-04-22): only an integer of at least
// 1 that the cached folder list holds is saved; anything else answers a
// short reason and stores nothing.
describe('saveCollectionFolder', () => {
  useTempDataDir();
  const stored = () => getSetting(COLLECTION_FOLDER_KEY, z.unknown());

  beforeEach(() => {
    vi.mocked(revalidatePath).mockClear();
    setSetting(FOLDERS_CACHE_KEY, {
      folders: [
        { id: 1, name: 'Uncategorized', count: 4 },
        { id: 2, name: 'Jazz', count: 3 },
      ],
      fetchedAt: 1_700_000_000_000,
    });
  });

  it.each([
    ['0', 0],
    ['-1', -1],
    ['1.5', 1.5],
    ['NaN', Number.NaN],
    ['a string', '2' as unknown as number],
    ['an id missing from the cache', 9],
  ])(
    '%s answers ok false with a formError and stores nothing',
    async (_l, id) => {
      const res = await saveCollectionFolder(id);
      expect(res.ok).toBe(false);
      const formError = (res as { formError: string }).formError;
      expect(formError.length).toBeGreaterThan(0);
      expect(formError.length).toBeLessThanOrEqual(160);
      expect(formError).not.toMatch(/\.$/);
      expect(stored()).toBeNull();
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it('saves a cached folder, answers its name and revalidates /settings', async () => {
    const res = await saveCollectionFolder(2);
    expect(res).toEqual({ ok: true, name: 'Jazz' });
    expect(stored()).toBe(2);
    expect(getCollectionFolderId()).toBe(2);
    expect(revalidatePath).toHaveBeenCalledWith('/settings');
  });
});

// savePreferredCountry (D-14, T-06-09): Discogs' spelling is stored and
// answered; an empty value or a storage failure answers a bare reason.
describe('savePreferredCountry', () => {
  useTempDataDir();
  const stored = () => getSetting(PREFERRED_COUNTRY_KEY, z.unknown());

  /** A real SQLite failure on the next write of the preferred country. */
  function failWrites(message: string): void {
    getDb().$client.exec(
      `CREATE TRIGGER fail_country BEFORE INSERT ON settings
       WHEN NEW.key = 'preferred_country'
       BEGIN SELECT RAISE(ABORT, '${message}'); END`,
    );
  }

  beforeEach(() => {
    vi.mocked(revalidatePath).mockClear();
  });

  it("saves 'uk' as UK, answers it and revalidates /settings", async () => {
    expect(await savePreferredCountry('uk')).toEqual({
      ok: true,
      country: 'UK',
    });
    expect(stored()).toBe('UK');
    expect(getPreferredCountry()).toBe('UK');
    expect(revalidatePath).toHaveBeenCalledWith('/settings');
  });

  it('a blank value answers enter a country and stores nothing', async () => {
    expect(await savePreferredCountry('   ')).toEqual({
      ok: false,
      formError: 'enter a country',
    });
    expect(stored()).toBeNull();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('a storage failure answers the reason without its trailing period', async () => {
    failWrites('the disk is full.');
    expect(await savePreferredCountry('Japan')).toEqual({
      ok: false,
      formError: 'the disk is full',
    });
    expect(stored()).toBeNull();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('cuts a long failure reason to 160 characters', async () => {
    failWrites('x'.repeat(300));
    const res = await savePreferredCountry('Japan');
    expect(res.ok).toBe(false);
    expect((res as { formError: string }).formError).toBe('x'.repeat(160));
  });

  it('a 41-character value answers a reason and stores nothing', async () => {
    expect(await savePreferredCountry('x'.repeat(41))).toEqual({
      ok: false,
      formError: 'a country name is at most 40 characters',
    });
    expect(stored()).toBeNull();
  });
});

// saveFallbackCountry (G-06-side-1, T-06-28): the same answers as
// savePreferredCountry, under its own key.
describe('saveFallbackCountry', () => {
  useTempDataDir();
  const stored = () => getSetting(FALLBACK_COUNTRY_KEY, z.unknown());

  function failWrites(message: string): void {
    getDb().$client.exec(
      `CREATE TRIGGER fail_fallback BEFORE INSERT ON settings
       WHEN NEW.key = 'fallback_country'
       BEGIN SELECT RAISE(ABORT, '${message}'); END`,
    );
  }

  beforeEach(() => {
    vi.mocked(revalidatePath).mockClear();
  });

  it("saves 'uk' as UK, answers it and revalidates /settings", async () => {
    expect(await saveFallbackCountry('uk')).toEqual({
      ok: true,
      country: 'UK',
    });
    expect(stored()).toBe('UK');
    expect(getFallbackCountry()).toBe('UK');
    expect(getPreferredCountry()).toBe('Canada');
    expect(revalidatePath).toHaveBeenCalledWith('/settings');
  });

  it('a blank value answers enter a country and stores nothing', async () => {
    expect(await saveFallbackCountry('   ')).toEqual({
      ok: false,
      formError: 'enter a country',
    });
    expect(stored()).toBeNull();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('a 41-character value answers a reason and stores nothing', async () => {
    expect(await saveFallbackCountry('x'.repeat(41))).toEqual({
      ok: false,
      formError: 'a country name is at most 40 characters',
    });
    expect(stored()).toBeNull();
  });

  it('a storage failure answers the reason without its trailing period', async () => {
    failWrites('the disk is full.');
    expect(await saveFallbackCountry('Japan')).toEqual({
      ok: false,
      formError: 'the disk is full',
    });
    expect(stored()).toBeNull();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('cuts a long failure reason to 160 characters', async () => {
    failWrites('x'.repeat(300));
    const res = await saveFallbackCountry('Japan');
    expect(res.ok).toBe(false);
    expect((res as { formError: string }).formError).toBe('x'.repeat(160));
  });
});
