import 'server-only';
import { z } from 'zod';
import { setSetting } from '../settings';
import {
  PENDING_CONNECT_TTL_MS,
  type PendingConnect,
  saveDiscogsAuth,
  setPendingConnect,
} from './auth';
import { DiscogsRequestError, discogsFetch } from './client';
import { webBase } from './config';
import { parseFormBody, percentEncode } from './oauth';

// The OAuth 1.0a connect flow (D-01, D-03), shared by the connect and
// callback routes and by Plan 03-04's paste-code route. No thrown message
// ever carries a token, a secret or the verifier.

const IdentitySchema = z.object({
  username: z.string().trim().min(1).max(100),
});

/** host[:port] as sent in the Host header; the proxy already limits it. */
const HOST_RE = /^[A-Za-z0-9.-]+(:\d{1,5})?$/;

/** The callback URL for this server, from the incoming Host header (D-03). */
export function callbackUrlFor(host: string | null): string {
  if (!host || !HOST_RE.test(host)) {
    throw new DiscogsRequestError('The request has no usable Host header');
  }
  return `http://${host}/api/discogs/callback`;
}

/** Gets a request token and returns the discogs.com authorize URL. */
export async function startConnect(
  host: string | null,
): Promise<{ authorizeUrl: string }> {
  const callback = callbackUrlFor(host);
  const res = await discogsFetch({
    path: '/oauth/request_token',
    auth: 'consumer',
    callback,
  });
  const form = parseFormBody(res.text);
  const token = form.oauth_token;
  const secret = form.oauth_token_secret;
  if (!token || !secret) {
    throw new DiscogsRequestError(
      'Discogs did not return a request token',
      res.status,
    );
  }
  setPendingConnect(token, {
    secret,
    callback,
    expiresAt: Date.now() + PENDING_CONNECT_TTL_MS,
  });
  return {
    authorizeUrl: `${webBase()}/oauth/authorize?oauth_token=${percentEncode(token)}`,
  };
}

/**
 * Exchanges the approved request token, reads the username and saves the
 * connection. The exchange is signed consumer_secret&request_token_secret
 * (RFC 5849); a 401 is retried once signed consumer_secret& as the Discogs
 * docs print it (RESEARCH A2).
 */
export async function completeConnect(p: {
  oauthToken: string;
  verifier: string;
  pending: PendingConnect;
  via: 'callback' | 'code';
}): Promise<{ username: string }> {
  const exchange = (tokenSecret: string) =>
    discogsFetch({
      method: 'POST',
      path: '/oauth/access_token',
      auth: 'request',
      token: p.oauthToken,
      tokenSecret,
      verifier: p.verifier,
    });

  let exchangeForm: 'standard' | 'docs' = 'standard';
  let res: Awaited<ReturnType<typeof discogsFetch>>;
  try {
    res = await exchange(p.pending.secret);
  } catch (err) {
    // Compare by name: HMR can leave two copies of the class alive.
    if ((err as Error | null)?.name !== 'DiscogsAuthError') throw err;
    exchangeForm = 'docs';
    res = await exchange('');
  }

  const form = parseFormBody(res.text);
  const token = form.oauth_token;
  const tokenSecret = form.oauth_token_secret;
  if (!token || !tokenSecret) {
    throw new DiscogsRequestError(
      'Discogs did not return an access token',
      res.status,
    );
  }

  const identity = await discogsFetch({
    path: '/oauth/identity',
    auth: 'request',
    token,
    tokenSecret,
  });
  const parsed = IdentitySchema.safeParse(identity.json);
  if (!parsed.success) {
    throw new DiscogsRequestError(
      'Discogs identity answer has no username',
      identity.status,
    );
  }
  const username = parsed.data.username;

  saveDiscogsAuth({ token, tokenSecret, username });
  // Non-secret facts Plan 03-13's live report reads to settle A1 and A2.
  setSetting('discogs_exchange_form', exchangeForm);
  setSetting('discogs_connect_via', p.via);
  return { username };
}
