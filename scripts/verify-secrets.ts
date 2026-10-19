// Secrets leak proof (Plan 01-03, ROADMAP success criterion 2, D-08/D-09/D-11).
// Canary values are saved to a temp secrets file; no rendered page, RSC
// payload, /api/* response or .next/static file may contain them unmasked.
// Run: node scripts/verify-secrets.ts   (VERIFY_SKIP_BUILD=1 reuses .next)
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildApp,
  getFreePort,
  httpRequest,
  makeTempDir,
  runMain,
  type ServerHandle,
  startServer,
} from './lib/server.ts';

const CANARY_KEY = 'CANARYKEY-0123456789wxyz';
const CANARY_SECRET = 'CANARYSECRET-0123456789abcd';
const ENV_KEY = 'ENVKEY-0123456789efgh';
const SAVED_SENTENCE =
  'A saved value exists and will be used if the variable is removed.';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function step(label: string) {
  console.log(`-- ${label}`);
}

async function get(
  port: number,
  p: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string }> {
  const res = await httpRequest({ port, path: p, headers });
  return { status: res.status, body: res.body };
}

/** RSC payload of a page; follows Next's one-time cache-busting 307. */
async function getRsc(
  port: number,
  p: string,
): Promise<{ status: number; body: string }> {
  const headers = { rsc: '1' };
  const first = await httpRequest({ port, path: p, headers });
  const location = first.headers.location;
  if (first.status !== 307 || typeof location !== 'string') {
    return { status: first.status, body: first.body };
  }
  const res = await httpRequest({ port, path: location, headers });
  assert(
    String(res.headers['content-type']).includes('text/x-component'),
    `${p} RSC response is ${res.headers['content-type']}`,
  );
  return { status: res.status, body: res.body };
}

function assertNoCanary(label: string, body: string, needles: string[]) {
  for (const n of needles) {
    assert(!body.includes(n), `${label} contains unmasked value "${n}"`);
  }
  console.log(`   ${label}: no unmasked value`);
}

// (c) /settings HTML and its RSC payload show masks only.
export async function stepSettingsMasked(port: number): Promise<void> {
  step('(c) /settings renders Saved and masks, never the canary');
  const html = await get(port, '/settings');
  assert(html.status === 200, `/settings returned ${html.status}`);
  for (const s of ['Saved', '…wxyz', '…abcd', 'Data folder', 'Secrets file']) {
    assert(html.body.includes(s), `/settings HTML lacks "${s}"`);
  }
  assertNoCanary('/settings HTML', html.body, [
    'CANARYKEY-0123456789',
    'CANARYSECRET-0123456789',
  ]);
  const rsc = await getRsc(port, '/settings');
  assert(rsc.status === 200, `/settings RSC returned ${rsc.status}`);
  assertNoCanary('/settings RSC payload', rsc.body, ['CANARY']);
}

// (d) every other page and API route is canary-free.
export async function stepOtherRoutes(port: number): Promise<void> {
  step('(d) /api/status, /api/dev/jobs, /upload, /spines carry no canary');
  for (const p of ['/api/status', '/api/dev/jobs', '/upload', '/spines']) {
    const res = await get(port, p);
    assert(res.status === 200, `${p} returned ${res.status}`);
    assertNoCanary(p, res.body, ['CANARY']);
  }
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

// (e) the client bundle never carries a secret.
export function stepStaticBundle(): void {
  step('(e) .next/static contains no canary');
  const root = path.join(process.cwd(), '.next', 'static');
  assert(fs.existsSync(root), '.next/static is missing (build first)');
  const files = walk(root);
  assert(files.length > 0, '.next/static is empty');
  for (const f of files) {
    assert(
      !fs.readFileSync(f).includes('CANARY'),
      `${path.relative(process.cwd(), f)} contains a canary`,
    );
  }
  console.log(`   scanned ${files.length} files`);
}

// (f) a cross-site POST to the Server Action page is refused by the proxy.
export async function stepForeignOrigin(port: number): Promise<void> {
  step('(f) POST /settings with a foreign Origin gets 403');
  const res = await httpRequest({
    port,
    method: 'POST',
    path: '/settings',
    headers: {
      origin: 'http://evil.test',
      'next-action': '0'.repeat(42),
      'content-type': 'text/plain;charset=UTF-8',
    },
    body: '[]',
  });
  assert(res.status === 403, `foreign-Origin POST returned ${res.status}`);
  console.log('   foreign Origin: 403');
}

// (g) env overrides the saved value without touching the file.
export async function stepEnvOverride(port: number): Promise<void> {
  step('(g) DISCOGS_CONSUMER_KEY overrides the saved key');
  const html = await get(port, '/settings');
  assert(html.status === 200, `/settings returned ${html.status}`);
  for (const s of ['From env', '…efgh', SAVED_SENTENCE, '…abcd']) {
    assert(html.body.includes(s), `/settings HTML lacks "${s}"`);
  }
  assert(
    html.body.includes('Set by the DISCOGS_CONSUMER_KEY environment variable'),
    '/settings HTML lacks the env-override description',
  );
  assertNoCanary('/settings HTML (env)', html.body, [
    'ENVKEY-0123456789',
    'CANARYKEY-0123456789',
    'CANARYSECRET-0123456789',
  ]);
  const rsc = await getRsc(port, '/settings');
  assertNoCanary('/settings RSC payload (env)', rsc.body, [
    'ENVKEY-0123456789',
    'CANARY',
  ]);
}

// (h) rendering never rewrites the file; it stays 0600.
export function stepFileUntouched(file: string, before: Buffer): void {
  step('(h) secrets file keeps mode 0600 and identical bytes');
  const mode = fs.statSync(file).mode & 0o777;
  assert(mode === 0o600, `secrets file mode is ${mode.toString(8)}`);
  assert(fs.readFileSync(file).equals(before), 'secrets file was rewritten');
}

// (i) git never sees secrets.json or the data folder (D-11).
export function stepGitIgnored(): void {
  step('(i) secrets.json and data/ are gitignored');
  for (const p of ['secrets.json', 'data/app.db']) {
    const r = spawnSync('git', ['check-ignore', '-q', p]);
    assert(r.status === 0, `git check-ignore ${p} exited ${r.status}`);
  }
  const status = execFileSync(
    'git',
    ['status', '--porcelain', '--untracked-files=all'],
    { encoding: 'utf8' },
  );
  for (const line of status.split('\n').filter(Boolean)) {
    const p = line.slice(3).trim();
    assert(!p.endsWith('secrets.json'), `git status lists ${p}`);
    assert(!p.startsWith('data/'), `git status lists ${p}`);
  }
}

runMain('verify-secrets', async (onCleanup) => {
  step('(a) build');
  await buildApp();

  step('(b) temp DATA_DIR and canary secrets file');
  const dataDir = await makeTempDir('dai-verify-secrets-data');
  const secretsDir = await makeTempDir('dai-verify-secrets');
  onCleanup(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  onCleanup(() => fs.rmSync(secretsDir, { recursive: true, force: true }));
  const secretsPath = path.join(secretsDir, 'secrets.json');
  fs.writeFileSync(
    secretsPath,
    `${JSON.stringify(
      { discogsConsumerKey: CANARY_KEY, discogsConsumerSecret: CANARY_SECRET },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  fs.chmodSync(secretsPath, 0o600);
  const before = fs.readFileSync(secretsPath);

  const baseEnv = {
    DATA_DIR: dataDir,
    SECRETS_FILE: secretsPath,
    APP_TEST_HOOKS: '1',
    DISCOGS_CONSUMER_KEY: '',
    DISCOGS_CONSUMER_SECRET: '',
    // Keep the Claude CLI card hermetic: never spawn the real CLI here.
    CLAUDE_BIN: '/nonexistent/dai-claude-cli',
  };

  let server: ServerHandle | null = null;
  onCleanup(async () => {
    if (server) await server.stop('SIGKILL');
  });

  const port1 = await getFreePort();
  server = await startServer({ mode: 'start', port: port1, env: baseEnv });
  await stepSettingsMasked(port1);
  await stepOtherRoutes(port1);
  stepStaticBundle();
  await stepForeignOrigin(port1);
  await server.stop();
  server = null;

  const port2 = await getFreePort();
  server = await startServer({
    mode: 'start',
    port: port2,
    env: { ...baseEnv, DISCOGS_CONSUMER_KEY: ENV_KEY },
  });
  await stepEnvOverride(port2);
  await server.stop();
  server = null;

  stepFileUntouched(secretsPath, before);
  stepGitIgnored();
});
