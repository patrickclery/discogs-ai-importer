import 'server-only';
import { type ChildProcess, spawn } from 'node:child_process';

// Child process runner (D-18). Used for every `claude` invocation now and by
// Phase 2's vision job under the worker's per-job timeout and AbortSignal.
// Always an argv array with no shell; the child leads its own process group
// so a timeout or abort can kill it together with anything it started.

export type RunResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  aborted: boolean;
  spawnError?: { code: string; message: string };
};

export type RunOptions = {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs: number;
  signal?: AbortSignal;
  /** Max characters kept per stream; the rest is dropped. */
  maxBuffer?: number;
};

const KILL_GRACE_MS = 3000;
/** How long to wait for stdio to close after the child itself exited. */
const CLOSE_GRACE_MS = 1000;
const IS_WINDOWS = process.platform === 'win32';

// Live children, shared across module copies (instrumentation and route graphs).
const g = globalThis as unknown as {
  __procChildren?: Set<ChildProcess>;
  __procExitHook?: boolean;
};
if (!g.__procChildren) g.__procChildren = new Set<ChildProcess>();
const children = g.__procChildren;

function killTree(child: ChildProcess, sig: NodeJS.Signals): void {
  const pid = child.pid;
  if (pid === undefined) return;
  try {
    if (IS_WINDOWS) child.kill(sig);
    else process.kill(-pid, sig);
  } catch {
    // already gone
  }
}

function installExitHook(): void {
  if (g.__procExitHook) return;
  g.__procExitHook = true;
  // No claude process may outlive the server on a clean stop.
  process.once('exit', () => {
    for (const child of children) killTree(child, 'SIGKILL');
  });
}

function errorCode(err: unknown): string {
  return typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code: unknown }).code)
    : 'UNKNOWN';
}

/** Runs a command; resolves (never rejects) once it has finished or been killed. */
export async function runProcess(opts: RunOptions): Promise<RunResult> {
  const maxBuffer = opts.maxBuffer ?? 1_000_000;
  if (opts.signal?.aborted) {
    return {
      exitCode: null,
      signal: null,
      stdout: '',
      stderr: '',
      timedOut: false,
      aborted: true,
    };
  }
  installExitHook();

  return new Promise<RunResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let aborted = false;
    let settled = false;
    let exitInfo: { code: number | null; signal: NodeJS.Signals | null } = {
      code: null,
      signal: null,
    };
    let killTimer: NodeJS.Timeout | undefined;
    let closeTimer: NodeJS.Timeout | undefined;

    let child: ChildProcess;
    try {
      child = spawn(opts.command, opts.args, {
        cwd: opts.cwd,
        env: opts.env ?? process.env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: !IS_WINDOWS,
        windowsHide: true,
      });
    } catch (err) {
      resolve({
        exitCode: null,
        signal: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        aborted: false,
        spawnError: {
          code: errorCode(err),
          message: err instanceof Error ? err.message : String(err),
        },
      });
      return;
    }
    children.add(child);

    const terminate = () => {
      killTree(child, 'SIGTERM');
      killTimer ??= setTimeout(() => killTree(child, 'SIGKILL'), KILL_GRACE_MS);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, opts.timeoutMs);
    const onAbort = () => {
      aborted = true;
      terminate();
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    const finish = (spawnError?: RunResult['spawnError']) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      clearTimeout(closeTimer);
      opts.signal?.removeEventListener('abort', onAbort);
      children.delete(child);
      // Sweep any process the child left in its group.
      if (!spawnError) killTree(child, 'SIGKILL');
      resolve({
        exitCode: exitInfo.code,
        signal: exitInfo.signal,
        stdout,
        stderr,
        timedOut,
        aborted,
        ...(spawnError ? { spawnError } : {}),
      });
    };

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (d: string) => {
      if (stdout.length < maxBuffer) stdout = (stdout + d).slice(0, maxBuffer);
    });
    child.stderr?.on('data', (d: string) => {
      if (stderr.length < maxBuffer) stderr = (stderr + d).slice(0, maxBuffer);
    });

    child.on('error', (err) => {
      // Spawn failures (ENOENT, EACCES) arrive here with no exit event.
      if (child.pid === undefined) {
        finish({ code: errorCode(err), message: err.message });
      }
    });
    child.on('exit', (code, signal) => {
      exitInfo = { code, signal };
      // A grandchild may hold the pipes open; do not wait on it forever.
      closeTimer = setTimeout(() => finish(), CLOSE_GRACE_MS);
    });
    child.on('close', (code, signal) => {
      if (exitInfo.code === null && exitInfo.signal === null) {
        exitInfo = { code, signal };
      }
      finish();
    });
  });
}
