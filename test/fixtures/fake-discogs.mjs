#!/usr/bin/env node
// Stand-in for api.discogs.com and the discogs.com authorize page, used by
// scripts/verify-discogs.ts. A node:http server on 127.0.0.1; it never
// contacts the network. The port comes from argv[2] or FAKE_DISCOGS_PORT
// (0 picks a free one); it prints "fake-discogs listening {port}" when ready.
//
// OAuth 1.0a PLAINTEXT surface (RESEARCH "OAuth endpoints"):
//   GET  /oauth/request_token  needs consumer key FAKE_DISCOGS_CONSUMER_KEY,
//        signature percentEncode(FAKE_DISCOGS_CONSUMER_SECRET)& and an
//        oauth_callback. A wrong key answers 401, form content type, body
//        "Invalid consumer." (the real plain-text shape).
//   GET  /oauth/authorize?oauth_token=  the browser page. Mode
//        FAKE_DISCOGS_AUTHORIZE: ok (default) 302s to the callback with
//        oauth_token and oauth_verifier; deny 302s with denied= and no
//        verifier; code answers an HTML page showing the verifier.
//   POST /oauth/access_token  checks the verifier and the signature
//        consumer_secret&request_token_secret; FAKE_DISCOGS_ACCESS_SIGNATURE
//        =docs expects consumer_secret& instead and refuses the other form.
//   GET  /oauth/identity  { id, username: FAKE_DISCOGS_USERNAME or
//        'fake-owner', resource_url }.
// Every API answer carries X-Discogs-Ratelimit (FAKE_DISCOGS_LIMIT, default
// 600 so tests run fast), -Remaining and -Used over a moving 60 s window.
//
// Test control (not part of Discogs):
//   POST /__control  JSON { authorize?, accessSignature?, revoked?, reset? }
//        changes modes at runtime; revoked: true makes every request signed
//        with an access token answer 401 JSON. Answers the current state.
//   GET  /__control  the current state, including the last oauth_callback
//        received (a URL, not a secret).
// Issued values carry fixed prefixes (fake-rt-, fake-rts-, fake-verifier-,
// fake-at-, fake-ats-) so tests can scan responses for leaks.
//
// When FAKE_DISCOGS_LOG is set, one JSON line per API or web request is
// appended to that file: method, path, query keys and values, User-Agent,
// the oauth parameter names present and oauth_signature_method. No secret
// value (consumer secret, token secrets, signature, verifier) is logged.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';

const CONSUMER_KEY =
  process.env.FAKE_DISCOGS_CONSUMER_KEY || 'fake-consumer-key';
const CONSUMER_SECRET =
  process.env.FAKE_DISCOGS_CONSUMER_SECRET || 'fake-consumer-secret';
const USERNAME = process.env.FAKE_DISCOGS_USERNAME || 'fake-owner';
const LIMIT = Number(process.env.FAKE_DISCOGS_LIMIT) || 600;
const LOG = process.env.FAKE_DISCOGS_LOG || '';

const initialModes = () => ({
  authorize: process.env.FAKE_DISCOGS_AUTHORIZE || 'ok',
  accessSignature: process.env.FAKE_DISCOGS_ACCESS_SIGNATURE || 'standard',
  revoked: false,
});

let modes = initialModes();
let lastCallback = null;
/** request token -> { secret, callback, verifier } */
const requestTokens = new Map();
/** access token -> secret */
const accessTokens = new Map();
/** timestamps of API requests in the last 60 s */
let hits = [];

const enc = (s) =>
  encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

const rand = (prefix) => `${prefix}${crypto.randomBytes(12).toString('hex')}`;

/** Authorization: OAuth k="v", ... -> { k: decoded v } or null. */
function parseOAuth(header) {
  if (!header?.startsWith('OAuth ')) return null;
  const out = {};
  const re = /([a-z_]+)="([^"]*)"/g;
  for (const m of header.slice(6).matchAll(re)) {
    try {
      out[m[1]] = decodeURIComponent(m[2]);
    } catch {
      return null;
    }
  }
  return out;
}

function log(req, url, surface, oauth) {
  if (!LOG || surface === 'control') return;
  const query = {};
  for (const [k, v] of url.searchParams) {
    // The verifier is a secret; the request token is in the URL anyway.
    query[k] = k === 'oauth_verifier' ? '[present]' : v;
  }
  const entry = {
    t: Date.now(),
    surface,
    method: req.method,
    path: url.pathname,
    query,
    userAgent: req.headers['user-agent'] ?? null,
    accept: req.headers.accept ?? null,
    oauthParams: oauth ? Object.keys(oauth).sort() : [],
    signatureMethod: oauth?.oauth_signature_method ?? null,
  };
  fs.appendFileSync(LOG, `${JSON.stringify(entry)}\n`);
}

function rateHeaders() {
  const now = Date.now();
  hits = hits.filter((t) => now - t < 60_000);
  hits.push(now);
  const used = hits.length;
  return {
    'x-discogs-ratelimit': String(LIMIT),
    'x-discogs-ratelimit-used': String(used),
    'x-discogs-ratelimit-remaining': String(Math.max(0, LIMIT - used)),
  };
}

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendForm(res, status, rate, body) {
  send(
    res,
    status,
    { ...rate, 'content-type': 'application/x-www-form-urlencoded' },
    body,
  );
}

function sendJson(res, status, rate, value) {
  send(
    res,
    status,
    { ...rate, 'content-type': 'application/json' },
    JSON.stringify(value),
  );
}

const unauthorized = (res, rate) =>
  sendJson(res, 401, rate, {
    message: 'You must authenticate to access this resource.',
  });

/** The consumer part of a PLAINTEXT check: key, method and secret. */
function consumerOk(oauth, tokenSecret) {
  return (
    oauth &&
    oauth.oauth_consumer_key === CONSUMER_KEY &&
    oauth.oauth_signature_method === 'PLAINTEXT' &&
    oauth.oauth_signature === `${enc(CONSUMER_SECRET)}&${enc(tokenSecret)}`
  );
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => {
      body += c;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function controlState() {
  return { ...modes, lastCallback, pendingRequestTokens: requestTokens.size };
}

async function handleControl(req, res) {
  if (req.method === 'POST') {
    let patch;
    try {
      patch = JSON.parse((await readBody(req)) || '{}');
    } catch {
      sendJson(res, 400, {}, { error: 'bad json' });
      return;
    }
    if (patch.reset) modes = initialModes();
    if (typeof patch.authorize === 'string') modes.authorize = patch.authorize;
    if (typeof patch.accessSignature === 'string') {
      modes.accessSignature = patch.accessSignature;
    }
    if (typeof patch.revoked === 'boolean') modes.revoked = patch.revoked;
  }
  sendJson(res, 200, {}, controlState());
}

function handleRequestToken(res, oauth, rate) {
  if (!oauth || oauth.oauth_consumer_key !== CONSUMER_KEY) {
    sendForm(res, 401, rate, 'Invalid consumer.');
    return;
  }
  if (!consumerOk(oauth, '') || !oauth.oauth_callback) {
    sendForm(res, 401, rate, 'Invalid signature.');
    return;
  }
  const token = rand('fake-rt-');
  const secret = rand('fake-rts-');
  requestTokens.set(token, {
    secret,
    callback: oauth.oauth_callback,
    verifier: rand('fake-verifier-'),
  });
  lastCallback = oauth.oauth_callback;
  sendForm(
    res,
    200,
    rate,
    `oauth_token=${enc(token)}&oauth_token_secret=${enc(secret)}&oauth_callback_confirmed=true`,
  );
}

function handleAuthorize(res, url) {
  const token = url.searchParams.get('oauth_token') ?? '';
  const entry = requestTokens.get(token);
  if (!entry) {
    send(res, 404, { 'content-type': 'text/html' }, '<p>Unknown token</p>');
    return;
  }
  if (modes.authorize === 'code') {
    send(
      res,
      200,
      { 'content-type': 'text/html; charset=utf-8' },
      `<!doctype html><title>Authorize</title><p>Your verification code is <code id="verifier">${entry.verifier}</code></p>`,
    );
    return;
  }
  const target = new URL(entry.callback);
  if (modes.authorize === 'deny') {
    target.searchParams.set('denied', token);
  } else {
    target.searchParams.set('oauth_token', token);
    target.searchParams.set('oauth_verifier', entry.verifier);
  }
  send(res, 302, { location: target.toString() }, '');
}

function handleAccessToken(req, res, oauth, rate) {
  if (req.method !== 'POST') {
    sendJson(res, 405, rate, { message: 'Method not allowed.' });
    return;
  }
  if (!oauth || oauth.oauth_consumer_key !== CONSUMER_KEY) {
    sendForm(res, 401, rate, 'Invalid consumer.');
    return;
  }
  const entry = requestTokens.get(oauth.oauth_token ?? '');
  if (!entry || oauth.oauth_verifier !== entry.verifier) {
    sendForm(res, 401, rate, 'Invalid verifier.');
    return;
  }
  const expected = modes.accessSignature === 'docs' ? '' : entry.secret;
  if (!consumerOk(oauth, expected)) {
    sendForm(res, 401, rate, 'Invalid signature.');
    return;
  }
  requestTokens.delete(oauth.oauth_token);
  const token = rand('fake-at-');
  const secret = rand('fake-ats-');
  accessTokens.set(token, secret);
  sendForm(
    res,
    200,
    rate,
    `oauth_token=${enc(token)}&oauth_token_secret=${enc(secret)}`,
  );
}

/** True when the request is signed with a live access token. */
function accessOk(oauth) {
  if (!oauth?.oauth_token || modes.revoked) return false;
  const secret = accessTokens.get(oauth.oauth_token);
  return secret !== undefined && consumerOk(oauth, secret);
}

function handleIdentity(res, oauth, rate) {
  if (!accessOk(oauth)) {
    unauthorized(res, rate);
    return;
  }
  sendJson(res, 200, rate, {
    id: 4242,
    username: USERNAME,
    resource_url: `https://api.discogs.com/users/${USERNAME}`,
    consumer_name: 'Fake Discogs App',
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/__control') {
      await handleControl(req, res);
      return;
    }
    const oauth = parseOAuth(req.headers.authorization);
    if (url.pathname === '/oauth/authorize') {
      log(req, url, 'web', null);
      handleAuthorize(res, url);
      return;
    }
    log(req, url, 'api', oauth);
    const rate = rateHeaders();
    // Revoked access: every request signed with an access token is refused.
    if (
      modes.revoked &&
      oauth?.oauth_token &&
      accessTokens.has(oauth.oauth_token)
    ) {
      unauthorized(res, rate);
      return;
    }
    switch (url.pathname) {
      case '/oauth/request_token':
        handleRequestToken(res, oauth, rate);
        return;
      case '/oauth/access_token':
        handleAccessToken(req, res, oauth, rate);
        return;
      case '/oauth/identity':
        handleIdentity(res, oauth, rate);
        return;
      default:
        sendJson(res, 404, rate, {
          message: 'The requested resource was not found.',
        });
    }
  } catch (err) {
    send(
      res,
      500,
      { 'content-type': 'application/json' },
      JSON.stringify({ message: String(err?.message ?? err) }),
    );
  }
});

const port = Number(process.argv[2] ?? process.env.FAKE_DISCOGS_PORT ?? 0);
server.listen(port, '127.0.0.1', () => {
  const addr = server.address();
  console.log(
    `fake-discogs listening ${typeof addr === 'object' ? addr.port : port}`,
  );
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close();
    process.exit(0);
  });
}
