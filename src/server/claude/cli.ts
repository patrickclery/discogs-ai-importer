import 'server-only';
import os from 'node:os';
import { z } from 'zod';
import { runProcess } from '../proc/run';
import { SECRET_ENV_NAMES } from '../secrets';

// Claude Code CLI integration (D-10, D-18). Vision runs through the owner's
// Claude subscription by spawning `claude` headless; there is no API key and
// no SDK. Every spawn here:
//   - goes through runProcess (argv array, no shell, timeout, group kill)
//   - uses buildClaudeEnv(), which drops ANTHROPIC_API_KEY and app secrets
//   - runs from os.tmpdir(), so no project CLAUDE.md or settings are loaded
//   - uses the CLI's normal auth path; the minimal mode (API-key-only auth)
//     is never used

const STATUS_TIMEOUT_MS = 10_000;
const REASON_MAX = 160;

/** Variables that would make the CLI bill an API account instead of the plan. */
const API_BILLING_ENV = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'] as const;

export function claudeBin(): string {
  return process.env.CLAUDE_BIN || 'claude';
}

/** Copy of the env without API-billing variables or any app secret. */
export function buildClaudeEnv(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  for (const name of API_BILLING_ENV) delete env[name];
  for (const name of Object.values(SECRET_ENV_NAMES)) delete env[name];
  return env;
}

export type ClaudeAuthState =
  | 'subscription'
  | 'other'
  | 'logged-out'
  | 'unknown';

export type ClaudeCliStatus = {
  installed: boolean;
  version: string | null;
  auth: {
    state: ClaudeAuthState;
    authMethod: string | null;
    subscriptionType: string | null;
    reason: string | null;
  };
  apiKeyInEnv: boolean;
  checkedAt: number;
};

// Only these fields survive parsing; email and org fields are dropped here.
const AuthStatusSchema = z.object({
  loggedIn: z.boolean(),
  authMethod: z.string().nullish(),
  subscriptionType: z.string().nullish(),
});

function cut(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > REASON_MAX ? t.slice(0, REASON_MAX) : t;
}

function firstLine(s: string): string {
  return (
    s
      .split('\n')
      .find((l) => l.trim())
      ?.trim() ?? ''
  );
}

function duration(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${Math.round(ms / 100) / 10} s`;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text.trim());
  } catch {
    return undefined;
  }
}

function run(args: string[], timeoutMs: number) {
  return runProcess({
    command: claudeBin(),
    args,
    env: buildClaudeEnv(),
    cwd: os.tmpdir(),
    timeoutMs,
  });
}

const g = globalThis as unknown as {
  __claudeCliStatus?: Map<string, ClaudeCliStatus>;
};
if (!g.__claudeCliStatus)
  g.__claudeCliStatus = new Map<string, ClaudeCliStatus>();
const cache = g.__claudeCliStatus;

export function clearClaudeCliStatusCache(): void {
  cache.clear();
}

/** Installed version and login state. maxAgeMs 0 (default) always re-checks. */
export async function getClaudeCliStatus(
  opts: { maxAgeMs?: number; timeoutMs?: number } = {},
): Promise<ClaudeCliStatus> {
  const bin = claudeBin();
  const maxAgeMs = opts.maxAgeMs ?? 0;
  const cached = cache.get(bin);
  if (cached && maxAgeMs > 0 && Date.now() - cached.checkedAt < maxAgeMs) {
    return cached;
  }

  const timeoutMs = opts.timeoutMs ?? STATUS_TIMEOUT_MS;
  const [ver, auth] = await Promise.all([
    run(['--version'], timeoutMs),
    run(['auth', 'status', '--json'], timeoutMs),
  ]);
  const apiKeyInEnv = Boolean(process.env.ANTHROPIC_API_KEY?.trim());

  let status: ClaudeCliStatus;
  if (ver.spawnError) {
    status = {
      installed: false,
      version: null,
      auth: {
        state: 'unknown',
        authMethod: null,
        subscriptionType: null,
        reason: cut(`the CLI could not be started (${ver.spawnError.code})`),
      },
      apiKeyInEnv,
      checkedAt: Date.now(),
    };
  } else {
    const token = ver.exitCode === 0 ? ver.stdout.trim().split(/\s+/)[0] : '';
    status = {
      installed: true,
      version: token ? cut(token) : null,
      auth: readAuth(auth, timeoutMs),
      apiKeyInEnv,
      checkedAt: Date.now(),
    };
  }
  cache.set(bin, status);
  return status;
}

function readAuth(
  res: Awaited<ReturnType<typeof runProcess>>,
  timeoutMs: number,
): ClaudeCliStatus['auth'] {
  const unknown = (reason: string): ClaudeCliStatus['auth'] => ({
    state: 'unknown',
    authMethod: null,
    subscriptionType: null,
    reason: cut(reason),
  });
  if (res.timedOut) return unknown(`timed out after ${duration(timeoutMs)}`);
  if (res.spawnError)
    return unknown(`could not start (${res.spawnError.code})`);
  // The CLI may exit non-zero when logged out but still print the JSON.
  const parsed = AuthStatusSchema.safeParse(parseJson(res.stdout));
  if (!parsed.success) {
    const detail = firstLine(res.stderr);
    return unknown(detail || 'unreadable CLI output');
  }
  const { loggedIn, authMethod, subscriptionType } = parsed.data;
  const base = {
    authMethod: authMethod ? cut(authMethod) : null,
    subscriptionType: subscriptionType ? cut(subscriptionType) : null,
    reason: null,
  };
  if (!loggedIn) return { state: 'logged-out', ...base };
  if (authMethod === 'claude.ai') return { state: 'subscription', ...base };
  return { state: 'other', ...base };
}

/** Installed and logged in by any method (API billing shows its own warning). */
export function isClaudeReady(s: ClaudeCliStatus): boolean {
  return (
    s.installed && (s.auth.state === 'subscription' || s.auth.state === 'other')
  );
}

// ---------------------------------------------------------------------------
// Test Claude (D-10): one tiny headless call through the subscription.

export const TEST_PROMPT = 'Reply with exactly the word OK and nothing else.';
const TEST_TIMEOUT_MS = 60_000;
const MODEL_ID = /^[a-z0-9][a-z0-9.-]*$/;
const LOGIN_HINT = /log ?in|\/login|authenticat/i;

/** argv for the test call. Never includes the minimal (API-key-only) mode. */
export function buildTestArgs(model: string): string[] {
  return [
    '-p',
    TEST_PROMPT,
    '--output-format',
    'json',
    '--model',
    model,
    '--no-session-persistence',
    '--strict-mcp-config',
  ];
}

export type TestResult =
  | { ok: true; model: string; message: string }
  | {
      ok: false;
      kind: 'not-installed' | 'not-logged-in' | 'timeout' | 'failed';
      message: string;
    };

const ResultSchema = z.object({
  type: z.string().optional(),
  subtype: z.string().optional(),
  is_error: z.boolean(),
  result: z.string().optional(),
  modelUsage: z.record(z.string(), z.unknown()).optional(),
});

const NOT_INSTALLED: TestResult = {
  ok: false,
  kind: 'not-installed',
  message: 'Claude CLI not found. Install Claude Code, then try again.',
};
const NOT_LOGGED_IN: TestResult = {
  ok: false,
  kind: 'not-logged-in',
  message:
    "The Claude CLI isn't logged in. Run claude auth login in a terminal, then try again.",
};
const TIMED_OUT: TestResult = {
  ok: false,
  kind: 'timeout',
  message: "Claude didn't answer within 60 seconds. Try again in a moment.",
};

function failed(reason: string): TestResult {
  const r = cut(reason).replace(/[.\s]+$/, '') || 'unknown error';
  return {
    ok: false,
    kind: 'failed',
    message: `Test failed: ${r}. Try again in a moment.`,
  };
}

function answeringModel(
  requested: string,
  usage: Record<string, unknown> | undefined,
): string {
  const keys = Object.keys(usage ?? {});
  return (
    keys.find((k) => k.startsWith(requested)) ??
    keys[0] ??
    requested
  ).slice(0, 80);
}

/** Runs one headless `claude -p` call and maps every outcome to copy. */
export async function testClaude(opts: {
  model: string;
  timeoutMs?: number;
}): Promise<TestResult> {
  if (!MODEL_ID.test(opts.model)) return failed('invalid model id');

  const status = await getClaudeCliStatus({ maxAgeMs: 0 });
  if (!status.installed) return NOT_INSTALLED;
  if (status.auth.state === 'logged-out') return NOT_LOGGED_IN;

  const res = await run(
    buildTestArgs(opts.model),
    opts.timeoutMs ?? TEST_TIMEOUT_MS,
  );
  if (res.spawnError) {
    return res.spawnError.code === 'ENOENT'
      ? NOT_INSTALLED
      : failed(`could not start the CLI (${res.spawnError.code})`);
  }
  if (res.timedOut) return TIMED_OUT;

  const parsed = ResultSchema.safeParse(parseJson(res.stdout));
  if (!parsed.success) {
    if (res.exitCode !== 0) {
      const line = firstLine(res.stderr);
      if (LOGIN_HINT.test(line)) return NOT_LOGGED_IN;
      return failed(line || `the CLI exited with code ${res.exitCode}`);
    }
    return failed('unreadable CLI output');
  }
  const out = parsed.data;
  if (out.is_error) {
    const text =
      out.result?.trim() || out.subtype || 'the CLI reported an error';
    return LOGIN_HINT.test(text) ? NOT_LOGGED_IN : failed(text);
  }
  if (res.exitCode !== 0) {
    return failed(`the CLI exited with code ${res.exitCode}`);
  }
  if (!out.result?.trim()) return failed('empty answer');

  const model = answeringModel(opts.model, out.modelUsage);
  return {
    ok: true,
    model,
    message: `Claude works. ${model} answered through your subscription.`,
  };
}
