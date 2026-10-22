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
//
// Data API (Plan 03-03, RESEARCH "Search" and "Release"):
//   GET  /database/search  signed with a live access token only (401
//        otherwise). Deterministic default scenario, matched on the query:
//          catno TR-200 (normalized: upper case, letters and digits) -> two
//            results in the order { id 1002, catno 'TR-200 X' } then
//            { id 1001, catno 'TR200' }, so the exact-catno pin must
//            reorder them;
//          catno TR-201 -> one result (id 1011);
//          artist 'Juniper Vale' with any release_title -> three results
//            (ids 1031, 1032, 1033);
//          q containing 'Static Bloom' -> one result (id 1041);
//          anything else -> 200 { pagination: { items: 0 }, results: [] }.
//        Every result carries title 'Artist - Title', year as a string,
//        country, a label array (with a repeat), catno, formats, master_id
//        and thumb = this server's base URL + /img/{id}.jpeg.
//   GET  /releases/{id}  a release shaped like the real one for ids up to
//        899999999; 404 { message: 'That release does not exist or may have
//        been deleted.' } otherwise.
//   GET  /img/{name}.jpeg  a small JPEG rendered once with sharp at startup.
//        No rate-limit headers; never counted against the limit.
// Collection (Plan 04-01, RESEARCH "Discogs API Facts"): an in-memory
// collection, Map releaseId -> [{ instance_id, folder_id, date_added }],
// with instance ids issued from 5001. Signed with a live access token only
// (401 otherwise; revoked answers 401 too); a path naming another username
// answers 403.
//   GET  /users/{u}/collection/folders  { folders: [ { id 0, name 'All',
//        count: every copy }, { id 1, name 'Uncategorized', count }, ...the
//        folders set through /__control ] }, each with a resource_url.
//   GET  /users/{u}/collection/releases/{id}  200 { pagination: { page 1,
//        pages 1, per_page 50, items, urls {} }, releases } by ascending
//        instance id; an empty list when the release is not owned or does
//        not exist (like the live probe); id 0 answers a FastAPI-style 422
//        { detail: [...], message }.
//   POST /users/{u}/collection/folders/{f}/releases/{id}  folder 0 answers
//        422, ids above 899999999 answer 404; otherwise it records a new
//        copy (date_added at second resolution with a -07:00 offset) and
//        answers 201 { instance_id, resource_url }. Every add POST counts
//        in the state's posts.
// Every API answer except an injected 429 carries X-Discogs-Ratelimit
// (FAKE_DISCOGS_LIMIT, default 600 so tests run fast), -Remaining and -Used
// over a moving 60 s window.
//
// Test control (not part of Discogs):
//   POST /__control  JSON { authorize?, accessSignature?, revoked?, reset?,
//        at429?, retryAfter?, at5xx?, limit? } changes modes at runtime;
//        revoked: true makes every request signed with an access token
//        answer 401 JSON. at429: N answers the N-th API request from now
//        (1 = the next; /img and /__control never count) with 429, an
//        empty body and no rate-limit headers, carrying Retry-After when
//        retryAfter (seconds) is a number; at5xx: N does the same with
//        a 502. limit changes X-Discogs-Ratelimit. collection: { [releaseId]:
//        instances[] } seeds (or, with [], resets) those releases' copies;
//        a seeded copy without instance_id gets the next one, folder_id
//        defaults to 1 and date_added to now. folders: [{ id, name }] sets
//        the extra folders listed after 0 and 1. Answers the current state,
//        which also carries collection ({ [releaseId]: instances[] }) and
//        posts (the number of add POSTs answered 201).
// Log lines keep the request path, username included: the fake may see it;
// the app's own error text may not.
//   GET  /__control  the current state, including the last oauth_callback
//        received (a URL, not a secret).
// Issued values carry fixed prefixes (fake-rt-, fake-rts-, fake-verifier-,
// fake-at-, fake-ats-) so tests can scan responses for leaks.
//
// When FAKE_DISCOGS_LOG is set, one JSON line per API or web request is
// appended to that file: method, path, query keys and values (the search
// stage's catno, artist, release_title, q, type, format, per_page, page),
// User-Agent, the oauth parameter names present, oauth_signature_method and
// the answered status. Image requests are logged with surface 'img'. No
// secret value (consumer secret, token secrets, signature, verifier) is
// logged.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import sharp from 'sharp';

const CONSUMER_KEY =
  process.env.FAKE_DISCOGS_CONSUMER_KEY || 'fake-consumer-key';
const CONSUMER_SECRET =
  process.env.FAKE_DISCOGS_CONSUMER_SECRET || 'fake-consumer-secret';
const USERNAME = process.env.FAKE_DISCOGS_USERNAME || 'fake-owner';
const DEFAULT_LIMIT = Number(process.env.FAKE_DISCOGS_LIMIT) || 600;
const LOG = process.env.FAKE_DISCOGS_LOG || '';

const initialModes = () => ({
  authorize: process.env.FAKE_DISCOGS_AUTHORIZE || 'ok',
  accessSignature: process.env.FAKE_DISCOGS_ACCESS_SIGNATURE || 'standard',
  revoked: false,
  /** API requests left before a 429 (1 = the next one), or null. */
  at429: null,
  /** Retry-After seconds sent with the injected 429, or null for none. */
  retryAfter: null,
  /** API requests left before a 502, or null. */
  at5xx: null,
  limit: DEFAULT_LIMIT,
});

/** The thumbnail every /img/*.jpeg answers with. */
const THUMB = await sharp({
  create: { width: 150, height: 150, channels: 3, background: '#3a6ea5' },
})
  .jpeg({ quality: 80 })
  .toBuffer();

let modes = initialModes();
let lastCallback = null;
/** request token -> { secret, callback, verifier } */
const requestTokens = new Map();
/** access token -> secret */
const accessTokens = new Map();
/** timestamps of API requests in the last 60 s */
let hits = [];
/** releaseId -> [{ instance_id, folder_id, date_added }] */
const collection = new Map();
let nextInstance = 5001;
/** Add POSTs answered 201. */
let posts = 0;
/** Folders listed after 0 and 1: [{ id, name }]. */
let extraFolders = [];

/** ISO 8601 at second resolution with a -07:00 offset, like Discogs. */
function dateAdded(ms = Date.now()) {
  const shifted = new Date(ms - 7 * 3_600_000).toISOString();
  return `${shifted.slice(0, 19)}-07:00`;
}

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

function log(req, url, surface, oauth, status, t = Date.now()) {
  if (!LOG || surface === 'control') return;
  const query = {};
  for (const [k, v] of url.searchParams) {
    // The verifier is a secret; the request token is in the URL anyway.
    query[k] = k === 'oauth_verifier' ? '[present]' : v;
  }
  const entry = {
    t,
    surface,
    method: req.method,
    path: url.pathname,
    query,
    userAgent: req.headers['user-agent'] ?? null,
    accept: req.headers.accept ?? null,
    oauthParams: oauth ? Object.keys(oauth).sort() : [],
    signatureMethod: oauth?.oauth_signature_method ?? null,
    status: status ?? null,
  };
  fs.appendFileSync(LOG, `${JSON.stringify(entry)}\n`);
}

function rateHeaders() {
  const now = Date.now();
  hits = hits.filter((t) => now - t < 60_000);
  hits.push(now);
  const used = hits.length;
  return {
    'x-discogs-ratelimit': String(modes.limit),
    'x-discogs-ratelimit-used': String(used),
    'x-discogs-ratelimit-remaining': String(Math.max(0, modes.limit - used)),
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
  return {
    ...modes,
    lastCallback,
    pendingRequestTokens: requestTokens.size,
    collection: Object.fromEntries(
      [...collection].map(([id, list]) => [String(id), list]),
    ),
    posts,
  };
}

function seedCollection(patch) {
  for (const [key, list] of Object.entries(patch ?? {})) {
    const releaseId = Number(key);
    if (!Number.isInteger(releaseId) || releaseId < 1) continue;
    if (!Array.isArray(list) || list.length === 0) {
      collection.delete(releaseId);
      continue;
    }
    collection.set(
      releaseId,
      list
        .map((i) => ({
          instance_id: Number.isInteger(i?.instance_id)
            ? i.instance_id
            : nextInstance++,
          folder_id: Number.isInteger(i?.folder_id) ? i.folder_id : 1,
          date_added:
            typeof i?.date_added === 'string' ? i.date_added : dateAdded(),
        }))
        .sort((a, b) => a.instance_id - b.instance_id),
    );
  }
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
    const count = (v) => (Number.isInteger(v) && v > 0 ? v : null);
    if ('at429' in patch) modes.at429 = count(patch.at429);
    if ('at5xx' in patch) modes.at5xx = count(patch.at5xx);
    if ('retryAfter' in patch) {
      modes.retryAfter =
        typeof patch.retryAfter === 'number' && patch.retryAfter >= 0
          ? patch.retryAfter
          : null;
    }
    if (Number.isInteger(patch.limit) && patch.limit > 0) {
      modes.limit = patch.limit;
    }
    if (patch.collection && typeof patch.collection === 'object') {
      seedCollection(patch.collection);
    }
    if (Array.isArray(patch.folders)) {
      extraFolders = patch.folders
        .filter((f) => Number.isInteger(f?.id) && f.id > 1)
        .map((f) => ({ id: f.id, name: String(f.name ?? `Folder ${f.id}`) }));
    }
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

/** Discogs' fuzzy catno match, approximated: upper case, letters and digits. */
const normCatno = (s) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const SEARCH_FIXTURES = [
  {
    match: (p) => normCatno(p.get('catno')) === 'TR200',
    results: [
      {
        id: 1002,
        artist: 'Nova Lane',
        title: 'Blue Hour (Deluxe)',
        catno: 'TR-200 X',
      },
      { id: 1001, artist: 'Nova Lane', title: 'Blue Hour', catno: 'TR200' },
    ],
  },
  {
    match: (p) => normCatno(p.get('catno')) === 'TR201',
    results: [
      {
        id: 1011,
        artist: 'Echo Harbor',
        title: 'Glass Rivers',
        catno: 'TR-201',
      },
    ],
  },
  {
    match: (p) => (p.get('artist') ?? '').toLowerCase() === 'juniper vale',
    results: [
      { id: 1031, artist: 'Juniper Vale', title: 'Low Orbit', catno: 'JV-1' },
      {
        id: 1032,
        artist: 'Juniper Vale',
        title: 'Low Orbit (Remastered)',
        catno: 'JV-2',
      },
      {
        id: 1033,
        artist: 'Juniper Vale',
        title: 'Low Orbit Live',
        catno: 'JV-3',
      },
    ],
  },
  {
    match: (p) => (p.get('q') ?? '').includes('Static Bloom'),
    results: [
      {
        id: 1041,
        artist: 'Static Bloom',
        title: 'Paper Moons',
        catno: 'SB-41',
      },
    ],
  },
];

function searchResult(base, r) {
  return {
    id: r.id,
    type: 'release',
    title: `${r.artist} - ${r.title}`,
    year: '1999',
    country: 'UK',
    label: ['Fake Label', 'Fake Label', 'Other Imprint'],
    catno: r.catno,
    format: ['CD', 'Album'],
    formats: [{ name: 'CD', qty: '1', descriptions: ['Album'] }],
    master_id: r.id + 50_000,
    master_url: `https://api.discogs.com/masters/${r.id + 50_000}`,
    uri: `/release/${r.id}-${r.artist.replace(/\W+/g, '-')}`,
    resource_url: `https://api.discogs.com/releases/${r.id}`,
    thumb: `${base}/img/${r.id}.jpeg`,
    cover_image: `${base}/img/${r.id}.jpeg`,
  };
}

function handleSearch(res, url, oauth, rate, base) {
  if (!accessOk(oauth)) {
    unauthorized(res, rate);
    return 401;
  }
  const fixture = SEARCH_FIXTURES.find((f) => f.match(url.searchParams));
  const results = (fixture?.results ?? []).map((r) => searchResult(base, r));
  sendJson(res, 200, rate, {
    pagination: {
      page: 1,
      pages: results.length > 0 ? 1 : 0,
      per_page: Number(url.searchParams.get('per_page')) || 50,
      items: results.length,
      urls: {},
    },
    results,
  });
  return 200;
}

function handleRelease(res, idText, rate, base) {
  const id = Number(idText);
  if (!/^\d+$/.test(idText) || id < 1 || id > 899_999_999) {
    sendJson(res, 404, rate, {
      message: 'That release does not exist or may have been deleted.',
    });
    return 404;
  }
  sendJson(res, 200, rate, {
    id,
    title: `Release ${id}`,
    artists: [
      { name: 'Fake Artist', anv: '', join: '&' },
      { name: 'Guest (2)', anv: '', join: '' },
    ],
    artists_sort: 'Fake Artist & Guest (2)',
    year: 2001,
    country: 'Germany',
    labels: [
      { name: 'Fake Label', catno: `FK-${id}`, entity_type_name: 'Label' },
      { name: 'Fake Label', catno: `FK-${id}`, entity_type_name: 'Label' },
    ],
    formats: [{ name: 'CD', qty: '1', descriptions: ['Album'] }],
    master_id: 0,
    thumb: `${base}/img/r${id}.jpeg`,
    images: [{ type: 'primary', uri150: `${base}/img/r${id}-150.jpeg` }],
    uri: `https://www.discogs.com/release/${id}-Fake-Artist-Release-${id}`,
    resource_url: `https://api.discogs.com/releases/${id}`,
    status: 'Accepted',
  });
  return 200;
}

function folderCount(folderId) {
  let n = 0;
  for (const list of collection.values()) {
    for (const i of list) if (folderId === 0 || i.folder_id === folderId) n++;
  }
  return n;
}

function handleFolders(res, user, rate) {
  const folders = [
    { id: 0, name: 'All' },
    { id: 1, name: 'Uncategorized' },
    ...extraFolders,
  ].map((f) => ({
    id: f.id,
    name: f.name,
    count: folderCount(f.id),
    resource_url: `https://api.discogs.com/users/${user}/collection/folders/${f.id}`,
  }));
  sendJson(res, 200, rate, { folders });
  return 200;
}

function handleCollectionRelease(res, idText, rate) {
  const id = Number(idText);
  if (!/^\d+$/.test(idText) || id < 1) {
    sendJson(res, 422, rate, {
      detail: [
        {
          type: 'greater_than_equal',
          loc: ['path', 'release_id'],
          msg: 'Input should be greater than or equal to 1',
          input: idText,
        },
      ],
      message: 'See "detail" for validation errors.',
    });
    return 422;
  }
  const releases = (collection.get(id) ?? []).map((i) => ({
    id,
    instance_id: i.instance_id,
    folder_id: i.folder_id,
    date_added: i.date_added,
    rating: 0,
    basic_information: { id, title: `Release ${id}` },
  }));
  sendJson(res, 200, rate, {
    pagination: {
      page: 1,
      pages: 1,
      per_page: 50,
      items: releases.length,
      urls: {},
    },
    releases,
  });
  return 200;
}

async function handleAdd(req, res, user, folderText, idText, rate) {
  await readBody(req);
  const folderId = Number(folderText);
  const id = Number(idText);
  if (folderId === 0) {
    sendJson(res, 422, rate, {
      detail: [
        {
          type: 'greater_than_equal',
          loc: ['path', 'folder_id'],
          msg: 'Input should be greater than or equal to 1',
          input: folderText,
        },
      ],
      message: 'See "detail" for validation errors.',
    });
    return 422;
  }
  if (id < 1 || id > 899_999_999) {
    sendJson(res, 404, rate, {
      message: 'That release does not exist or may have been deleted.',
    });
    return 404;
  }
  const instance = {
    instance_id: nextInstance++,
    folder_id: folderId,
    date_added: dateAdded(),
  };
  collection.set(id, [...(collection.get(id) ?? []), instance]);
  posts += 1;
  sendJson(res, 201, rate, {
    instance_id: instance.instance_id,
    resource_url: `https://api.discogs.com/users/${user}/collection/folders/${folderId}/release/${id}/instance/${instance.instance_id}`,
  });
  return 201;
}

/** Answers a /users/{u}/collection/... request; null when none matches. */
async function answerCollection(req, res, url, oauth, rate) {
  const m =
    /^\/users\/([^/]+)\/collection\/(folders|releases\/([^/]+)|folders\/(\d+)\/releases\/(\d+))$/.exec(
      url.pathname,
    );
  if (!m) return null;
  const isAdd = m[4] !== undefined;
  const isFolders = m[2] === 'folders';
  if (isAdd ? req.method !== 'POST' : req.method !== 'GET') {
    sendJson(res, 405, rate, { message: 'Method not allowed.' });
    return 405;
  }
  if (!accessOk(oauth)) {
    unauthorized(res, rate);
    return 401;
  }
  let user;
  try {
    user = decodeURIComponent(m[1]);
  } catch {
    user = null;
  }
  if (user !== USERNAME) {
    sendJson(res, 403, rate, {
      message: "You don't have permission to access this resource.",
    });
    return 403;
  }
  if (isFolders) return handleFolders(res, USERNAME, rate);
  if (isAdd) return handleAdd(req, res, USERNAME, m[4], m[5], rate);
  return handleCollectionRelease(res, m[3], rate);
}

/** Counts an injected failure down; true when this request is the one. */
function injected(key) {
  if (modes[key] === null) return false;
  modes[key] -= 1;
  if (modes[key] > 0) return false;
  modes[key] = null;
  return true;
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
    if (url.pathname.startsWith('/img/')) {
      log(req, url, 'img', null, 200);
      if (req.method !== 'GET' || !/^\/img\/[\w-]+\.jpeg$/.test(url.pathname)) {
        send(res, 404, { 'content-type': 'text/plain' }, 'not found');
        return;
      }
      send(res, 200, { 'content-type': 'image/jpeg' }, THUMB);
      return;
    }
    // t is the arrival time, so the log measures request spacing.
    const t = Date.now();
    const rate = rateHeaders();
    const status = await answerApi(req, res, url, oauth, rate);
    log(req, url, 'api', oauth, status, t);
  } catch (err) {
    send(
      res,
      500,
      { 'content-type': 'application/json' },
      JSON.stringify({ message: String(err?.message ?? err) }),
    );
  }
});

/** Answers one API request; returns the status sent. */
async function answerApi(req, res, url, oauth, rate) {
  // Only API requests reach here (never /img or /__control), so at429
  // counts API requests only. Like the live probe, the 429 has an empty
  // body and, unless retryAfter is set, no Retry-After. It also carries no
  // rate-limit headers, so the gate's pacing must survive their absence.
  if (injected('at429')) {
    const headers = { 'content-type': 'application/json' };
    if (modes.retryAfter !== null) {
      headers['retry-after'] = String(modes.retryAfter);
    }
    send(res, 429, headers, '');
    return 429;
  }
  if (injected('at5xx')) {
    sendJson(res, 502, rate, { message: 'Bad gateway.' });
    return 502;
  }
  // Revoked access: every request signed with an access token is refused.
  if (
    modes.revoked &&
    oauth?.oauth_token &&
    accessTokens.has(oauth.oauth_token)
  ) {
    unauthorized(res, rate);
    return 401;
  }
  const base = `http://${req.headers.host ?? '127.0.0.1'}`;
  const release = /^\/releases\/([^/]+)$/.exec(url.pathname);
  if (release && req.method === 'GET') {
    return handleRelease(res, release[1], rate, base);
  }
  const collectionStatus = await answerCollection(req, res, url, oauth, rate);
  if (collectionStatus !== null) return collectionStatus;
  switch (url.pathname) {
    case '/oauth/request_token':
      handleRequestToken(res, oauth, rate);
      return res.statusCode;
    case '/oauth/access_token':
      handleAccessToken(req, res, oauth, rate);
      return res.statusCode;
    case '/oauth/identity':
      handleIdentity(res, oauth, rate);
      return res.statusCode;
    case '/database/search':
      return handleSearch(res, url, oauth, rate, base);
    default:
      sendJson(res, 404, rate, {
        message: 'The requested resource was not found.',
      });
      return 404;
  }
}

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
