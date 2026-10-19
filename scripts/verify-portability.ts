// Criterion 3 / FOUND-02: stop the app, copy the data folder elsewhere, and it
// shows the same state with only relative paths stored.
// Run: node scripts/verify-portability.ts (VERIFY_SKIP_BUILD=1 reuses .next)
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  assert,
  check,
  getJob,
  getStatus,
  postJob,
  step,
  waitJob,
} from './lib/jobs.ts';
import {
  buildApp,
  getFreePort,
  makeTempDir,
  runMain,
  type ServerHandle,
  startServer,
} from './lib/server.ts';

const PROBE = 'photos/portability-probe.txt';

async function start(dataDir: string): Promise<ServerHandle> {
  return startServer({
    mode: 'start',
    port: await getFreePort(),
    env: { DATA_DIR: dataDir, APP_TEST_HOOKS: '1' },
  });
}

function assertNoWal(dir: string): void {
  for (const f of ['app.db-wal', 'app.db-shm']) {
    assert(!fs.existsSync(path.join(dir, f)), `${f} remains in ${dir}`);
  }
}

runMain('verify-portability', async (onCleanup) => {
  const tmpA = await makeTempDir('verify-port-a');
  const tmpB = await makeTempDir('verify-port-b');
  onCleanup(() => fs.rmSync(tmpA, { recursive: true, force: true }));
  onCleanup(() => fs.rmSync(tmpB, { recursive: true, force: true }));
  const folderA = path.join(tmpA, 'data');
  const folderB = path.join(tmpB, 'moved', 'data');
  const servers: ServerHandle[] = [];
  onCleanup(async () => {
    for (const s of servers) await s.stop('SIGKILL');
  });

  step('build');
  await buildApp();

  step('(1) run jobs on folder A');
  const a = await start(folderA);
  servers.push(a);
  const probeId = await postJob(a.port, { writeFile: PROBE });
  const others = [
    await postJob(a.port, { ms: 0 }),
    await postJob(a.port, { ms: 0 }),
  ];
  for (const id of [probeId, ...others]) {
    await waitJob(a.port, id, 'job succeeded', (j) => j.status === 'succeeded');
  }
  const before = (await getStatus(a.port)).jobs;
  check(`3 jobs succeeded on A: ${JSON.stringify(before.anthropic)}`);

  step('(2) SIGTERM, copy A to B, delete A');
  await a.stop('SIGTERM');
  assertNoWal(folderA);
  check('no -wal/-shm after SIGTERM');
  fs.mkdirSync(path.dirname(folderB), { recursive: true });
  fs.cpSync(folderA, folderB, { recursive: true });
  fs.rmSync(folderA, { recursive: true, force: true });
  assert(!fs.existsSync(folderA), 'folder A still exists');
  check(`copied to ${folderB} and deleted the original`);

  step('(3) start on folder B');
  const b = await start(folderB);
  servers.push(b);
  const after = (await getStatus(b.port)).jobs;
  assert(
    JSON.stringify(after) === JSON.stringify(before),
    `job counts differ: before ${JSON.stringify(before)} after ${JSON.stringify(after)}`,
  );
  check('job counts identical after the move');
  const probePath = path.join(folderB, PROBE);
  assert(fs.existsSync(probePath), `${probePath} missing`);
  const content = fs.readFileSync(probePath, 'utf8');
  assert(
    content === `${probeId}\n`,
    `probe file holds ${JSON.stringify(content)}, expected the job id`,
  );
  check('probe file moved with the folder and holds the job id');
  const probe = await getJob(b.port, probeId);
  assert(
    probe.payload.writeFile === PROBE,
    `probe payload writeFile is ${JSON.stringify(probe.payload.writeFile)}`,
  );
  check('stored payload path is still relative');

  step('(4) no absolute path of folder A stored in app.db');
  await b.stop('SIGTERM');
  assertNoWal(folderB);
  const db = new Database(path.join(folderB, 'app.db'), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const tables = (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        )
        .all() as { name: string }[]
    ).map((t) => t.name);
    assert(
      tables.includes('jobs') && tables.includes('settings'),
      `unexpected tables: ${tables.join(', ')}`,
    );
    let scanned = 0;
    for (const table of tables) {
      const cols = (
        db.prepare(`PRAGMA table_info("${table}")`).all() as {
          name: string;
          type: string;
        }[]
      ).filter((c) => /TEXT|^$/i.test(c.type));
      for (const col of cols) {
        const hit = db
          .prepare(
            `SELECT COUNT(*) AS n FROM "${table}" WHERE instr("${col.name}", ?) > 0 OR instr("${col.name}", ?) > 0`,
          )
          .get(folderA, tmpA) as { n: number };
        assert(hit.n === 0, `${table}.${col.name} contains ${folderA}`);
        scanned++;
      }
    }
    check(`${scanned} text columns scanned, none contains ${folderA}`);
  } finally {
    db.close();
  }

  step('(5) a job path escaping DATA_DIR fails and writes nothing');
  const b2 = await start(folderB);
  servers.push(b2);
  const escId = await postJob(b2.port, { writeFile: '../escape.txt' });
  const esc = await waitJob(
    b2.port,
    escId,
    'escape job failed',
    (j) => j.status === 'failed',
    30_000,
  );
  assert(
    esc.lastError?.includes('path escapes DATA_DIR'),
    `escape job lastError is ${JSON.stringify(esc.lastError)}`,
  );
  const escaped = path.join(folderB, '..', 'escape.txt');
  assert(!fs.existsSync(escaped), `${escaped} was written`);
  check('escape job failed with "path escapes DATA_DIR" and wrote nothing');
  await b2.stop('SIGTERM');
});
