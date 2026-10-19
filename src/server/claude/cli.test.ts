import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runProcess } from '../proc/run';
import {
  buildClaudeEnv,
  clearClaudeCliStatusCache,
  getClaudeCliStatus,
} from './cli';

const FAKE = path.resolve(
  import.meta.dirname,
  '../../../test/fixtures/fake-claude.mjs',
);
const FAKE_EMAIL = 'fake-owner@example.invalid';
const FAKE_ORG = 'Fake Org Name';
const ENV_KEYS = [
  'CLAUDE_BIN',
  'FAKE_CLAUDE_MODE',
  'FAKE_CLAUDE_LOG',
  'FAKE_CLAUDE_ERROR_TEXT',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'DISCOGS_CONSUMER_KEY',
  'DISCOGS_CONSUMER_SECRET',
] as const;

type LogEntry = {
  argv: string[];
  cwd: string;
  pid: number;
  env: Record<string, boolean>;
};

function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Points CLAUDE_BIN at the fake and gives each test its own log file. */
function useFakeClaude() {
  let dir = '';
  const saved: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-fake-claude-'));
    process.env.CLAUDE_BIN = FAKE;
    process.env.FAKE_CLAUDE_LOG = path.join(dir, 'log.jsonl');
    clearClaudeCliStatusCache();
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    clearClaudeCliStatusCache();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  return {
    setMode(mode: string) {
      process.env.FAKE_CLAUDE_MODE = mode;
    },
    log(): LogEntry[] {
      const file = process.env.FAKE_CLAUDE_LOG as string;
      if (!fs.existsSync(file)) return [];
      return fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as LogEntry);
    },
  };
}

describe('runProcess', () => {
  it('resolves with spawnError ENOENT for a missing command instead of throwing', async () => {
    const res = await runProcess({
      command: path.join(os.tmpdir(), 'dai-definitely-missing-binary'),
      args: [],
      timeoutMs: 5000,
    });
    expect(res.spawnError?.code).toBe('ENOENT');
    expect(res.timedOut).toBe(false);
    expect(res.exitCode).toBeNull();
  });

  it('times out a sleeping child in under 4 s and kills its whole process group', async () => {
    const started = Date.now();
    const res = await runProcess({
      command: 'sh',
      args: ['-c', 'echo $$; sleep 30 & wait'],
      timeoutMs: 200,
    });
    expect(Date.now() - started).toBeLessThan(4000);
    expect(res.timedOut).toBe(true);
    const pid = Number(res.stdout.trim());
    expect(pid).toBeGreaterThan(0);
    expect(groupAlive(pid)).toBe(false);
  });

  it('escalates to SIGKILL after 3 s when SIGTERM is ignored', async () => {
    const res = await runProcess({
      command: 'sh',
      args: ['-c', 'trap "" TERM; echo $$; sleep 30 & wait; sleep 30'],
      timeoutMs: 100,
    });
    expect(res.timedOut).toBe(true);
    expect(res.signal).toBe('SIGKILL');
    expect(groupAlive(Number(res.stdout.trim()))).toBe(false);
  }, 10_000);

  it('kills the child when the AbortSignal is aborted', async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 100);
    const started = Date.now();
    const res = await runProcess({
      command: 'sh',
      args: ['-c', 'echo $$; sleep 30'],
      timeoutMs: 30_000,
      signal: ac.signal,
    });
    expect(Date.now() - started).toBeLessThan(4000);
    expect(res.aborted).toBe(true);
    expect(res.timedOut).toBe(false);
    expect(groupAlive(Number(res.stdout.trim()))).toBe(false);
  });

  it('does not spawn when the signal is already aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    const res = await runProcess({
      command: 'sh',
      args: ['-c', 'echo spawned'],
      timeoutMs: 5000,
      signal: ac.signal,
    });
    expect(res.aborted).toBe(true);
    expect(res.stdout).toBe('');
  });

  it('truncates stdout at maxBuffer', async () => {
    const res = await runProcess({
      command: process.execPath,
      args: ['-e', "process.stdout.write('x'.repeat(5000))"],
      timeoutMs: 5000,
      maxBuffer: 100,
    });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe('x'.repeat(100));
  });

  it('passes env exactly as given', async () => {
    const res = await runProcess({
      command: process.execPath,
      args: ['-e', 'process.stdout.write(JSON.stringify(process.env))'],
      env: { DAI_ONLY: 'yes' } as Record<string, string> as NodeJS.ProcessEnv,
      timeoutMs: 5000,
    });
    expect(JSON.parse(res.stdout)).toEqual({ DAI_ONLY: 'yes' });
  });
});

describe('buildClaudeEnv', () => {
  it('removes ANTHROPIC_API_KEY and every Discogs secret but keeps PATH and HOME', () => {
    const env = buildClaudeEnv({
      PATH: '/usr/bin',
      HOME: '/home/owner',
      ANTHROPIC_API_KEY: 'sk-ant-CANARY',
      ANTHROPIC_AUTH_TOKEN: 'CANARY-TOKEN',
      DISCOGS_CONSUMER_KEY: 'CANARY-KEY',
      DISCOGS_CONSUMER_SECRET: 'CANARY-SECRET',
    } as Record<string, string> as NodeJS.ProcessEnv);
    expect(env).toEqual({ PATH: '/usr/bin', HOME: '/home/owner' });
  });

  it('does not mutate the env it was given', () => {
    const base = {
      ANTHROPIC_API_KEY: 'sk-ant-CANARY',
      PATH: '/bin',
    } as Record<string, string> as NodeJS.ProcessEnv;
    buildClaudeEnv(base);
    expect(base.ANTHROPIC_API_KEY).toBe('sk-ant-CANARY');
  });
});

describe('getClaudeCliStatus', () => {
  const fake = useFakeClaude();

  it('mode ok: installed, version 9.9.9, subscription max, no email or org in the result', async () => {
    const s = await getClaudeCliStatus();
    expect(s.installed).toBe(true);
    expect(s.version).toBe('9.9.9');
    expect(s.auth).toEqual({
      state: 'subscription',
      authMethod: 'claude.ai',
      subscriptionType: 'max',
      reason: null,
    });
    const json = JSON.stringify(s);
    expect(json).not.toContain(FAKE_EMAIL);
    expect(json).not.toContain(FAKE_ORG);
    expect(json).not.toContain('fake-org-0000');
  });

  it('mode logged-out gives auth.state logged-out', async () => {
    fake.setMode('logged-out');
    const s = await getClaudeCliStatus();
    expect(s.installed).toBe(true);
    expect(s.auth.state).toBe('logged-out');
  });

  it('mode api-key gives auth.state other with authMethod api_key', async () => {
    fake.setMode('api-key');
    const s = await getClaudeCliStatus();
    expect(s.auth.state).toBe('other');
    expect(s.auth.authMethod).toBe('api_key');
  });

  it('mode status-hang gives unknown with a reason mentioning the timeout', async () => {
    fake.setMode('status-hang');
    const s = await getClaudeCliStatus({ timeoutMs: 300 });
    expect(s.installed).toBe(true);
    expect(s.auth.state).toBe('unknown');
    expect(s.auth.reason).toMatch(/timed out/);
    expect((s.auth.reason ?? '').length).toBeLessThanOrEqual(160);
    const hung = fake.log().find((e) => e.argv[0] === 'auth');
    expect(hung && pidAlive(hung.pid)).toBe(false);
  });

  it('CLAUDE_BIN at a missing path gives installed false', async () => {
    process.env.CLAUDE_BIN = path.join(os.tmpdir(), 'dai-no-such-claude');
    const s = await getClaudeCliStatus();
    expect(s.installed).toBe(false);
    expect(s.version).toBeNull();
  });

  it('reports apiKeyInEnv while the child never receives ANTHROPIC_API_KEY or any DISCOGS_ variable', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-CANARY-0123456789zz';
    process.env.DISCOGS_CONSUMER_KEY = 'CANARY-KEY';
    process.env.DISCOGS_CONSUMER_SECRET = 'CANARY-SECRET';
    const s = await getClaudeCliStatus();
    expect(s.apiKeyInEnv).toBe(true);
    expect(JSON.stringify(s)).not.toContain('CANARY');
    const log = fake.log();
    expect(log.length).toBe(2);
    for (const e of log) {
      expect(e.env).toEqual({
        ANTHROPIC_API_KEY: false,
        ANTHROPIC_AUTH_TOKEN: false,
        DISCOGS_CONSUMER_KEY: false,
        DISCOGS_CONSUMER_SECRET: false,
      });
      expect(e.cwd).toBe(fs.realpathSync(os.tmpdir()));
    }
  });

  it('apiKeyInEnv is false when ANTHROPIC_API_KEY is unset', async () => {
    const s = await getClaudeCliStatus();
    expect(s.apiKeyInEnv).toBe(false);
  });

  it('returns the cached object within maxAgeMs without spawning; maxAgeMs 0 always spawns', async () => {
    const first = await getClaudeCliStatus({ maxAgeMs: 60_000 });
    const lines = fake.log().length;
    const second = await getClaudeCliStatus({ maxAgeMs: 60_000 });
    expect(second).toBe(first);
    expect(fake.log().length).toBe(lines);
    const third = await getClaudeCliStatus({ maxAgeMs: 0 });
    expect(third).not.toBe(first);
    expect(fake.log().length).toBe(lines + 2);
  });
});
