import 'server-only';
import crypto from 'node:crypto';

// OAuth 1.0a PLAINTEXT signing for Discogs (RFC 5849 3.4.4 and 3.5.1).
// Discogs is HTTPS-only, so the signature is consumer_secret&token_secret,
// percent-encoded, with no HMAC. Nothing here logs or returns a secret
// except inside the header string the caller sends.

/** RFC 3986 percent-encoding: encodeURIComponent plus !'()* as %XX. */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export type OAuthHeaderParams = {
  consumerKey: string;
  consumerSecret: string;
  token?: string;
  tokenSecret?: string;
  callback?: string;
  verifier?: string;
  nonce?: string;
  timestamp?: number;
};

/** 'OAuth k="v", ...' Authorization header value, PLAINTEXT signed. */
export function buildOAuthHeader(p: OAuthHeaderParams): string {
  const params: Record<string, string> = {
    oauth_consumer_key: p.consumerKey,
    oauth_nonce: p.nonce ?? crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'PLAINTEXT',
    oauth_timestamp: String(p.timestamp ?? Math.floor(Date.now() / 1000)),
    oauth_version: '1.0',
    oauth_signature: `${percentEncode(p.consumerSecret)}&${percentEncode(p.tokenSecret ?? '')}`,
  };
  if (p.token) params.oauth_token = p.token;
  if (p.callback) params.oauth_callback = p.callback;
  if (p.verifier) params.oauth_verifier = p.verifier;
  return `OAuth ${Object.entries(params)
    .map(([k, v]) => `${k}="${percentEncode(v)}"`)
    .join(', ')}`;
}

/** application/x-www-form-urlencoded body as a plain record. */
export function parseFormBody(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(text)) out[k] = v;
  return out;
}
