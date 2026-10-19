import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTempDataDir } from '../../test/helpers/temp-data-dir';
import {
  clearSecret,
  getSecret,
  listSecretStatus,
  mask,
  SECRET_ENV_NAMES,
  SECRET_KEYS,
  SecretsFileError,
  saveSecrets,
  secretsFile,
} from './secrets';

const CANARY_KEY = 'CANARYKEY-0123456789wxyz';
const CANARY_SECRET = 'CANARYSECRET-0123456789abcd';
const ENV_KEY = 'ENVKEY-0123456789efgh';

/** Temp SECRETS_FILE outside DATA_DIR, plus clean Discogs env vars. */
function useTempSecretsFile(): () => string {
  let dir = '';
  const saved: Record<string, string | undefined> = {};
  const names = ['SECRETS_FILE', ...Object.values(SECRET_ENV_NAMES)];

  beforeEach(() => {
    for (const n of names) saved[n] = process.env[n];
    for (const n of Object.values(SECRET_ENV_NAMES)) delete process.env[n];
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-secrets-'));
    process.env.SECRETS_FILE = path.join(dir, 'secrets.json');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const n of names) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  return () => path.join(dir, 'secrets.json');
}

describe('secrets', () => {
  useTempDataDir();
  const file = useTempSecretsFile();

  it('exports the Discogs keys and their env names (D-08)', () => {
    expect(SECRET_KEYS).toEqual([
      'discogsConsumerKey',
      'discogsConsumerSecret',
    ]);
    expect(SECRET_ENV_NAMES).toEqual({
      discogsConsumerKey: 'DISCOGS_CONSUMER_KEY',
      discogsConsumerSecret: 'DISCOGS_CONSUMER_SECRET',
    });
    expect(secretsFile()).toBe(file());
  });

  it('getSecret prefers a non-empty env value, falls back to the file, else null, re-read per call', () => {
    expect(getSecret('discogsConsumerKey')).toBeNull();
    saveSecrets({ discogsConsumerKey: CANARY_KEY });
    expect(getSecret('discogsConsumerKey')).toBe(CANARY_KEY);
    process.env.DISCOGS_CONSUMER_KEY = ENV_KEY;
    expect(getSecret('discogsConsumerKey')).toBe(ENV_KEY);
    process.env.DISCOGS_CONSUMER_KEY = '   ';
    expect(getSecret('discogsConsumerKey')).toBe(CANARY_KEY);
    delete process.env.DISCOGS_CONSUMER_KEY;
    expect(getSecret('discogsConsumerKey')).toBe(CANARY_KEY);
    expect(getSecret('discogsConsumerSecret')).toBeNull();
  });

  it('mask hides short values and shows … plus the last 4 otherwise, never over 16 chars', () => {
    expect(mask('')).toBe('••••');
    expect(mask('12345678')).toBe('••••');
    expect(mask(CANARY_SECRET)).toBe('…abcd');
    for (let n = 0; n <= 5000; n += 7) {
      expect(mask('x'.repeat(n)).length).toBeLessThanOrEqual(16);
    }
    expect(mask('y'.repeat(5000)).length).toBeLessThanOrEqual(16);
  });

  it('listSecretStatus reports source, mask and fileValueExists without raw values', () => {
    saveSecrets({ discogsConsumerKey: CANARY_KEY });
    process.env.DISCOGS_CONSUMER_SECRET = CANARY_SECRET;
    let list = listSecretStatus();
    expect(list).toEqual([
      {
        key: 'discogsConsumerKey',
        label: 'Consumer key',
        envName: 'DISCOGS_CONSUMER_KEY',
        configured: true,
        source: 'file',
        masked: '…wxyz',
        fileValueExists: true,
      },
      {
        key: 'discogsConsumerSecret',
        label: 'Consumer secret',
        envName: 'DISCOGS_CONSUMER_SECRET',
        configured: true,
        source: 'env',
        masked: '…abcd',
        fileValueExists: false,
      },
    ]);
    process.env.DISCOGS_CONSUMER_KEY = ENV_KEY;
    delete process.env.DISCOGS_CONSUMER_SECRET;
    list = listSecretStatus();
    expect(list[0]).toMatchObject({
      source: 'env',
      masked: '…efgh',
      fileValueExists: true,
    });
    expect(list[1]).toMatchObject({
      configured: false,
      source: null,
      masked: null,
      fileValueExists: false,
    });
    const json = JSON.stringify(list);
    expect(json).not.toContain('CANARY');
    expect(json).not.toContain('ENVKEY-0123456789');
  });

  it('saveSecrets writes 0600 JSON via a temp file renamed onto secrets.json and keeps unknown keys', () => {
    fs.writeFileSync(file(), JSON.stringify({ discogsOauthToken: 'tok' }), {
      mode: 0o600,
    });
    const writes = vi.spyOn(fs, 'writeFileSync');
    const renames = vi.spyOn(fs, 'renameSync');
    saveSecrets({ discogsConsumerKey: CANARY_KEY });

    expect(writes).toHaveBeenCalledTimes(1);
    const tmp = String(writes.mock.calls[0]?.[0]);
    expect(tmp).not.toBe(file());
    expect(path.dirname(tmp)).toBe(path.dirname(file()));
    expect(writes.mock.calls[0]?.[2]).toMatchObject({ mode: 0o600 });
    expect(renames).toHaveBeenCalledTimes(1);
    expect(renames.mock.calls[0]).toEqual([tmp, file()]);
    expect(fs.existsSync(tmp)).toBe(false);

    expect(fs.statSync(file()).mode & 0o777).toBe(0o600);
    const raw = fs.readFileSync(file(), 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(JSON.parse(raw)).toEqual({
      discogsOauthToken: 'tok',
      discogsConsumerKey: CANARY_KEY,
    });
  });

  it('saving the same value twice leaves the file byte-identical', () => {
    saveSecrets({ discogsConsumerKey: CANARY_KEY });
    const before = fs.readFileSync(file());
    const writes = vi.spyOn(fs, 'writeFileSync');
    saveSecrets({ discogsConsumerKey: CANARY_KEY });
    expect(writes).not.toHaveBeenCalled();
    expect(fs.readFileSync(file()).equals(before)).toBe(true);
  });

  it('clearSecret removes only that key; clearing an absent key is a no-op', () => {
    expect(() => clearSecret('discogsConsumerKey')).not.toThrow();
    expect(fs.existsSync(file())).toBe(false);
    saveSecrets({
      discogsConsumerKey: CANARY_KEY,
      discogsConsumerSecret: CANARY_SECRET,
    });
    clearSecret('discogsConsumerKey');
    expect(JSON.parse(fs.readFileSync(file(), 'utf8'))).toEqual({
      discogsConsumerSecret: CANARY_SECRET,
    });
    const before = fs.readFileSync(file());
    expect(() => clearSecret('discogsConsumerKey')).not.toThrow();
    expect(fs.readFileSync(file()).equals(before)).toBe(true);
  });

  it('a malformed secrets.json throws SecretsFileError without content and is never overwritten', () => {
    const bad = '{"discogsConsumerKey": "CANARYKEY-0123456789wxyz", oops';
    fs.writeFileSync(file(), bad);
    expect(() => listSecretStatus()).toThrow(SecretsFileError);
    expect(() => saveSecrets({ discogsConsumerSecret: 'abcdefghijk' })).toThrow(
      SecretsFileError,
    );
    expect(() => clearSecret('discogsConsumerKey')).toThrow(SecretsFileError);
    try {
      listSecretStatus();
    } catch (err) {
      expect((err as Error).message).not.toContain('CANARY');
    }
    expect(fs.readFileSync(file(), 'utf8')).toBe(bad);

    fs.writeFileSync(file(), JSON.stringify({ discogsConsumerKey: 42 }));
    expect(() => listSecretStatus()).toThrow(SecretsFileError);
  });

  it('refuses a SECRETS_FILE inside DATA_DIR', () => {
    process.env.SECRETS_FILE = path.join(
      process.env.DATA_DIR as string,
      'secrets.json',
    );
    expect(() => secretsFile()).toThrow(
      'SECRETS_FILE must be outside DATA_DIR',
    );
    expect(() => saveSecrets({ discogsConsumerKey: CANARY_KEY })).toThrow(
      'SECRETS_FILE must be outside DATA_DIR',
    );
  });

  it('defaults to secrets.json in the working directory', () => {
    delete process.env.SECRETS_FILE;
    expect(secretsFile()).toBe(path.resolve(process.cwd(), 'secrets.json'));
  });
});
