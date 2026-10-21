// Discogs connect proof against test/fixtures/fake-discogs.mjs (never the
// live API, never the owner's secrets.json). Plan 03-01: (b) a connect
// started through the app ends at /settings?discogs=connected with a
// callback on this server's own port, (c) the tokens land in the temp
// secrets file with mode 0600, (d) every API request carries the project
// User-Agent and every OAuth call is PLAINTEXT, (e) a denied approval ends
// at denied, (f) a made-up or replayed oauth_token ends at expired, (h) the
// docs-form access-token signature still connects after one retry, and an
// identity failure ends at error. Nothing but connected stores a token.
// Step letters are stable across plans: (a) is the Settings card (Plan
// 03-02) and (g) the paste-code path (Plan 03-04).
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

  await stepConnect(ctx);
  stepSecretsFile(ctx);
  stepUserAgent(ctx);
  await stepDenied(ctx);
  await stepExpired(ctx);
  await stepDocsSignature(ctx);
  // (d) again: the extra connects above kept the User-Agent and PLAINTEXT.
  stepUserAgent(ctx);

  step('stop');
  await server.stop('SIGTERM');
});
