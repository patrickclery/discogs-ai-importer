// Walking-skeleton tracer proof (Plans 01-01, 01-05).
// Run: node scripts/verify-skeleton.ts   (VERIFY_SKIP_BUILD=1 reuses .next)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  buildApp,
  getFreePort,
  httpRequest,
  makeTempDir,
  runMain,
  type ServerHandle,
  startServer,
  waitFor,
} from './lib/server.ts';

const SUBDIRS = ['photos', 'vision', 'crops', 'thumbs', 'backups'];

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function step(label: string) {
  console.log(`-- ${label}`);
}

type Status = {
  worker: {
    bootId: string;
    startedAt: number;
    starts: number;
    pid: number;
  } | null;
  jobs: Record<string, Record<string, number>>;
};

async function getStatus(port: number): Promise<Status> {
  const res = await httpRequest({ port, path: '/api/status' });
  assert(res.status === 200, `/api/status returned ${res.status}`);
  return JSON.parse(res.body) as Status;
}

// (a) next build must never open the DB.
export async function stepBuildWithoutDb(tmp: string): Promise<void> {
  step('(a) build does not touch DATA_DIR');
  const buildData = path.join(tmp, 'build-data');
  await buildApp({ DATA_DIR: buildData });
  assert(
    !fs.existsSync(buildData),
    `next build created ${buildData} (a page or route opened the DB at build time)`,
  );
}

// (b) start with dev hooks on and a fresh DATA_DIR.
export async function stepStart(
  dataDir: string,
  port: number,
  hooks: boolean,
): Promise<ServerHandle> {
  step(`(b) next start on 127.0.0.1:${port} (APP_TEST_HOOKS=${hooks ? 1 : 0})`);
  return startServer({
    mode: 'start',
    port,
    env: { DATA_DIR: dataDir, APP_TEST_HOOKS: hooks ? '1' : '' },
  });
}

// (c) first boot created the folder layout and a migrated WAL database.
export function stepDataFolder(dataDir: string): void {
  step('(c) data folder and migrated app.db');
  const dbPath = path.join(dataDir, 'app.db');
  assert(fs.existsSync(dbPath), `missing ${dbPath}`);
  for (const d of SUBDIRS) {
    assert(
      fs
        .statSync(path.join(dataDir, d), { throwIfNoEntry: false })
        ?.isDirectory(),
      `missing subfolder ${d}/`,
    );
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const tables = new Set(
      (
        db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all() as { name: string }[]
      ).map((r) => r.name),
    );
    for (const t of ['jobs', 'settings', 'worker_lease']) {
      assert(tables.has(t), `table ${t} missing from live app.db`);
    }
    const migrations = db
      .prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations')
      .get() as { n: number };
    assert(
      migrations.n === 1,
      `__drizzle_migrations has ${migrations.n} rows, expected 1`,
    );
    const mode = db.pragma('journal_mode', { simple: true });
    assert(mode === 'wal', `journal_mode is ${String(mode)}, expected wal`);
  } finally {
    db.close();
  }
}

// (d) the socket is loopback-only and the LAN address is refused.
export async function stepLoopbackOnly(port: number): Promise<void> {
  step('(d) bound to 127.0.0.1 only');
  let ssOut: string | undefined;
  try {
    ssOut = execFileSync('ss', ['-ltnH', `sport = :${port}`], {
      encoding: 'utf8',
    });
  } catch {
    ssOut = undefined;
  }
  if (ssOut === undefined) {
    console.log('SKIP: ss not available, listener address check skipped');
  } else {
    const locals = ssOut
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.split(/\s+/)[3]);
    assert(locals.length > 0, `no listener found on port ${port}`);
    for (const local of locals) {
      assert(
        local === `127.0.0.1:${port}`,
        `listener ${local} is not 127.0.0.1:${port}`,
      );
    }
  }

  const lan = Object.values(os.networkInterfaces())
    .flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal);
  if (!lan) {
    console.log(
      'SKIP: no non-internal IPv4 interface, LAN refusal check skipped',
    );
    return;
  }
  const outcome = await new Promise<string>((resolve) => {
    const sock = net.connect({ host: lan.address, port });
    sock.setTimeout(3000);
    sock.on('connect', () => {
      sock.destroy();
      resolve('connected');
    });
    sock.on('timeout', () => {
      sock.destroy();
      resolve('timeout');
    });
    sock.on('error', (e: NodeJS.ErrnoException) => resolve(e.code ?? 'error'));
  });
  assert(
    outcome === 'ECONNREFUSED',
    `connection to LAN address ${lan.address}:${port} was ${outcome}, expected ECONNREFUSED`,
  );
}

// (e) the App Router page layer is on the tracer path: / redirects to /upload.
export async function stepHomePage(port: number): Promise<void> {
  step('(e) GET / redirects to /upload');
  const res = await httpRequest({ port, path: '/' });
  assert(
    res.status === 307 || res.status === 308,
    `GET / returned ${res.status}, expected 307 or 308`,
  );
  const location = String(res.headers.location ?? '');
  assert(
    location.endsWith('/upload'),
    `GET / location is "${location}", expected it to end with /upload`,
  );
}

function decodeEntities(html: string): string {
  return html
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

async function getPage(port: number, pagePath: string): Promise<string> {
  const res = await httpRequest({ port, path: pagePath });
  assert(res.status === 200, `GET ${pagePath} returned ${res.status}`);
  return decodeEntities(res.body);
}

function assertContains(html: string, text: string, where: string): void {
  assert(html.includes(text), `${where} does not contain "${text}"`);
}

// (e2) the shell renders: nav order, empty states, status loading text, dev card.
export async function stepShellPages(port: number): Promise<void> {
  step('(e2) app shell, empty states and Developer card (hooks on)');
  const upload = await getPage(port, '/upload');
  assertContains(upload, "Upload isn't built yet", '/upload');
  assertContains(upload, 'Open Settings', '/upload');
  assertContains(upload, 'Checking worker…', '/upload');
  const nav = upload.match(/<nav[^>]*aria-label="Main"[^>]*>([\s\S]*?)<\/nav>/);
  assert(nav, '/upload has no <nav aria-label="Main">');
  const labels = [...nav[1].matchAll(/<a\b[^>]*>([^<]*)<\/a>/g)].map((m) =>
    m[1].trim(),
  );
  assert(
    labels.join(',') === 'Upload,Spines,Settings',
    `Main nav labels are [${labels.join(', ')}], expected Upload, Spines, Settings`,
  );

  const spines = await getPage(port, '/spines');
  assertContains(spines, 'No spines yet', '/spines');
  const spinesLink = spines.match(/<a\b[^>]*href="\/spines"[^>]*>/);
  assert(spinesLink, '/spines has no link to /spines');
  assert(
    spinesLink[0].includes('aria-current="page"'),
    'Spines link on /spines lacks aria-current="page"',
  );

  const settings = await getPage(port, '/settings');
  assertContains(settings, 'Queue test job', '/settings (hooks on)');
}

// (f) a test job round-trips route -> SQLite -> worker -> /api/status.
export async function stepJobRoundTrip(port: number): Promise<void> {
  step('(f) test job round trip');
  const res = await httpRequest({
    port,
    method: 'POST',
    path: '/api/dev/jobs',
    headers: { origin: `http://127.0.0.1:${port}` },
    body: JSON.stringify({ payload: { ms: 0 } }),
  });
  assert(
    res.status === 201,
    `POST /api/dev/jobs returned ${res.status}: ${res.body}`,
  );
  const { id, created } = JSON.parse(res.body) as {
    id: string;
    created: boolean;
  };
  assert(
    created === true && typeof id === 'string',
    'POST did not report created',
  );

  const status = await waitFor(
    'anthropic.succeeded === 1',
    async () => {
      const s = await getStatus(port);
      return s.jobs.anthropic?.succeeded === 1 ? s : undefined;
    },
    { timeoutMs: 15_000, intervalMs: 250 },
  );
  assert(
    status.worker && status.worker.bootId.length > 0,
    'worker.bootId empty',
  );
  assert(
    status.worker.starts === 1,
    `worker.starts is ${status.worker.starts}, expected 1`,
  );

  const list = await httpRequest({ port, path: '/api/dev/jobs' });
  assert(list.status === 200, `GET /api/dev/jobs returned ${list.status}`);
  const { jobs } = JSON.parse(list.body) as {
    jobs: { id: string; status: string; attempts: number }[];
  };
  const job = jobs.find((j) => j.id === id);
  assert(job, `job ${id} missing from GET /api/dev/jobs`);
  assert(
    job.status === 'succeeded',
    `job status ${job.status}, expected succeeded`,
  );
  assert(job.attempts === 1, `job attempts ${job.attempts}, expected 1`);
}

// (g) bad input is rejected.
export async function stepBadBody(port: number): Promise<void> {
  step('(g) invalid payload returns 400');
  const res = await httpRequest({
    port,
    method: 'POST',
    path: '/api/dev/jobs',
    headers: { origin: `http://127.0.0.1:${port}` },
    body: JSON.stringify({ payload: { ms: 'x' } }),
  });
  assert(res.status === 400, `bad body returned ${res.status}, expected 400`);
}

// (h) dev hooks are 404 under next start without APP_TEST_HOOKS.
export async function stepHooksOff(port: number): Promise<void> {
  step('(h) dev route is 404 without APP_TEST_HOOKS');
  const get = await httpRequest({ port, path: '/api/dev/jobs' });
  assert(
    get.status === 404,
    `GET /api/dev/jobs returned ${get.status}, expected 404`,
  );
  const post = await httpRequest({
    port,
    method: 'POST',
    path: '/api/dev/jobs',
    headers: { origin: `http://127.0.0.1:${port}` },
    body: JSON.stringify({ payload: { ms: 0 } }),
  });
  assert(
    post.status === 404,
    `POST /api/dev/jobs returned ${post.status}, expected 404`,
  );
}

// (h2) the Developer card is hidden under next start without APP_TEST_HOOKS.
export async function stepSettingsHooksOff(port: number): Promise<void> {
  step('(h2) /settings hides the Developer card without APP_TEST_HOOKS');
  const res = await httpRequest({ port, path: '/settings' });
  assert(res.status === 200, `GET /settings returned ${res.status}`);
  assert(
    !res.body.includes('Queue test job'),
    '/settings renders "Queue test job" without APP_TEST_HOOKS',
  );
}

runMain('verify-skeleton', async (onCleanup) => {
  const tmp = await makeTempDir('verify-skeleton');
  onCleanup(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const dataDir = path.join(tmp, 'data');
  const port = await getFreePort();

  await stepBuildWithoutDb(tmp);

  let server = await stepStart(dataDir, port, true);
  onCleanup(async () => {
    await server.stop('SIGKILL');
  });
  stepDataFolder(dataDir);
  await stepLoopbackOnly(port);
  await stepHomePage(port);
  await stepShellPages(port);
  await stepJobRoundTrip(port);
  await stepBadBody(port);
  await server.stop('SIGTERM');

  server = await stepStart(dataDir, port, false);
  await stepHooksOff(port);
  await stepSettingsHooksOff(port);

  step('(i) stop');
  await server.stop('SIGTERM');
});
