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
