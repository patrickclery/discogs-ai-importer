// kill -9 recovery proof for the vision run ledger (Plan 02-05, RESEARCH
// Pitfall 3, INGEST-04): the server is SIGKILLed while Claude (the fake CLI)
// is reading a photo, then restarted on the same DATA_DIR with a fake CLI
// that would succeed. The run must end in error with the interrupted reason,
// its one-shot job must be failed, and the photo must never be sent again.
// Run: node scripts/verify-scan-recovery.ts   (VERIFY_SKIP_BUILD=1 reuses .next)
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  LAYOUTS,
  makeSyntheticShelf,
  structuredOutputFor,
} from '../test/fixtures/vision/synthetic-shelf.mjs';
import { assert, check, sleep, step } from './lib/jobs.ts';
import {
  buildApp,
  getFreePort,
  makeTempDir,
  runMain,
  type ServerHandle,
  startServer,
  waitFor,
} from './lib/server.ts';

const FAKE_CLAUDE = path.join(process.cwd(), 'test/fixtures/fake-claude.mjs');
const TRACER = LAYOUTS.tracerShelf;
const INTERRUPTED =
  'The app stopped while Claude was reading this photo. Re-scan to try again.';

type PhotoView = { id: string; status: string; errorReason: string | null };
type LogEntry = { argv: string[]; pid: number };

function pCalls(log: string): LogEntry[] {
  if (!fs.existsSync(log)) return [];
  return fs
    .readFileSync(log, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as LogEntry)
    .filter((e) => e.argv[0] === '-p');
}

/** Kills the fake CLI's process group (it was spawned detached), then it. */
function killFake(pid: number): void {
  for (const target of [-pid, pid]) {
    try {
      process.kill(target, 'SIGKILL');
    } catch {
      // already gone
    }
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function photo(baseUrl: string, id: string): Promise<PhotoView> {
  const res = await fetch(`${baseUrl}/api/photos`);
  assert(res.status === 200, `GET /api/photos returned ${res.status}`);
  const { photos } = (await res.json()) as { photos: PhotoView[] };
  const p = photos.find((x) => x.id === id);
  assert(p, `photo ${id} missing from GET /api/photos`);
  return p;
}

runMain('verify-scan-recovery', async (onCleanup) => {
  const tmp = await makeTempDir('verify-scan-recovery');
  onCleanup(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const dataDir = path.join(tmp, 'data');
  const log = path.join(tmp, 'fake-claude.jsonl');
  const fixture = path.join(tmp, 'vision.json');
  fs.writeFileSync(fixture, JSON.stringify(structuredOutputFor(TRACER)));
  const claudeEnv = (mode: string) => ({
    DATA_DIR: dataDir,
    APP_TEST_HOOKS: '',
    CLAUDE_BIN: FAKE_CLAUDE,
    FAKE_CLAUDE_MODE: mode,
    FAKE_CLAUDE_VISION_FIXTURE: fixture,
    FAKE_CLAUDE_LOG: log,
  });
  const servers: ServerHandle[] = [];
  onCleanup(async () => {
    for (const s of servers) await s.stop('SIGKILL');
    // No fake CLI may outlive the proof.
    for (const e of pCalls(log)) killFake(e.pid);
  });

  step('build');
  await buildApp();

  step('(a) start with a fake CLI that hangs, upload the tracer shelf');
  const portA = await getFreePort();
  const a = await startServer({
    mode: 'start',
    port: portA,
    env: claudeEnv('hang'),
  });
  servers.push(a);
  const jpeg = new Uint8Array((await makeSyntheticShelf(TRACER)).jpeg);
  const res = await fetch(`${a.baseUrl}/api/photos`, {
    method: 'POST',
    headers: {
      origin: `http://127.0.0.1:${portA}`,
      'content-type': 'image/jpeg',
      'x-filename': 'recovery.jpg',
    },
    body: new Blob([jpeg as Uint8Array<ArrayBuffer>]),
  });
  assert(res.status === 201, `upload returned ${res.status}`);
  const { photoId } = (await res.json()) as { photoId: string };
  check(`uploaded ${photoId}`);

  step('(b) wait until Claude is reading it (status calling, one -p call)');
  await waitFor(
    'status calling with one -p call',
    async () => {
      const p = await photo(a.baseUrl, photoId);
      return p.status === 'calling' && pCalls(log).length === 1
        ? true
        : undefined;
    },
    { timeoutMs: 30_000, intervalMs: 200 },
  );
  const [first] = pCalls(log);
  assert(alive(first.pid), `fake CLI pid ${first.pid} is not running`);
  check(`calling; fake CLI pid ${first.pid} is reading the photo`);

  step('(c) SIGKILL the server mid-call, then kill the orphaned CLI');
  const killed = await a.stop('SIGKILL');
  assert(killed.signal === 'SIGKILL', `A exited ${JSON.stringify(killed)}`);
  killFake(first.pid);
  await waitFor('orphaned CLI gone', async () =>
    alive(first.pid) ? undefined : true,
  );
  check('server SIGKILLed while the run was calling; orphan killed');

  step('(d) restart on the same DATA_DIR with a fake CLI that would succeed');
  const portB = await getFreePort();
  const b = await startServer({
    mode: 'start',
    port: portB,
    env: claudeEnv('vision'),
  });
  servers.push(b);
  const settled = await waitFor(
    'photo shows error',
    async () => {
      const p = await photo(b.baseUrl, photoId);
      if (p.status === 'done') {
        throw new Error('the photo was scanned again after the restart');
      }
      return p.status === 'error' ? p : undefined;
    },
    { timeoutMs: 30_000, intervalMs: 250 },
  );
  assert(
    settled.errorReason === INTERRUPTED,
    `error reason ${JSON.stringify(settled.errorReason)}, expected the interrupted copy`,
  );
  check(`photo is error: "${settled.errorReason}"`);

  step('(e) still exactly one -p call, and the scan job is failed');
  // One more lease tick (5 s) must not send it either.
  await sleep(6000);
  const n = pCalls(log).length;
  assert(n === 1, `${n} -p invocations, expected exactly 1`);
  const db = new Database(path.join(dataDir, 'app.db'), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const jobs = db
      .prepare('SELECT dedupe_key, status, attempts FROM jobs')
      .all() as {
      dedupe_key: string | null;
      status: string;
      attempts: number;
    }[];
    const scan = jobs.find((j) => j.dedupe_key === `scan:${photoId}:1`);
    assert(scan, `no jobs row for scan:${photoId}:1`);
    assert(
      scan.status === 'failed',
      `scan job is ${scan.status}, expected failed`,
    );
    assert(
      scan.attempts === 1,
      `scan job attempts ${scan.attempts}, expected 1`,
    );
    const others = jobs.filter((j) => j !== scan);
    assert(
      others.length === 0,
      `unexpected extra jobs: ${JSON.stringify(others)}`,
    );
    const run = db
      .prepare(
        'SELECT status, error_kind FROM vision_runs WHERE photo_id = ? AND run_no = 1',
      )
      .get(photoId) as { status: string; error_kind: string };
    assert(
      run.status === 'error' && run.error_kind === 'interrupted',
      `run 1 is ${run.status}/${run.error_kind}`,
    );
  } finally {
    db.close();
  }
  check('one -p call in total; scan job failed after 1 attempt; no other job');

  step('stop');
  await b.stop('SIGTERM');
});
