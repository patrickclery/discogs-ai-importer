// Criterion 4b / D-13: editing files under `next dev` never starts a second
// worker. Run: node scripts/verify-hmr.ts
import fs from 'node:fs';
import path from 'node:path';
import {
  assert,
  check,
  getStatus,
  listJobs,
  postJob,
  sleep,
  step,
  waitJob,
} from './lib/jobs.ts';
import {
  getFreePort,
  httpRequest,
  makeTempDir,
  runMain,
  type ServerHandle,
  startServer,
} from './lib/server.ts';

const TOUCHED = [
  'src/server/jobs/worker.ts',
  'src/app/page.tsx',
  'src/instrumentation.ts',
].map((f) => path.join(process.cwd(), f));

const originals = new Map<string, Buffer>();

/** Byte-for-byte restore; safe to call more than once. */
function restoreFiles(): void {
  for (const [file, bytes] of originals) fs.writeFileSync(file, bytes);
  originals.clear();
}

function onSigint(): void {
  restoreFiles();
  process.exit(130);
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

runMain('verify-hmr', async (onCleanup) => {
  const tmp = await makeTempDir('verify-hmr');
  onCleanup(() => fs.rmSync(tmp, { recursive: true, force: true }));
  let server: ServerHandle | undefined;
  onCleanup(async () => {
    await server?.stop('SIGTERM');
  });
  // Cleanups run in reverse, so files are restored before dev stops.
  onCleanup(restoreFiles);
  process.once('SIGINT', onSigint);
  onCleanup(() => {
    process.off('SIGINT', onSigint);
  });

  step('(1) next dev on a temp DATA_DIR');
  const port = await getFreePort();
  server = await startServer({
    mode: 'dev',
    port,
    env: { DATA_DIR: path.join(tmp, 'data') },
    timeoutMs: 120_000,
  });
  const before = await getStatus(port);
  assert(before.worker, 'dev server has no worker');
  assert(before.worker.starts === 1, `starts is ${before.worker.starts}`);
  const home = await httpRequest({ port, path: '/', timeoutMs: 60_000 });
  assert(home.status < 500, `GET / returned ${home.status}`);
  check(`worker ${before.worker.bootId} (pid ${before.worker.pid}) starts=1`);

  step('(2) edit worker.ts, page.tsx and instrumentation.ts');
  try {
    for (const file of TOUCHED) {
      const bytes = fs.readFileSync(file);
      originals.set(file, bytes);
      fs.writeFileSync(
        file,
        Buffer.concat([
          bytes,
          Buffer.from(`// verify-hmr touch ${Date.now()}\n`),
        ]),
      );
    }
    await sleep(4000);
    const home2 = await httpRequest({ port, path: '/', timeoutMs: 60_000 });
    assert(home2.status < 500, `GET / after edits returned ${home2.status}`);
    const after = await getStatus(port);
    assert(after.worker, 'worker disappeared after hot reload');
    assert(
      after.worker.bootId === before.worker.bootId,
      `bootId changed: ${before.worker.bootId} -> ${after.worker.bootId}`,
    );
    assert(after.worker.starts === 1, `starts is ${after.worker.starts}`);
    assert(
      after.worker.pid === before.worker.pid,
      `worker pid changed: ${before.worker.pid} -> ${after.worker.pid}`,
    );
    assert(isAlive(server.pid), `server pid ${server.pid} is gone`);
    check('same bootId, starts=1, same worker pid and server pid');

    step('(3) a job queued after the reload runs exactly once');
    const id = await postJob(port, { ms: 0 });
    const job = await waitJob(
      port,
      id,
      'job succeeded',
      (j) => j.status === 'succeeded',
    );
    assert(job.attempts === 1, `attempts ${job.attempts}, expected 1`);
    const copies = (await listJobs(port)).filter((j) => j.id === id);
    assert(copies.length === 1, `job appears ${copies.length} times`);
    check('job succeeded with attempts 1 and appears once');
  } finally {
    restoreFiles();
  }
});
