// End-to-end harness shared by every verify-* script.
// Node built-ins only; imports nothing from src/.
import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const NEXT_BIN = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');

export type ServerHandle = {
  pid: number;
  port: number;
  baseUrl: string;
  logs(): string;
  stop(
    signal?: NodeJS.Signals,
  ): Promise<{ code: number | null; signal: string | null }>;
};

export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (!addr || typeof addr === 'string') {
        srv.close();
        reject(new Error('could not determine free port'));
        return;
      }
      const { port } = addr;
      srv.close(() => resolve(port));
    });
  });
}

export function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
}

function baseEnv(env: Record<string, string>): NodeJS.ProcessEnv {
  return { ...process.env, NEXT_TELEMETRY_DISABLED: '1', ...env };
}

export function buildApp(env: Record<string, string> = {}): Promise<void> {
  if (process.env.VERIFY_SKIP_BUILD === '1') {
    console.log('SKIP: build (VERIFY_SKIP_BUILD=1)');
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [NEXT_BIN, 'build'], {
      cwd: ROOT,
      env: baseEnv(env),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout?.on('data', (d) => {
      out += d;
    });
    child.stderr?.on('data', (d) => {
      out += d;
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`next build exited ${code}\n${out.slice(-4000)}`));
    });
  });
}

export async function startServer(opts: {
  mode: 'start' | 'dev';
  port: number;
  env: Record<string, string>;
  readyPath?: string;
  timeoutMs?: number;
}): Promise<ServerHandle> {
  const readyPath = opts.readyPath ?? '/api/status';
  const child: ChildProcess = spawn(
    process.execPath,
    [NEXT_BIN, opts.mode, '-H', '127.0.0.1', '-p', String(opts.port)],
    {
      cwd: ROOT,
      env: baseEnv(opts.env),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let log = '';
  child.stdout?.on('data', (d) => {
    log += d;
  });
  child.stderr?.on('data', (d) => {
    log += d;
  });
  let exited: { code: number | null; signal: string | null } | undefined;
  const exitPromise = new Promise<{
    code: number | null;
    signal: string | null;
  }>((resolve) => {
    child.on('exit', (code, signal) => {
      exited = { code, signal };
      resolve(exited);
    });
  });

  const handle: ServerHandle = {
    pid: child.pid ?? -1,
    port: opts.port,
    baseUrl: `http://127.0.0.1:${opts.port}`,
    logs: () => log,
    async stop(signal: NodeJS.Signals = 'SIGTERM') {
      if (exited) return exited;
      child.kill(signal);
      const timeout = new Promise<void>((r) => setTimeout(r, 10_000).unref());
      const res = await Promise.race([exitPromise, timeout]);
      if (res) return res;
      child.kill('SIGKILL');
      return exitPromise;
    },
  };

  try {
    await waitFor(
      `server ready on ${readyPath}`,
      async () => {
        if (exited) {
          throw new Error(
            `server exited early (${JSON.stringify(exited)})\n${log.slice(-4000)}`,
          );
        }
        try {
          const res = await httpRequest({
            port: opts.port,
            path: readyPath,
            timeoutMs: 5000,
          });
          return res.status === 200 ? true : undefined;
        } catch {
          return undefined;
        }
      },
      { timeoutMs: opts.timeoutMs ?? 60_000, intervalMs: 250 },
    );
  } catch (err) {
    await handle.stop('SIGKILL');
    throw err;
  }
  return handle;
}

export function httpRequest(opts: {
  port: number;
  method?: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  host?: string;
}): Promise<{
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.body !== undefined && !headers['content-type']) {
      headers['content-type'] = 'application/json';
    }
    const req = http.request(
      {
        host: opts.host ?? '127.0.0.1',
        port: opts.port,
        method: opts.method ?? 'GET',
        path: opts.path,
        headers,
        timeout: opts.timeoutMs ?? 10_000,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body }),
        );
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('request timed out')));
    req.on('error', reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

export async function waitFor<T>(
  label: string,
  fn: () => Promise<T | undefined>,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const deadline = Date.now() + (opts.timeoutMs ?? 15_000);
  const interval = opts.intervalMs ?? 200;
  for (;;) {
    const v = await fn();
    if (v !== undefined) return v;
    if (Date.now() > deadline)
      throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, interval));
  }
}

export function runMain(
  name: string,
  fn: (onCleanup: (f: () => Promise<void> | void) => void) => Promise<void>,
): void {
  const cleanups: Array<() => Promise<void> | void> = [];
  const onCleanup = (f: () => Promise<void> | void) => {
    cleanups.push(f);
  };
  const runCleanups = async () => {
    for (const f of cleanups.reverse()) {
      try {
        await f();
      } catch (err) {
        console.error('cleanup error:', err);
      }
    }
  };
  fn(onCleanup)
    .then(async () => {
      await runCleanups();
      console.log(`${name} OK`);
      process.exit(0);
    })
    .catch(async (err: unknown) => {
      await runCleanups();
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAIL: ${msg}`);
      process.exit(1);
    });
}
