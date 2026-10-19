import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from 'next/cache';
import { clearSecretAction, saveDiscogsCredentials } from './actions';

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
});
