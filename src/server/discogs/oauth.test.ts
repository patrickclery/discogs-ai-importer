import { describe, expect, it } from 'vitest';
import { buildOAuthHeader, parseFormBody, percentEncode } from './oauth';

// PLAINTEXT OAuth 1.0a signer (RFC 5849 3.4.4, 3.5.1; RESEARCH "PLAINTEXT
// OAuth header"). Fixed nonce and timestamp so the header is exact.

const FIXED = { nonce: 'n0nce', timestamp: 1_700_000_000 };

/** 'OAuth k="v", ...' -> { k: raw (still encoded) v }. */
function params(header: string): Record<string, string> {
  expect(header.startsWith('OAuth ')).toBe(true);
  const out: Record<string, string> = {};
  for (const m of header.slice(6).matchAll(/([a-z_]+)="([^"]*)"/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

describe('percentEncode', () => {
  it("encodes RFC 3986 reserved characters, including !'()*", () => {
    expect(percentEncode("a b&c!'()*~-._")).toBe(
      'a%20b%26c%21%27%28%29%2A~-._',
    );
  });
});

describe('buildOAuthHeader', () => {
  it('produces the exact header for consumer-only signing', () => {
    expect(
      buildOAuthHeader({
        consumerKey: 'ck',
        consumerSecret: 'cs',
        ...FIXED,
      }),
    ).toBe(
      'OAuth oauth_consumer_key="ck", oauth_nonce="n0nce", oauth_signature_method="PLAINTEXT", oauth_timestamp="1700000000", oauth_version="1.0", oauth_signature="cs%26"',
    );
  });

  it('produces the exact header with a token and verifier', () => {
    expect(
      buildOAuthHeader({
        consumerKey: 'ck',
        consumerSecret: 'cs',
        token: 'tok',
        tokenSecret: 'ts',
        verifier: 'ver',
        ...FIXED,
      }),
    ).toBe(
      'OAuth oauth_consumer_key="ck", oauth_nonce="n0nce", oauth_signature_method="PLAINTEXT", oauth_timestamp="1700000000", oauth_version="1.0", oauth_signature="cs%26ts", oauth_token="tok", oauth_verifier="ver"',
    );
  });

  it("encodes a consumer secret with '&', '!' and a space once in the signature and again as a header value", () => {
    const p = params(
      buildOAuthHeader({
        consumerKey: 'ck',
        consumerSecret: 'a&b! c',
        tokenSecret: 't s',
        ...FIXED,
      }),
    );
    // Signature: percentEncode('a&b! c') + '&' + percentEncode('t s') ...
    const signature = 'a%26b%21%20c&t%20s';
    // ... and the whole signature encoded again as the header value.
    expect(p.oauth_signature).toBe(percentEncode(signature));
    expect(p.oauth_signature).toBe('a%2526b%2521%2520c%26t%2520s');
    expect(decodeURIComponent(p.oauth_signature)).toBe(signature);
  });

  it('percent-encodes oauth_callback', () => {
    const p = params(
      buildOAuthHeader({
        consumerKey: 'ck',
        consumerSecret: 'cs',
        callback: 'http://127.0.0.1:3001/api/discogs/callback',
        ...FIXED,
      }),
    );
    expect(p.oauth_callback).toBe(
      'http%3A%2F%2F127.0.0.1%3A3001%2Fapi%2Fdiscogs%2Fcallback',
    );
  });

  it('adds oauth_token and oauth_verifier only when given', () => {
    const bare = params(
      buildOAuthHeader({ consumerKey: 'ck', consumerSecret: 'cs', ...FIXED }),
    );
    expect(bare).not.toHaveProperty('oauth_token');
    expect(bare).not.toHaveProperty('oauth_verifier');
    expect(bare).not.toHaveProperty('oauth_callback');

    const withToken = params(
      buildOAuthHeader({
        consumerKey: 'ck',
        consumerSecret: 'cs',
        token: 'tok',
        ...FIXED,
      }),
    );
    expect(withToken.oauth_token).toBe('tok');
    expect(withToken).not.toHaveProperty('oauth_verifier');

    const empty = params(
      buildOAuthHeader({
        consumerKey: 'ck',
        consumerSecret: 'cs',
        token: '',
        verifier: '',
        ...FIXED,
      }),
    );
    expect(empty).not.toHaveProperty('oauth_token');
    expect(empty).not.toHaveProperty('oauth_verifier');
  });

  it('uses a fresh nonce and the current time when none is given', () => {
    const a = params(
      buildOAuthHeader({ consumerKey: 'k', consumerSecret: 's' }),
    );
    const b = params(
      buildOAuthHeader({ consumerKey: 'k', consumerSecret: 's' }),
    );
    expect(a.oauth_nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(a.oauth_nonce).not.toBe(b.oauth_nonce);
    const ts = Number(a.oauth_timestamp);
    expect(Math.abs(ts - Date.now() / 1000)).toBeLessThan(5);
  });
});

describe('parseFormBody', () => {
  it('decodes a form body into a record', () => {
    expect(parseFormBody('oauth_token=a%20b&x=1')).toEqual({
      oauth_token: 'a b',
      x: '1',
    });
  });

  it('decodes + as a space and returns {} for an empty body', () => {
    expect(parseFormBody('a=b+c')).toEqual({ a: 'b c' });
    expect(parseFormBody('')).toEqual({});
  });
});
