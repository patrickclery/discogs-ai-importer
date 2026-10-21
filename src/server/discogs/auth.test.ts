import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SECRET_ENV_NAMES, saveSecrets } from '../secrets';
import {
  clearDiscogsAuth,
  clearPendingConnect,
  getDiscogsAuth,
  getDiscogsConnection,
  hasPendingConnect,
  MAX_REJECTED_CODES,
  markAuthInvalid,
  noteRejectedCode,
  PENDING_CONNECT_TTL_MS,
  peekPendingConnect,
  readPendingConnect,
  saveDiscogsAuth,
  setPendingConnect,
  takePendingConnect,
} from './auth';

// The pending-connect store and the token storage (D-02, D-03, T-03-38).

const CANARY_KEY = 'CANARYDISCOGSKEY-0123456789wxyz';
const CANARY_SECRET = 'CANARYDISCOGSSECRET-0123456789abcd';
const CANARY_TOKEN = 'CANARYTOKEN-0123456789efgh';
const CANARY_TOKEN_SECRET = 'CANARYTOKENSECRET-0123456789ijkl';
const CANARY_RT_SECRET = 'CANARYREQUESTSECRET-0123456789mnop';

const ISSUED = 1_800_000_000_000;

function entry(expiresAt = ISSUED + PENDING_CONNECT_TTL_MS) {
  return {
    secret: CANARY_RT_SECRET,
    callback: 'http://127.0.0.1:3001/api/discogs/callback',
    expiresAt,
  };
}

describe('discogs auth', () => {
  let dir = '';
  const names = ['SECRETS_FILE', ...Object.values(SECRET_ENV_NAMES)];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const n of names) {
      saved[n] = process.env[n];
      delete process.env[n];
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-discogs-auth-'));
    process.env.SECRETS_FILE = path.join(dir, 'secrets.json');
    clearPendingConnect();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(ISSUED);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    clearPendingConnect();
    for (const n of names) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('pending connect', () => {
    it('setPendingConnect replaces an earlier entry', () => {
      setPendingConnect('rt-1', entry());
      setPendingConnect('rt-2', entry());
      expect(takePendingConnect('rt-1')).toBeNull();
      expect(peekPendingConnect()?.oauthToken).toBe('rt-2');
    });

    it('takePendingConnect returns the entry once, then null', () => {
      setPendingConnect('rt-1', entry());
      expect(takePendingConnect('rt-1')?.secret).toBe(CANARY_RT_SECRET);
      expect(takePendingConnect('rt-1')).toBeNull();
      expect(hasPendingConnect()).toBe(false);
    });

    it('is live 14:59 after issue and gone at 15:00', () => {
      setPendingConnect('rt-1', entry());
      vi.setSystemTime(ISSUED + 14 * 60_000 + 59_000);
      expect(hasPendingConnect()).toBe(true);
      expect(readPendingConnect('rt-1')).not.toBeNull();
      vi.setSystemTime(ISSUED + 15 * 60_000);
      expect(hasPendingConnect()).toBe(false);
      expect(peekPendingConnect()).toBeNull();
      expect(readPendingConnect('rt-1')).toBeNull();
      expect(takePendingConnect('rt-1')).toBeNull();
    });

    it('the TTL is 15 minutes', () => {
      expect(PENDING_CONNECT_TTL_MS).toBe(15 * 60_000);
    });

    it('peekPendingConnect never carries the request-token secret', () => {
      setPendingConnect('rt-1', entry());
      const peek = peekPendingConnect();
      expect(peek).toEqual({
        oauthToken: 'rt-1',
        callback: 'http://127.0.0.1:3001/api/discogs/callback',
        expiresAt: ISSUED + PENDING_CONNECT_TTL_MS,
      });
      expect(JSON.stringify(peek)).not.toContain(CANARY_RT_SECRET);
    });

    it('readPendingConnect does not consume the entry', () => {
      setPendingConnect('rt-1', entry());
      expect(readPendingConnect('rt-1')?.secret).toBe(CANARY_RT_SECRET);
      expect(readPendingConnect('rt-1')?.secret).toBe(CANARY_RT_SECRET);
      expect(readPendingConnect('rt-other')).toBeNull();
      expect(hasPendingConnect()).toBe(true);
    });

    it('noteRejectedCode deletes the entry at the 5th rejection and not before', () => {
      expect(MAX_REJECTED_CODES).toBe(5);
      setPendingConnect('rt-1', entry());
      for (let i = 1; i < MAX_REJECTED_CODES; i++) {
        expect(noteRejectedCode('rt-1')).toBe(false);
        expect(readPendingConnect('rt-1')?.rejections).toBe(i);
        expect(hasPendingConnect()).toBe(true);
      }
      expect(noteRejectedCode('rt-1')).toBe(true);
      expect(hasPendingConnect()).toBe(false);
      expect(readPendingConnect('rt-1')).toBeNull();
    });

    it('noteRejectedCode on an unknown token reports it gone', () => {
      expect(noteRejectedCode('rt-none')).toBe(true);
    });

    it('a new connect starts the rejection count again', () => {
      setPendingConnect('rt-1', entry());
      for (let i = 1; i < MAX_REJECTED_CODES; i++) noteRejectedCode('rt-1');
      setPendingConnect('rt-2', entry());
      expect(noteRejectedCode('rt-2')).toBe(false);
      expect(readPendingConnect('rt-2')?.rejections).toBe(1);
    });
  });

  describe('token storage', () => {
    it('saveDiscogsAuth then getDiscogsAuth round-trips', () => {
      expect(getDiscogsAuth()).toBeNull();
      saveDiscogsAuth({
        token: CANARY_TOKEN,
        tokenSecret: CANARY_TOKEN_SECRET,
        username: 'fake-owner',
      });
      expect(getDiscogsAuth()).toEqual({
        token: CANARY_TOKEN,
        tokenSecret: CANARY_TOKEN_SECRET,
        username: 'fake-owner',
      });
      const mode = fs.statSync(process.env.SECRETS_FILE ?? '').mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it('clearDiscogsAuth removes all three keys in one write and keeps the consumer key and secret', () => {
      saveSecrets({
        discogsConsumerKey: CANARY_KEY,
        discogsConsumerSecret: CANARY_SECRET,
      });
      saveDiscogsAuth({
        token: CANARY_TOKEN,
        tokenSecret: CANARY_TOKEN_SECRET,
        username: 'fake-owner',
      });
      const renames = vi.spyOn(fs, 'renameSync');
      clearDiscogsAuth();
      expect(renames).toHaveBeenCalledTimes(1);
      const file = JSON.parse(
        fs.readFileSync(process.env.SECRETS_FILE ?? '', 'utf8'),
      ) as Record<string, string>;
      expect(file).toEqual({
        discogsConsumerKey: CANARY_KEY,
        discogsConsumerSecret: CANARY_SECRET,
      });
      expect(getDiscogsAuth()).toBeNull();
    });

    it('getDiscogsConnection never contains a token or secret field', () => {
      saveSecrets({
        discogsConsumerKey: CANARY_KEY,
        discogsConsumerSecret: CANARY_SECRET,
      });
      saveDiscogsAuth({
        token: CANARY_TOKEN,
        tokenSecret: CANARY_TOKEN_SECRET,
        username: 'fake-owner',
      });
      setPendingConnect('rt-1', entry());
      markAuthInvalid();
      const c = getDiscogsConnection();
      expect(Object.keys(c).sort()).toEqual([
        'connected',
        'credentialsSaved',
        'needsReconnect',
        'pendingConnect',
        'username',
      ]);
      expect(c).toEqual({
        connected: true,
        username: 'fake-owner',
        needsReconnect: true,
        pendingConnect: true,
        credentialsSaved: true,
      });
      const text = JSON.stringify(c);
      for (const canary of [
        CANARY_KEY,
        CANARY_SECRET,
        CANARY_TOKEN,
        CANARY_TOKEN_SECRET,
        CANARY_RT_SECRET,
        'rt-1',
      ]) {
        expect(text).not.toContain(canary);
      }
    });
  });
});
