import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VISION_EFFORTS, VISION_MAX_TURNS } from '@/lib/vision-contract';
import {
  LAYOUTS,
  makeSyntheticShelf,
  structuredOutputFor,
} from '../../../test/fixtures/vision/synthetic-shelf.mjs';
import { claudeWorkDir } from '../claude/cli';
import { classifyVisionRun } from './parse';
import { buildVisionArgs, buildVisionEnv, runVisionCall } from './run';

// The production vision call against the fake CLI's vision mode (D-02: never
// the live CLI). One invocation, the structured-output argv, Read scoped to
// the image's directory, and no leaked parent variables.

const FAKE = path.resolve(
  import.meta.dirname,
  '../../../test/fixtures/fake-claude.mjs',
);
const ENV_KEYS = [
  'CLAUDE_BIN',
  'FAKE_CLAUDE_MODE',
  'FAKE_CLAUDE_LOG',
  'FAKE_CLAUDE_VISION_FIXTURE',
  'ANTHROPIC_API_KEY',
  'CLAUDE_EFFORT',
  'CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING',
  'CLAUDE_CODE_MAX_OUTPUT_TOKENS',
] as const;

type LogEntry = {
  argv: string[];
  cwd: string;
  env: Record<string, boolean>;
};

const layout = LAYOUTS.tracerShelf;
let dir = '';
let imagePath = '';
const saved: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

function log(): LogEntry[] {
  const file = process.env.FAKE_CLAUDE_LOG as string;
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as LogEntry);
}

function flagValues(argv: string[], name: string): string[] {
  return argv.flatMap((a, i) => (a === name ? [argv[i + 1]] : []));
}

beforeEach(async () => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-vision-run-'));
  const imageDir = path.join(dir, 'vision');
  fs.mkdirSync(imageDir);
  imagePath = path.join(imageDir, 'image.jpg');
  fs.writeFileSync(imagePath, (await makeSyntheticShelf(layout)).jpeg);
  const fixture = path.join(dir, 'structured.json');
  fs.writeFileSync(fixture, JSON.stringify(structuredOutputFor(layout)));

  process.env.CLAUDE_BIN = FAKE;
  process.env.FAKE_CLAUDE_MODE = 'vision';
  process.env.FAKE_CLAUDE_VISION_FIXTURE = fixture;
  process.env.FAKE_CLAUDE_LOG = path.join(dir, 'log.jsonl');
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

const call = () =>
  runVisionCall({
    imagePath,
    width: layout.width,
    height: layout.height,
    model: 'claude-opus-5-5',
    effort: 'medium',
  });

describe('runVisionCall with the fake CLI vision mode', () => {
  it('makes exactly one invocation and the recorded output classifies ok', async () => {
    const res = await call();
    expect(res.exitCode, res.stderr).toBe(0);
    expect(log()).toHaveLength(1);
    const o = classifyVisionRun(res);
    expect(o.ok, o.ok ? '' : `${o.kind}: ${o.detail}`).toBe(true);
    if (!o.ok) return;
    expect(o.result.spines).toHaveLength(layout.spines.length);
    expect(o.result.spines[0].bbox).toEqual([
      layout.spines[0].x1,
      layout.spines[0].y1,
      layout.spines[0].x2,
      layout.spines[0].y2,
    ]);
    expect(o.envelope.num_turns).toBe(2);
  });

  it('passes --json-schema, --effort, --tools Read and exactly one --add-dir (the image directory)', async () => {
    await call();
    const [entry] = log();
    const { argv } = entry;
    const schema = flagValues(argv, '--json-schema');
    expect(schema).toHaveLength(1);
    expect(JSON.parse(schema[0])).toHaveProperty('properties.spines');
    expect(flagValues(argv, '--effort')).toEqual(['medium']);
    expect(flagValues(argv, '--tools')).toEqual(['Read']);
    expect(flagValues(argv, '--add-dir')).toEqual([path.dirname(imagePath)]);
    expect(flagValues(argv, '-p')[0]).toContain(imagePath);
  });

  it('runs from claudeWorkDir()', async () => {
    await call();
    const [entry] = log();
    expect(fs.realpathSync(entry.cwd)).toBe(fs.realpathSync(claudeWorkDir()));
  });

  it('never passes CLAUDE_EFFORT or ANTHROPIC_API_KEY set in the parent to the child', async () => {
    process.env.CLAUDE_EFFORT = 'max';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-CANARY';
    process.env.CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING = '1';
    await call();
    const [entry] = log();
    expect(entry.env.CLAUDE_EFFORT).toBe(false);
    expect(entry.env.ANTHROPIC_API_KEY).toBe(false);
    expect(entry.env.CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING).toBe(false);
  });

  it('the fake refuses a call whose add-dir does not hold image.jpg', async () => {
    fs.renameSync(imagePath, path.join(dir, 'moved.jpg'));
    const res = await call();
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/image\.jpg/);
    const o = classifyVisionRun(res);
    expect(o.ok ? 'ok' : o.kind).toBe('failed');
  });
});

describe('buildVisionArgs', () => {
  const base = {
    imagePath: '/data/photos/abc/vision/image.jpg',
    width: 1449,
    height: 2576,
    model: 'claude-sonnet-5-5',
    effort: 'high' as const,
  };

  it('adds --max-turns only when VISION_MAX_TURNS is a number', () => {
    const args = buildVisionArgs(base);
    if (typeof VISION_MAX_TURNS === 'number') {
      expect(flagValues(args, '--max-turns')).toEqual([
        String(VISION_MAX_TURNS),
      ]);
    } else {
      expect(args).not.toContain('--max-turns');
    }
  });

  it('accepts every VISION_EFFORTS value and rejects anything else', () => {
    for (const effort of VISION_EFFORTS) {
      expect(
        flagValues(buildVisionArgs({ ...base, effort }), '--effort'),
      ).toEqual([effort]);
    }
    expect(() =>
      buildVisionArgs({ ...base, effort: 'turbo' as never }),
    ).toThrow(/effort/);
  });

  it('rejects a relative image path and a flag-like model id', () => {
    expect(() =>
      buildVisionArgs({ ...base, imagePath: 'vision/image.jpg' }),
    ).toThrow(/absolute/);
    expect(() => buildVisionArgs({ ...base, model: '--help' })).toThrow(
      /model/,
    );
  });

  it('keeps the hardening flags and never the minimal mode', () => {
    const args = buildVisionArgs(base);
    for (const f of ['--restricted', '--safe-mode', '--strict-mcp-config']) {
      expect(args).toContain(f);
    }
    expect(args).not.toContain('--bare');
  });
});

describe('buildVisionEnv', () => {
  it('drops inherited session and billing variables', () => {
    process.env.CLAUDE_EFFORT = 'max';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-CANARY';
    const env = buildVisionEnv();
    expect(env.CLAUDE_EFFORT).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });
});
