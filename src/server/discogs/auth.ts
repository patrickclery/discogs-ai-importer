import 'server-only';
import { getSecret, readSecretsFileKey, updateSecretsFile } from '../secrets';

// The owner's Discogs sign-in (D-02, D-03). The access token, its secret and
// the username live in secrets.json next to the consumer credentials, under
// keys that are deliberately NOT in SECRET_KEYS, so the editable credentials
// form never lists them. They never leave the server: the browser only ever
// sees getDiscogsConnection(), which carries no secret.
//
// The pending request-token secret is held in memory only (the settings table
// must never hold secrets), keyed by oauth_token, one connect at a time, and
// expires with the Discogs request token after 15 minutes. A restart mid
// connect loses it, which means clicking Connect again.

const TOKEN_KEY = 'discogsOAuthToken';
const TOKEN_SECRET_KEY = 'discogsOAuthTokenSecret';
const USERNAME_KEY = 'discogsUsername';

/** Discogs request tokens expire 15 minutes after issue. */
export const PENDING_CONNECT_TTL_MS = 15 * 60_000;

export type DiscogsAuth = {
  token: string;
  tokenSecret: string;
  username: string;
};

/** Pasted codes Discogs may reject before the pending connect is dropped. */
export const MAX_REJECTED_CODES = 5;

export type PendingConnect = {
  secret: string;
  callback: string;
  expiresAt: number;
  /** Pasted codes Discogs rejected for this request token (T-03-38). */
  rejections?: number;
};

/** Safe to render: no token, secret or verifier. */
export type DiscogsConnection = {
  connected: boolean;
  username: string | null;
  needsReconnect: boolean;
  pendingConnect: boolean;
  credentialsSaved: boolean;
};

const g = globalThis as unknown as {
  __discogsPending?: Map<string, PendingConnect>;
  __discogsAuthInvalid?: boolean;
};

function pendingMap(): Map<string, PendingConnect> {
  if (!g.__discogsPending) g.__discogsPending = new Map();
  return g.__discogsPending;
}

export function getDiscogsAuth(): DiscogsAuth | null {
  const token = readSecretsFileKey(TOKEN_KEY);
  const tokenSecret = readSecretsFileKey(TOKEN_SECRET_KEY);
  const username = readSecretsFileKey(USERNAME_KEY);
  if (!token || !tokenSecret || !username) return null;
  return { token, tokenSecret, username };
}

/** Saves all three values in one atomic write and clears the invalid flag. */
export function saveDiscogsAuth(v: DiscogsAuth): void {
  updateSecretsFile((current) => ({
    ...current,
    [TOKEN_KEY]: v.token,
    [TOKEN_SECRET_KEY]: v.tokenSecret,
    [USERNAME_KEY]: v.username,
  }));
  g.__discogsAuthInvalid = false;
}

/** Removes all three values in one write (Disconnect). */
export function clearDiscogsAuth(): void {
  updateSecretsFile((current) => {
    const next = { ...current };
    delete next[TOKEN_KEY];
    delete next[TOKEN_SECRET_KEY];
    delete next[USERNAME_KEY];
    return next;
  });
  g.__discogsAuthInvalid = false;
}

/** Stores the one in-flight connect, replacing any earlier one. */
export function setPendingConnect(token: string, entry: PendingConnect): void {
  const map = pendingMap();
  map.clear();
  map.set(token, { ...entry });
}

/** Single use: deletes the entry and returns it when still live. */
export function takePendingConnect(
  token: string,
  now: number = Date.now(),
): PendingConnect | null {
  const map = pendingMap();
  const entry = map.get(token);
  if (!entry) return null;
  map.delete(token);
  return entry.expiresAt > now ? entry : null;
}

/**
 * The live entry, secret included, WITHOUT consuming it. Only the paste-code
 * finish route uses it: a rejected code must leave the entry for another try
 * (up to MAX_REJECTED_CODES). Never return its result to a browser.
 */
export function readPendingConnect(
  token: string,
  now: number = Date.now(),
): PendingConnect | null {
  const entry = pendingMap().get(token);
  if (!entry || entry.expiresAt <= now) return null;
  return { ...entry };
}

/**
 * Counts a pasted code Discogs rejected. At the MAX_REJECTED_CODES-th
 * rejection the entry is deleted, so guessing codes ends there (T-03-38).
 * Returns true when the entry is gone.
 */
export function noteRejectedCode(token: string): boolean {
  const map = pendingMap();
  const entry = map.get(token);
  if (!entry) return true;
  const rejections = (entry.rejections ?? 0) + 1;
  if (rejections >= MAX_REJECTED_CODES) {
    map.delete(token);
    return true;
  }
  map.set(token, { ...entry, rejections });
  return false;
}

/** The live pending connect without its secret, or null. */
export function peekPendingConnect(
  now: number = Date.now(),
): { oauthToken: string; callback: string; expiresAt: number } | null {
  for (const [oauthToken, entry] of pendingMap()) {
    if (entry.expiresAt > now) {
      return {
        oauthToken,
        callback: entry.callback,
        expiresAt: entry.expiresAt,
      };
    }
  }
  return null;
}

export function hasPendingConnect(now: number = Date.now()): boolean {
  return peekPendingConnect(now) !== null;
}

export function clearPendingConnect(): void {
  pendingMap().clear();
}

/** Set when a signed request with the stored token gets a 401. */
export function markAuthInvalid(): void {
  g.__discogsAuthInvalid = true;
}

/** A signed request with the stored token worked again (Test connection). */
export function clearAuthInvalid(): void {
  g.__discogsAuthInvalid = false;
}

export function isAuthInvalid(): boolean {
  return g.__discogsAuthInvalid === true;
}

export function getDiscogsConnection(): DiscogsConnection {
  const auth = getDiscogsAuth();
  return {
    connected: auth !== null,
    username: auth?.username ?? null,
    needsReconnect: auth !== null && isAuthInvalid(),
    pendingConnect: hasPendingConnect(),
    credentialsSaved:
      getSecret('discogsConsumerKey') !== null &&
      getSecret('discogsConsumerSecret') !== null,
  };
}
