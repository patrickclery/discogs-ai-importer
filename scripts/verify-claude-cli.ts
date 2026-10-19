// Claude CLI setup proof (Plan 01-04, D-10, D-18) against the fake CLI in
// test/fixtures/fake-claude.mjs. Never starts the real `claude`.
// Run: node scripts/verify-claude-cli.ts   (VERIFY_SKIP_BUILD=1 reuses .next)
import fs from 'node:fs';
import os from 'node:os';
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

const FAKE = path.resolve('test/fixtures/fake-claude.mjs');
const CANARY_API_KEY = 'sk-ant-CANARY-0123456789zz';
const FAKE_EMAIL = 'fake-owner@example.invalid';
const FAKE_ORG = 'Fake Org Name';
const ALREADY_SET_UP = 'The Claude CLI is already set up.';

type LogEntry = {
  argv: string[];
  cwd: string;
  env: Record<string, boolean>;
};

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function step(label: string) {
  console.log(`-- ${label}`);
}

async function getPage(port: number, p: string): Promise<string> {
  const res = await httpRequest({ port, path: p, timeoutMs: 30_000 });
  assert(res.status === 200, `${p} returned ${res.status}`);
  return res.body;
}

/** RSC payload of a page; follows Next's one-time cache-busting 307. */
async function getRsc(port: number, p: string): Promise<string> {
  const headers = { rsc: '1' };
  const first = await httpRequest({ port, path: p, headers });
  const location = first.headers.location;
  if (first.status !== 307 || typeof location !== 'string') return first.body;
  const res = await httpRequest({ port, path: location, headers });
  assert(res.status === 200, `${p} RSC returned ${res.status}`);
  return res.body;
}

function contains(label: string, body: string, needles: string[]) {
  for (const n of needles) {
    assert(body.includes(n), `${label} lacks "${n}"`);
  }
}

function lacks(label: string, body: string, needles: string[]) {
  for (const n of needles) {
    assert(!body.includes(n), `${label} contains "${n}"`);
  }
}

function readLog(file: string): LogEntry[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as LogEntry);
}

runMain('verify-claude-cli', async (onCleanup) => {
  step('(a) build');
  await buildApp();

  step('(b) temp DATA_DIR, secrets file and fake CLI log');
  assert(fs.existsSync(FAKE), `missing ${FAKE}`);
  const dataDir = await makeTempDir('dai-verify-claude-data');
  const workDir = await makeTempDir('dai-verify-claude');
  onCleanup(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  onCleanup(() => fs.rmSync(workDir, { recursive: true, force: true }));
  const logFile = path.join(workDir, 'fake-claude.jsonl');
  const base = {
    DATA_DIR: dataDir,
    SECRETS_FILE: path.join(workDir, 'secrets.json'),
    CLAUDE_BIN: FAKE,
    FAKE_CLAUDE_LOG: logFile,
    ANTHROPIC_API_KEY: '',
    DISCOGS_CONSUMER_KEY: 'DISCOGS-CANARY-KEY-0123',
    DISCOGS_CONSUMER_SECRET: 'DISCOGS-CANARY-SECRET-0123',
  };

  let server: ServerHandle | null = null;
  onCleanup(async () => {
    if (server) await server.stop('SIGKILL');
  });
  const pages: string[] = [];

  async function withServer(
    label: string,
    env: Record<string, string>,
    fn: (port: number) => Promise<void>,
  ) {
    step(label);
    const port = await getFreePort();
    server = await startServer({
      mode: 'start',
      port,
      env: { ...base, ...env },
    });
    try {
      await fn(port);
    } finally {
      await server.stop();
      server = null;
    }
  }

  await withServer(
    '(c) mode ok with ANTHROPIC_API_KEY set: Installed, Subscription, warning, ready',
    { FAKE_CLAUDE_MODE: 'ok', ANTHROPIC_API_KEY: CANARY_API_KEY },
    async (port) => {
      const settings = await getPage(port, '/settings');
      pages.push(settings);
      contains('/settings', settings, [
        'Claude CLI',
        'Installed',
        '9.9.9',
        'Subscription',
        'max',
        'ANTHROPIC_API_KEY is set',
        'Test Claude',
        'Vision model',
        'claude-opus-5-5',
      ]);
      lacks('/settings', settings, ['sk-ant-CANARY', 'Not installed']);
      const rsc = await getRsc(port, '/settings');
      pages.push(rsc);
      lacks('/settings RSC', rsc, ['sk-ant-CANARY', 'CANARY-KEY']);

      const upload = await getPage(port, '/upload');
      pages.push(upload);
      contains('/upload', upload, [ALREADY_SET_UP]);
      lacks('/upload', upload, ['Open Settings', 'sk-ant-CANARY']);
      console.log('   settings and upload OK');
    },
  );

  step('(d) the fake CLI never received ANTHROPIC_API_KEY or a Discogs secret');
  const log = readLog(logFile);
  assert(log.length >= 2, `fake CLI ran ${log.length} times, expected >= 2`);
  const tmp = fs.realpathSync(os.tmpdir());
  for (const e of log) {
    for (const [name, present] of Object.entries(e.env)) {
      assert(!present, `fake CLI received ${name} (argv ${e.argv.join(' ')})`);
    }
    // CR-01: a private dir of our own, never the shared os.tmpdir().
    assert(e.cwd !== tmp, `fake CLI ran in the shared ${tmp}`);
    assert(
      path.basename(e.cwd).startsWith('dai-claude-'),
      `fake CLI ran in ${e.cwd}, expected a private dai-claude-* dir`,
    );
    assert(!e.argv.includes('--bare'), 'fake CLI was started in minimal mode');
    if (e.argv[0] === '-p') {
      for (const f of ['--restricted', '--safe-mode', '--strict-mcp-config']) {
        assert(e.argv.includes(f), `-p call lacks ${f}`);
      }
    }
  }
  console.log(`   ${log.length} invocations, env scrubbed, private cwd`);

  await withServer(
    '(e) mode logged-out: Not logged in, Upload offers Open Settings',
    { FAKE_CLAUDE_MODE: 'logged-out' },
    async (port) => {
      const settings = await getPage(port, '/settings');
      pages.push(settings);
      contains('/settings', settings, ['Installed', 'Not logged in']);
      lacks('/settings', settings, ['ANTHROPIC_API_KEY is set']);
      const upload = await getPage(port, '/upload');
      pages.push(upload);
      contains('/upload', upload, ['Open Settings', 'Set up the Claude CLI']);
      lacks('/upload', upload, [ALREADY_SET_UP]);
    },
  );

  await withServer(
    '(f) mode api-key: API billing',
    { FAKE_CLAUDE_MODE: 'api-key' },
    async (port) => {
      const settings = await getPage(port, '/settings');
      pages.push(settings);
      contains('/settings', settings, ['API billing', 'api_key']);
      // WR-06: an API-billed login is not ready; Upload sends to Settings.
      const upload = await getPage(port, '/upload');
      pages.push(upload);
      contains('/upload', upload, ['Open Settings']);
      lacks('/upload', upload, [ALREADY_SET_UP]);
    },
  );

  await withServer(
    '(g) CLAUDE_BIN missing: Not installed',
    { CLAUDE_BIN: path.join(workDir, 'no-such-claude') },
    async (port) => {
      const settings = await getPage(port, '/settings');
      pages.push(settings);
      contains('/settings', settings, ['Not installed']);
      lacks('/settings', settings, ['Subscription']);
      const upload = await getPage(port, '/upload');
      pages.push(upload);
      contains('/upload', upload, ['Open Settings']);
    },
  );

  step('(h) no page carried the fake account identity');
  for (const body of pages) {
    lacks('page', body, [FAKE_EMAIL, FAKE_ORG, 'fake-org-0000']);
  }
  console.log(`   scanned ${pages.length} responses`);
});
