// Criterion 4a and FOUND-04 hardening: kill -9 restart, backoff, two processes,
// clean stop. Run: node scripts/verify-restart.ts (VERIFY_SKIP_BUILD=1 reuses .next)
import fs from 'node:fs';
import path from 'node:path';
import {
  assert,
  check,
  getJob,
  getStatus,
  listJobs,
  postJob,
  sleep,
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
  waitFor,
} from './lib/server.ts';

async function start(dataDir: string): Promise<ServerHandle> {
  return startServer({
    mode: 'start',
    port: await getFreePort(),
    env: { DATA_DIR: dataDir, APP_TEST_HOOKS: '1' },
  });
}

runMain('verify-restart', async (onCleanup) => {
  const tmp = await makeTempDir('verify-restart');
  onCleanup(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const dataDir = path.join(tmp, 'data');
  const servers: ServerHandle[] = [];
  onCleanup(async () => {
    for (const s of servers) await s.stop('SIGKILL');
  });

  step('build');
  await buildApp();

  // Scenario A: kill -9 mid-job (D-14, criterion 4).
  step('(A) kill -9 while a job runs, then restart');
  const a = await start(dataDir);
  servers.push(a);
  const statusA = await getStatus(a.port);
  assert(statusA.worker, 'server A has no worker');
  const j1 = await postJob(a.port, { ms: 6000 });
  const j2 = await postJob(a.port, { ms: 0 });
  const j3 = await postJob(a.port, { ms: 0 });
  await waitJob(a.port, j1, 'J1 running', (j) => j.status === 'running');
  const killed = await a.stop('SIGKILL');
  assert(
    killed.signal === 'SIGKILL',
    `A exited with ${JSON.stringify(killed)}`,
  );
  check('server A SIGKILLed while J1 was running');

  const a2 = await start(dataDir);
  servers.push(a2);
  await waitFor(
    'J1, J2, J3 succeeded',
    async () => {
      const jobs = await listJobs(a2.port);
      return jobs.every((j) => j.status === 'succeeded') && jobs.length === 3
        ? jobs
        : undefined;
    },
    { timeoutMs: 30_000, intervalMs: 250 },
  );
  const jobsA = await listJobs(a2.port);
  assert(jobsA.length === 3, `expected 3 job rows, found ${jobsA.length}`);
  const [r1, r2, r3] = await Promise.all(
    [j1, j2, j3].map((id) => getJob(a2.port, id)),
  );
  assert(r1.attempts === 2, `J1 attempts ${r1.attempts}, expected 2`);
  assert(r2.attempts === 1, `J2 attempts ${r2.attempts}, expected 1`);
  assert(r3.attempts === 1, `J3 attempts ${r3.attempts}, expected 1`);
  check('attempts J1=2 J2=1 J3=1, exactly 3 rows, all succeeded once');
  const statusA2 = await getStatus(a2.port);
  assert(statusA2.worker, 'server A2 has no worker');
  assert(
    statusA2.worker.bootId !== statusA.worker.bootId,
    'A2 reused the bootId of the killed server',
  );
  check('restarted worker has a new bootId');

  // Scenario B: retry with backoff ends in a stable state (D-14).
  step('(B) backoff: failTimes 2 succeeds on attempt 3, failTimes 5 fails');
  const j4 = await postJob(a2.port, { failTimes: 2 });
  const j5 = await postJob(a2.port, { failTimes: 5 });
  const r4 = await waitJob(
    a2.port,
    j4,
    'J4 succeeded',
    (j) => j.status === 'succeeded',
  );
  assert(r4.attempts === 3, `J4 attempts ${r4.attempts}, expected 3`);
  const r5 = await waitJob(
    a2.port,
    j5,
    'J5 failed',
    (j) => j.status === 'failed',
  );
  assert(r5.attempts === 3, `J5 attempts ${r5.attempts}, expected 3`);
  assert(r5.lastError, 'J5 lastError is empty');
  check(`J4 succeeded on attempt 3; J5 failed after 3 ("${r5.lastError}")`);
  await sleep(5000);
  const r5b = await getJob(a2.port, j5);
  assert(
    r5b.status === 'failed' && r5b.attempts === 3,
    `J5 changed after failing: ${r5b.status}/${r5b.attempts}`,
  );
  check('J5 still failed with attempts 3 after 5 s (no further runs)');

  // Scenario C: a second process on the same DATA_DIR (RESEARCH Pitfall 6).
  step('(C) two processes: only the lease holder runs a worker');
  const b = await start(dataDir);
  servers.push(b);
  const statusB = await getStatus(b.port);
  assert(statusB.worker === null, 'second process started its own worker');
  assert(
    statusB.lease?.pid === statusA2.worker.pid,
    `lease pid ${statusB.lease?.pid}, expected A2 pid ${statusA2.worker.pid}`,
  );
  check('two processes: B reports worker null and A2 as lease holder');
  const j6 = await postJob(b.port, { ms: 0 });
  await waitJob(b.port, j6, 'J6 succeeded', (j) => j.status === 'succeeded');
  check('J6 enqueued through B ran on A2');
  await a2.stop('SIGKILL');
  const takeover = await waitFor(
    'B takes over the worker',
    async () => {
      const s = await getStatus(b.port);
      return s.worker ? s : undefined;
    },
    { timeoutMs: 10_000, intervalMs: 250 },
  );
  assert(
    takeover.lease?.bootId === takeover.worker?.bootId,
    'B runs a worker but does not hold the lease',
  );
  check('two processes: B took over within 10 s of A2 being SIGKILLed');
  const j7 = await postJob(b.port, { ms: 0 });
  const r7 = await waitJob(
    b.port,
    j7,
    'J7 succeeded',
    (j) => j.status === 'succeeded',
  );
  assert(r7.attempts === 1, `J7 attempts ${r7.attempts}, expected 1`);
  check('J7 ran on B');

  // Scenario D: clean stop checkpoints the WAL (RESEARCH Pitfall 4).
  step('(D) SIGTERM leaves only app.db');
  await b.stop('SIGTERM');
  const files = fs.readdirSync(dataDir);
  assert(files.includes('app.db'), 'app.db missing after SIGTERM');
  for (const f of ['app.db-wal', 'app.db-shm']) {
    assert(!files.includes(f), `${f} remains after SIGTERM`);
  }
  check('no app.db-wal or app.db-shm after SIGTERM');
});
