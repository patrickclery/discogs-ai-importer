// End-to-end proof of the Host/Origin loopback guard (Plan 01-06, T-01-02).
// Run: node scripts/verify-guard.ts   (VERIFY_SKIP_BUILD=1 reuses .next)
import fs from 'node:fs';
import path from 'node:path';
import {
  buildApp,
  getFreePort,
  httpRequest,
  makeTempDir,
  runMain,
  startServer,
} from './lib/server.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function step(label: string) {
  console.log(`-- ${label}`);
}

async function expectStatus(
  label: string,
  port: number,
  req: {
    method?: 'GET' | 'POST';
    path: string;
    headers?: Record<string, string>;
    body?: string;
  },
  expected: number,
): Promise<void> {
  const res = await httpRequest({ port, ...req });
  assert(
    res.status === expected,
    `${label}: ${req.method ?? 'GET'} ${req.path} returned ${res.status}, expected ${expected}`,
  );
  console.log(`   ${label}: ${res.status}`);
}

const JOB_BODY = JSON.stringify({ payload: { ms: 0 } });

// (a) same-host GETs pass, with or without the port in Host.
export async function stepHostAllowed(port: number): Promise<void> {
  step('(a) allowed Host headers pass');
  await expectStatus('default Host', port, { path: '/api/status' }, 200);
  await expectStatus(
    'Host localhost:PORT',
    port,
    { path: '/api/status', headers: { host: `localhost:${port}` } },
    200,
  );
}

// (b) DNS-rebinding style Host headers are refused.
export async function stepHostForeign(port: number): Promise<void> {
  step('(b) foreign Host headers get 403');
  for (const host of ['evil.test', '127.0.0.1.evil.test']) {
    await expectStatus(
      `Host ${host}`,
      port,
      { path: '/api/status', headers: { host } },
      403,
    );
  }
}

// (c) mutations from foreign or malformed Origins are refused.
export async function stepOriginForeign(port: number): Promise<void> {
  step('(c) foreign or malformed Origin on POST gets 403');
  for (const origin of ['http://evil.test', 'not a url']) {
    await expectStatus(
      `POST Origin ${JSON.stringify(origin)}`,
      port,
      {
        method: 'POST',
        path: '/api/dev/jobs',
        headers: { origin },
        body: JOB_BODY,
      },
      403,
    );
  }
}

// (d) same-origin and Origin-less mutations pass.
export async function stepOriginAllowed(port: number): Promise<void> {
  step('(d) same-origin and Origin-less POSTs pass');
  await expectStatus(
    'POST Origin localhost:PORT',
    port,
    {
      method: 'POST',
      path: '/api/dev/jobs',
      headers: { origin: `http://localhost:${port}` },
      body: JOB_BODY,
    },
    201,
  );
  await expectStatus(
    'POST without Origin',
    port,
    { method: 'POST', path: '/api/dev/jobs', body: JOB_BODY },
    201,
  );
}

// (e) only non-GET/HEAD requests are Origin-checked.
export async function stepGetIgnoresOrigin(port: number): Promise<void> {
  step('(e) GET with a foreign Origin passes');
  await expectStatus(
    'GET Origin http://evil.test',
    port,
    { path: '/api/status', headers: { origin: 'http://evil.test' } },
    200,
  );
}

runMain('verify-guard', async (onCleanup) => {
  const tmp = await makeTempDir('verify-guard');
  onCleanup(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const dataDir = path.join(tmp, 'data');
  const port = await getFreePort();

  await buildApp({ DATA_DIR: path.join(tmp, 'build-data') });

  step(`next start on 127.0.0.1:${port} (APP_TEST_HOOKS=1)`);
  const server = await startServer({
    mode: 'start',
    port,
    env: { DATA_DIR: dataDir, APP_TEST_HOOKS: '1' },
  });
  onCleanup(async () => {
    await server.stop('SIGKILL');
  });

  await stepHostAllowed(port);
  await stepHostForeign(port);
  await stepOriginForeign(port);
  await stepOriginAllowed(port);
  await stepGetIgnoresOrigin(port);

  step('stop');
  await server.stop('SIGTERM');
});
