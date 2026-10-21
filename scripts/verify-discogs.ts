// Discogs connect proof against test/fixtures/fake-discogs.mjs (never the
// live API, never the owner's secrets.json). Plan 03-01: (b) a connect
// started through the app ends at /settings?discogs=connected with a
// callback on this server's own port, (c) the tokens land in the temp
// secrets file with mode 0600, (d) every API request carries the project
// User-Agent and every OAuth call is PLAINTEXT, (e) a denied approval ends
// at denied, (f) a made-up or replayed oauth_token ends at expired, (h) the
// docs-form access-token signature still connects after one retry, and an
// identity failure ends at error. Nothing but connected stores a token.
// Plan 03-02: (a) the Settings card shows Connect Discogs before and
// "Connected as fake-owner" after (b), and (j0) Test connection signs one
// /oauth/identity with the stored sign-in, and (j1) a rejected test shows
// Reconnect on Settings and Disconnect forgets the sign-in. Step letters are stable across
// plans. Plan 03-04: (g) a connect that ends on a code page is finished by
// pasting the code (a wrong code first answers rejected), and (l) Settings
// shows the "Code from Discogs" field only while that connect is pending,
// (j) no on-screen Settings text uses a technical word in the not
// connected, connected and reconnect-needed states (and on each ?discogs=
// result), and (k) Settings shows this server's own callback URL.
// Run: node scripts/verify-discogs.ts   (VERIFY_SKIP_BUILD=1 reuses the build)
// It builds and starts from NEXT_DIST_DIR, default .next/verify, so a
// long-running `next start` on the default .next keeps working meanwhile.
import fs from 'node:fs';
import path from 'node:path';
import {
  CANARY_CONSUMER_SECRET,
  type ConnectTrace,
  connectTrace,
  discogsEnv,
  FAKE_SECRET_PREFIXES,
  type FakeDiscogs,
  type FakeLogEntry,
  PROJECT_USER_AGENT,
  startFakeDiscogs,
  tempSecretsFile,
} from './lib/discogs.ts';
import { assert, check, step } from './lib/jobs.ts';
import {
  buildApp,
  getFreePort,
  makeTempDir,
  runMain,
  type ServerHandle,
  startServer,
} from './lib/server.ts';

/** Build output dir (next.config.ts accepts .next or .next/<name>). */
export const DIST_DIR = process.env.NEXT_DIST_DIR || '.next/verify';

export type Ctx = {
  port: number;
  tmp: string;
  dataDir: string;
  baseUrl: string;
  origin: string;
  fake: FakeDiscogs;
  secretsFile: string;
};

const TOKEN_KEYS = [
  'discogsOAuthToken',
  'discogsOAuthTokenSecret',
  'discogsUsername',
];

export function settingsPrefix(ctx: Ctx): string {
  return `${ctx.origin}/settings?discogs=`;
}

/** Every redirect the callback gives must be one of the four fixed targets. */
export function assertSettingsLocation(
  ctx: Ctx,
  location: string,
  expected: 'connected' | 'denied' | 'expired' | 'error',
): void {
  assert(
    location === `${settingsPrefix(ctx)}${expected}`,
    `callback Location is ${location}, expected ${settingsPrefix(ctx)}${expected}`,
  );
}

/** No consumer secret or fake-issued secret in a response the app produced. */
export function assertNoLeak(label: string, text: string): void {
  for (const needle of [CANARY_CONSUMER_SECRET, ...FAKE_SECRET_PREFIXES]) {
    assert(!text.includes(needle), `${label} contains "${needle}"`);
  }
}

export function readSecrets(ctx: Ctx): Record<string, string> {
  if (!fs.existsSync(ctx.secretsFile)) return {};
  return JSON.parse(fs.readFileSync(ctx.secretsFile, 'utf8')) as Record<
    string,
    string
  >;
}

export function fakeLog(ctx: Ctx): FakeLogEntry[] {
  if (!fs.existsSync(ctx.fake.logFile)) return [];
  return fs
    .readFileSync(ctx.fake.logFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as FakeLogEntry);
}

/** Removes the saved connection so a step starts disconnected. */
export function clearConnection(ctx: Ctx): void {
  const current = readSecrets(ctx);
  for (const k of TOKEN_KEYS) delete current[k];
  fs.writeFileSync(ctx.secretsFile, `${JSON.stringify(current, null, 2)}\n`, {
    mode: 0o600,
  });
}

export async function stepStart(
  tmp: string,
  dataDir: string,
  port: number,
  fake: FakeDiscogs,
): Promise<ServerHandle> {
  step(`next start on 127.0.0.1:${port} against the fake Discogs`);
  fs.mkdirSync(path.dirname(tempSecretsFile(tmp)), { recursive: true });
  return startServer({
    mode: 'start',
    port,
    env: {
      NEXT_DIST_DIR: DIST_DIR,
      DATA_DIR: dataDir,
      APP_TEST_HOOKS: '',
      // No Claude CLI at all: nothing here may reach vision.
      CLAUDE_BIN: '/nonexistent/dai-claude-cli',
      ...discogsEnv(fake, tmp),
    },
  });
}

/** GET /settings as text: tags and React's text-node comments removed. */
export async function settingsText(ctx: Ctx): Promise<string> {
  const res = await fetch(`${ctx.baseUrl}/settings`);
  const html = await res.text();
  assert(res.status === 200, `GET /settings answered ${res.status}`);
  assertNoLeak('GET /settings', html);
  return html.replace(/<[^>]*>/g, '');
}

// (a) The Settings "Discogs" card: Connect before, "Connected as" after.
export async function stepSettingsBefore(ctx: Ctx): Promise<void> {
  step('(a) Settings shows Connect Discogs before connecting');
  const text = await settingsText(ctx);
  assert(text.includes('Connect Discogs'), 'Settings has no Connect Discogs');
  assert(
    !text.includes('Connected as'),
    'Settings says Connected as before any connect',
  );
  check('Connect Discogs on /settings, not connected');
}

export async function stepSettingsAfter(ctx: Ctx): Promise<void> {
  step('(a) Settings shows Connected as fake-owner after connecting');
  const text = await settingsText(ctx);
  assert(
    text.includes('Connected as fake-owner'),
    'Settings does not say Connected as fake-owner',
  );
  check('Connected as fake-owner on /settings');
}

// (b) A connect through the app comes back connected, on this port.
export async function stepConnect(ctx: Ctx): Promise<ConnectTrace> {
  step('(b) connect through the app ends at /settings?discogs=connected');
  const trace = await connectTrace(ctx);
  assertNoLeak('POST /api/discogs/connect body', trace.connect.body);
  assertNoLeak('callback Location', trace.location);
  assert(
    trace.authorizeUrl.startsWith(
      `${ctx.fake.baseUrl}/oauth/authorize?oauth_token=`,
    ),
    `authorizeUrl ${trace.authorizeUrl} is not the (fake) discogs.com page`,
  );
  assertSettingsLocation(ctx, trace.location, 'connected');
  const state = await ctx.fake.state();
  const expected = `http://127.0.0.1:${ctx.port}/api/discogs/callback`;
  assert(
    state.lastCallback === expected,
    `the fake received oauth_callback ${state.lastCallback}, expected ${expected}`,
  );
  check(`connected; callback ${expected}`);
  return trace;
}

function identityRequests(ctx: Ctx): FakeLogEntry[] {
  return fakeLog(ctx).filter(
    (e) =>
      e.surface === 'api' && e.method === 'GET' && e.path === '/oauth/identity',
  );
}

// (j0) Test connection: one signed /oauth/identity with the stored sign-in.
export async function stepTestConnection(ctx: Ctx): Promise<void> {
  step('(j0) Test connection signs one /oauth/identity and names the owner');
  const before = identityRequests(ctx).length;
  const res = await fetch(`${ctx.baseUrl}/api/discogs/test`, {
    method: 'POST',
    headers: { origin: ctx.origin, 'content-type': 'application/json' },
    body: '{}',
  });
  const text = await res.text();
  assertNoLeak('POST /api/discogs/test body', text);
  assert(res.status === 200, `POST /api/discogs/test answered ${res.status}`);
  const body = JSON.parse(text) as { ok?: unknown; username?: unknown };
  assert(
    body.ok === true && body.username === 'fake-owner',
    `POST /api/discogs/test answered ${text}`,
  );
  const sent = identityRequests(ctx).slice(before);
  assert(
    sent.length === 1,
    `the test sent ${sent.length} /oauth/identity requests, expected 1`,
  );
  const [e] = sent;
  assert(
    e.userAgent === PROJECT_USER_AGENT,
    `the test sent User-Agent ${e.userAgent}`,
  );
  assert(
    e.signatureMethod === 'PLAINTEXT' && e.oauthParams.includes('oauth_token'),
    'the test /oauth/identity request was not signed with the stored token',
  );
  check('{ ok: true, username: fake-owner }; one signed /oauth/identity');
}

async function postJson(
  ctx: Ctx,
  route: string,
): Promise<{ status: number; text: string }> {
  const res = await fetch(`${ctx.baseUrl}${route}`, {
    method: 'POST',
    headers: { origin: ctx.origin, 'content-type': 'application/json' },
    body: '{}',
  });
  const text = await res.text();
  assertNoLeak(`POST ${route} body`, text);
  return { status: res.status, text };
}

// (j1) A rejected sign-in shows Reconnect on Settings; Disconnect forgets it.
export async function stepReconnectAndDisconnect(ctx: Ctx): Promise<void> {
  step('(j1) a rejected test shows Reconnect needed; Disconnect clears it');
  clearConnection(ctx);
  assertSettingsLocation(ctx, (await connectTrace(ctx)).location, 'connected');
  await ctx.fake.control({ revoked: true });
  try {
    const test = await postJson(ctx, '/api/discogs/test');
    assert(
      test.status === 200 &&
        JSON.parse(test.text).ok === false &&
        JSON.parse(test.text).kind === 'rejected',
      `a revoked test answered ${test.status} ${test.text}`,
    );
  } finally {
    await ctx.fake.control({ reset: true });
  }
  const reconnect = await settingsText(ctx);
  for (const needle of [
    'Reconnect needed',
    'Discogs stopped accepting this app',
    'Reconnect Discogs',
  ]) {
    assert(reconnect.includes(needle), `Settings lacks "${needle}"`);
  }
  check('rejected; Settings shows Reconnect needed and Reconnect Discogs');

  const off = await postJson(ctx, '/api/discogs/disconnect');
  assert(
    off.status === 200 && JSON.parse(off.text).ok === true,
    `POST /api/discogs/disconnect answered ${off.status} ${off.text}`,
  );
  const present = tokenKeysPresent(ctx);
  assert(present.length === 0, `disconnect left ${present.join(', ')}`);
  const after = await settingsText(ctx);
  assert(
    after.includes('Connect Discogs') && after.includes('Not connected'),
    'Settings is not back to Not connected after Disconnect',
  );
  assert(!after.includes('Connected as'), 'Settings still says Connected as');
  check('disconnected; token keys gone, Settings shows Connect Discogs');
}

/** Words the owner never sees on screen (phase prohibition, DISC-01). */
const FORBIDDEN_WORDS = [
  'token',
  'oauth',
  'verifier',
  'queue',
  'job',
  'lane',
  '429',
  'rate limit',
];

/** The visible text of a page: scripts, styles and tags removed. */
export function visibleText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;|&#x?[0-9a-f]+;/gi, ' ')
    .replace(/\s+/g, ' ');
}

async function assertPlainWords(ctx: Ctx, query = ''): Promise<string> {
  const res = await fetch(`${ctx.baseUrl}/settings${query}`);
  const html = await res.text();
  assert(res.status === 200, `GET /settings${query} answered ${res.status}`);
  assertNoLeak(`GET /settings${query}`, html);
  const text = visibleText(html);
  for (const word of FORBIDDEN_WORDS) {
    const re = new RegExp(`\\b${word.replace(' ', '\\s+')}\\b`, 'i');
    const m = re.exec(text);
    assert(
      !m,
      `/settings${query} shows "${m?.[0]}" near "${text
        .slice(Math.max(0, (m?.index ?? 0) - 40), (m?.index ?? 0) + 40)
        .replace(/\s+/g, ' ')}"`,
    );
  }
  return text;
}

// (j) Plain words on Settings in every connection state.
export async function stepPlainWords(ctx: Ctx): Promise<void> {
  step('(j) Settings shows no technical words in any connection state');
  clearConnection(ctx);
  await assertPlainWords(ctx);
  const notices: Array<[string, string]> = [
    ['denied', "Discogs wasn't connected"],
    ['expired', 'The connection timed out'],
    ['error', "Couldn't connect to Discogs"],
  ];
  for (const [value, title] of notices) {
    const text = await assertPlainWords(ctx, `?discogs=${value}`);
    assert(text.includes(title), `/settings?discogs=${value} lacks "${title}"`);
  }
  check('not connected (and each ?discogs= Alert): plain words only');

  assertSettingsLocation(ctx, (await connectTrace(ctx)).location, 'connected');
  await assertPlainWords(ctx);
  check('connected: plain words only');

  await ctx.fake.control({ revoked: true });
  try {
    const test = await postJson(ctx, '/api/discogs/test');
    assert(
      test.status === 200 && JSON.parse(test.text).kind === 'rejected',
      `a revoked test answered ${test.status} ${test.text}`,
    );
  } finally {
    await ctx.fake.control({ reset: true });
  }
  const text = await assertPlainWords(ctx);
  assert(
    text.includes('Reconnect needed'),
    'Settings is not in the reconnect-needed state',
  );
  check('reconnect needed: plain words only');
}

// (k) The callback URL well shows this server's own address (D-03).
export async function stepCallbackUrl(ctx: Ctx): Promise<void> {
  step('(k) Settings shows the callback URL for this port');
  const res = await fetch(`${ctx.baseUrl}/settings`);
  const html = await res.text();
  const expected = `http://127.0.0.1:${ctx.port}/api/discogs/callback`;
  assert(html.includes(expected), `Settings does not show ${expected}`);
  assert(
    visibleText(html).includes('Callback URL'),
    'Settings has no Callback URL label',
  );
  check(`Callback URL ${expected}`);
}

/** Starts a connect whose (fake) discogs.com page shows the code. */
async function startCodeConnect(ctx: Ctx): Promise<string> {
  await ctx.fake.control({ authorize: 'code' });
  const res = await fetch(`${ctx.baseUrl}/api/discogs/connect`, {
    method: 'POST',
    headers: { origin: ctx.origin, 'content-type': 'application/json' },
    body: '{}',
  });
  const body = await res.text();
  assertNoLeak('POST /api/discogs/connect body', body);
  assert(
    res.status === 200,
    `POST /api/discogs/connect answered ${res.status}`,
  );
  const { authorizeUrl } = JSON.parse(body) as { authorizeUrl: string };
  const page = await fetch(authorizeUrl, { redirect: 'manual' });
  const html = await page.text();
  assert(
    page.status === 200,
    `the fake code page answered ${page.status}, expected 200`,
  );
  const m = /<code id="verifier">([^<]+)<\/code>/.exec(html);
  assert(m, 'the fake code page shows no code');
  return m[1];
}

export async function postFinish(
  ctx: Ctx,
  code: string,
): Promise<{ status: number; text: string }> {
  const res = await fetch(`${ctx.baseUrl}/api/discogs/finish`, {
    method: 'POST',
    headers: { origin: ctx.origin, 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const text = await res.text();
  assertNoLeak('POST /api/discogs/finish body', text);
  assert(!text.includes(code), 'POST /api/discogs/finish echoed the code');
  return { status: res.status, text };
}

// (g) + (l) RESEARCH A1: discogs.com shows a code instead of coming back;
// pasting it on Settings finishes the connect.
export async function stepPasteCode(ctx: Ctx): Promise<void> {
  step('(g) a code shown by discogs.com finishes the connect when pasted');
  clearConnection(ctx);
  let code = '';
  try {
    code = await startCodeConnect(ctx);
  } finally {
    await ctx.fake.control({ reset: true });
  }

  step('(l) Settings shows "Code from Discogs" while the connect is pending');
  const pending = await settingsText(ctx);
  assert(
    pending.includes('Code from Discogs') &&
      pending.includes('Finish connecting'),
    'Settings lacks the Code from Discogs field during a pending connect',
  );
  check('Code from Discogs and Finish connecting on /settings');

  const wrong = await postFinish(ctx, 'not-the-code-0000');
  assert(
    wrong.status === 401 && JSON.parse(wrong.text).error === 'rejected',
    `a wrong code answered ${wrong.status} ${wrong.text}`,
  );
  assert(
    tokenKeysPresent(ctx).length === 0,
    'a rejected code stored token keys',
  );
  check('wrong code: 401 rejected, nothing stored, the connect stays pending');

  const ok = await postFinish(ctx, `  ${code}  `);
  assert(
    ok.status === 200 && JSON.parse(ok.text).username === 'fake-owner',
    `the pasted code answered ${ok.status} ${ok.text}`,
  );
  assert(tokenKeysPresent(ctx).length === 3, 'the pasted code saved no tokens');
  const after = await settingsText(ctx);
  assert(
    after.includes('Connected as fake-owner'),
    'Settings does not say Connected as fake-owner after the pasted code',
  );
  check('pasted code: 200 { username: fake-owner }, Connected as on /settings');

  step('(l) Settings drops "Code from Discogs" once connected');
  assert(
    !after.includes('Code from Discogs'),
    'Settings still shows Code from Discogs after connecting',
  );
  const again = await postFinish(ctx, code);
  assert(
    again.status === 410 && JSON.parse(again.text).error === 'expired',
    `a second finish answered ${again.status} ${again.text}`,
  );
  check('no Code from Discogs after connecting; a reused code is expired');
}

// (c) The three token keys are in the temp secrets file, mode 0600.
export function stepSecretsFile(ctx: Ctx): void {
  step('(c) tokens saved to the temp secrets file, mode 0600');
  const secrets = readSecrets(ctx);
  for (const k of TOKEN_KEYS) {
    assert(secrets[k], `secrets file lacks ${k}`);
  }
  assert(
    secrets.discogsOAuthToken.startsWith('fake-at-') &&
      secrets.discogsOAuthTokenSecret.startsWith('fake-ats-'),
    'the saved token is not the access token the fake issued',
  );
  assert(
    secrets.discogsUsername === 'fake-owner',
    `saved username is ${secrets.discogsUsername}`,
  );
  const mode = fs.statSync(ctx.secretsFile).mode & 0o777;
  assert(mode === 0o600, `secrets file mode is ${mode.toString(8)}`);
  check('three token keys present, username fake-owner, mode 600');
}

// (d) Every API request: project User-Agent; every OAuth call: PLAINTEXT.
export function stepUserAgent(ctx: Ctx): void {
  step('(d) project User-Agent on every request, PLAINTEXT on OAuth calls');
  const api = fakeLog(ctx).filter((e) => e.surface === 'api');
  assert(api.length >= 3, `the fake logged only ${api.length} API requests`);
  for (const e of api) {
    assert(
      e.userAgent === PROJECT_USER_AGENT,
      `${e.method} ${e.path} sent User-Agent ${e.userAgent}`,
    );
    assert(
      e.accept === 'application/vnd.discogs.v2.discogs+json',
      `${e.method} ${e.path} sent Accept ${e.accept}`,
    );
    if (e.path.startsWith('/oauth/')) {
      assert(
        e.signatureMethod === 'PLAINTEXT',
        `${e.method} ${e.path} signed with ${e.signatureMethod}`,
      );
    }
  }
  const paths = new Set(api.map((e) => `${e.method} ${e.path}`));
  for (const p of [
    'GET /oauth/request_token',
    'POST /oauth/access_token',
    'GET /oauth/identity',
  ]) {
    assert(paths.has(p), `the fake never saw ${p}`);
  }
  check(`${api.length} API requests, all with the project User-Agent`);
}

function tokenKeysPresent(ctx: Ctx): string[] {
  const secrets = readSecrets(ctx);
  return TOKEN_KEYS.filter((k) => k in secrets);
}

/** GET a callback URL without following the redirect; returns Location. */
async function callbackLocation(url: string): Promise<string> {
  const res = await fetch(url, { redirect: 'manual' });
  await res.text();
  const location = res.headers.get('location');
  assert(
    res.status === 303 && location,
    `callback ${new URL(url).pathname} answered ${res.status}, not a 303`,
  );
  assertNoLeak('callback Location', location);
  return location;
}

function accessTokenPosts(ctx: Ctx): number {
  return fakeLog(ctx).filter(
    (e) =>
      e.surface === 'api' &&
      e.method === 'POST' &&
      e.path === '/oauth/access_token',
  ).length;
}

// (e) Denying on (fake) discogs.com ends at denied and stores nothing.
export async function stepDenied(ctx: Ctx): Promise<void> {
  step('(e) a denied approval ends at /settings?discogs=denied');
  clearConnection(ctx);
  await ctx.fake.control({ authorize: 'deny' });
  try {
    const trace = await connectTrace(ctx);
    assert(
      new URL(trace.callbackUrl).searchParams.has('denied') &&
        !new URL(trace.callbackUrl).searchParams.has('oauth_verifier'),
      'the fake deny redirect still carries a verifier',
    );
    assertNoLeak('callback Location', trace.location);
    assertSettingsLocation(ctx, trace.location, 'denied');
  } finally {
    await ctx.fake.control({ reset: true });
  }
  const present = tokenKeysPresent(ctx);
  assert(present.length === 0, `denied connect stored ${present.join(', ')}`);
  check('denied; no token keys in the secrets file');
}

// (f) Unknown and already-used oauth_tokens end at expired (T-03-01).
export async function stepExpired(ctx: Ctx): Promise<void> {
  step(
    '(f) made-up and replayed oauth_tokens end at /settings?discogs=expired',
  );
  clearConnection(ctx);
  const madeUp = `${ctx.origin}/api/discogs/callback?oauth_token=fake-rt-madeup0123&oauth_verifier=madeup`;
  assertSettingsLocation(ctx, await callbackLocation(madeUp), 'expired');
  const none = tokenKeysPresent(ctx);
  assert(none.length === 0, `a made-up token stored ${none.join(', ')}`);
  check('made-up oauth_token: expired, nothing stored');

  const trace = await connectTrace(ctx);
  assertSettingsLocation(ctx, trace.location, 'connected');
  const before = readSecrets(ctx);
  assertSettingsLocation(
    ctx,
    await callbackLocation(trace.callbackUrl),
    'expired',
  );
  const after = readSecrets(ctx);
  for (const k of TOKEN_KEYS) {
    assert(after[k] === before[k], `replaying the callback changed ${k}`);
  }
  check('replayed callback: expired, the saved connection is unchanged');
}

// (h) RESEARCH A2: a consumer_secret& exchange connects after one retry;
// an identity failure ends at error and stores nothing.
export async function stepDocsSignature(ctx: Ctx): Promise<void> {
  step('(h) docs-form access-token signature connects after one retry');
  clearConnection(ctx);
  await ctx.fake.control({ accessSignature: 'docs' });
  try {
    const posts = accessTokenPosts(ctx);
    const trace = await connectTrace(ctx);
    assertSettingsLocation(ctx, trace.location, 'connected');
    const sent = accessTokenPosts(ctx) - posts;
    assert(
      sent === 2,
      `the docs-form connect sent ${sent} POST /oauth/access_token, expected 2`,
    );
    assert(
      tokenKeysPresent(ctx).length === 3,
      'the docs-form connect saved no tokens',
    );
  } finally {
    await ctx.fake.control({ reset: true });
  }
  check('connected with exactly two POST /oauth/access_token');

  clearConnection(ctx);
  await ctx.fake.control({ revoked: true });
  try {
    const trace = await connectTrace(ctx);
    assertSettingsLocation(ctx, trace.location, 'error');
  } finally {
    await ctx.fake.control({ reset: true });
  }
  const present = tokenKeysPresent(ctx);
  assert(
    present.length === 0,
    `a failed identity stored ${present.join(', ')}`,
  );
  check('identity 401: error, nothing stored');
}

runMain('verify-discogs', async (onCleanup) => {
  const tmp = await makeTempDir('verify-discogs');
  onCleanup(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const dataDir = path.join(tmp, 'data');
  const port = await getFreePort();

  step('build');
  await buildApp({ NEXT_DIST_DIR: DIST_DIR });

  step('start the fake Discogs');
  const fake = await startFakeDiscogs({ tmp });
  onCleanup(() => fake.stop());

  const server = await stepStart(tmp, dataDir, port, fake);
  onCleanup(async () => {
    await server.stop('SIGKILL');
  });
  const ctx: Ctx = {
    port,
    tmp,
    dataDir,
    baseUrl: server.baseUrl,
    origin: `http://127.0.0.1:${port}`,
    fake,
    secretsFile: tempSecretsFile(tmp),
  };

  await stepSettingsBefore(ctx);
  await stepConnect(ctx);
  await stepSettingsAfter(ctx);
  await stepTestConnection(ctx);
  stepSecretsFile(ctx);
  stepUserAgent(ctx);
  await stepDenied(ctx);
  await stepExpired(ctx);
  await stepDocsSignature(ctx);
  await stepReconnectAndDisconnect(ctx);
  await stepPasteCode(ctx);
  await stepCallbackUrl(ctx);
  await stepPlainWords(ctx);
  // (d) again: the extra connects above kept the User-Agent and PLAINTEXT.
  stepUserAgent(ctx);

  step('stop');
  await server.stop('SIGTERM');
});
