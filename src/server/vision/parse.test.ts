import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RunResult } from '../proc/run';
import { classifyVisionRun, parseVisionResult } from './parse';
import { VISION_MAX_BUFFER } from './run';

// VIS-02 / D-04 classification over hand-built runs and every recorded
// response (D-02: fixtures only, never the live CLI).

const ROOT = path.resolve(import.meta.dirname, '../../..');
const RECORD_DIRS = [
  path.join(ROOT, 'test/fixtures/vision/spike'),
  path.join(ROOT, 'test/fixtures/vision/calibration'),
];

function field(value: unknown, confidence: unknown = 0.9) {
  return { value, confidence };
}

function spine(over: Record<string, unknown> = {}) {
  return {
    index: 0,
    media_kind: 'cd',
    bbox: [10, 20, 300, 60],
    text_orientation: 'horizontal',
    legibility: 'clear',
    raw_text: field('Sigur Rós - Takk'),
    artist: field('Sigur Rós'),
    title: field('Takk'),
    format: field(null, 0),
    label: field(null, 0),
    catalog_number: field(null, 0),
    ...over,
  };
}

function result(spines: unknown[] = [spine()]) {
  return {
    image_width: 1449,
    image_height: 2576,
    spine_count_estimate: spines.length,
    spines,
  };
}

function run(over: Partial<RunResult> = {}): RunResult {
  return {
    exitCode: 0,
    signal: null,
    stdout: '',
    stderr: '',
    timedOut: false,
    aborted: false,
    ...over,
  };
}

function envelope(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    duration_ms: 1000,
    num_turns: 2,
    result: '',
    total_cost_usd: 0.1,
    structured_output: result(),
    ...over,
  });
}

describe('parseVisionResult', () => {
  it("maps '', whitespace-only and null values to null", () => {
    const out = parseVisionResult(
      result([
        spine({
          artist: field(''),
          title: field('   '),
          label: field(null),
        }),
      ]),
    );
    expect(out?.spines[0].artist.value).toBeNull();
    expect(out?.spines[0].title.value).toBeNull();
    expect(out?.spines[0].label.value).toBeNull();
  });

  it("keeps 'sigur rós' exactly, with no case change", () => {
    const out = parseVisionResult(
      result([spine({ artist: field('sigur rós') })]),
    );
    expect(out?.spines[0].artist.value).toBe('sigur rós');
  });

  it('keeps any other value exactly as returned, surrounding spaces included', () => {
    const out = parseVisionResult(
      result([spine({ raw_text: field('  SIGUR RÓS  takk… ') })]),
    );
    expect(out?.spines[0].raw_text.value).toBe('  SIGUR RÓS  takk… ');
  });

  it('clamps confidence 1.7 to 1 and -0.2 to 0', () => {
    const out = parseVisionResult(
      result([spine({ artist: field('a', 1.7), title: field('t', -0.2) })]),
    );
    expect(out?.spines[0].artist.confidence).toBe(1);
    expect(out?.spines[0].title.confidence).toBe(0);
  });

  it('turns a NaN or non-number confidence into 0', () => {
    const out = parseVisionResult(
      result([
        spine({
          artist: field('a', Number.NaN),
          title: field('t', 'high'),
          format: field('CD', null),
        }),
      ]),
    );
    expect(out).not.toBeNull();
    expect(out?.spines[0].artist.confidence).toBe(0);
    expect(out?.spines[0].title.confidence).toBe(0);
    expect(out?.spines[0].format.confidence).toBe(0);
  });

  it('returns null for output that does not match the schema', () => {
    expect(parseVisionResult({ spines: 'nope' })).toBeNull();
    expect(
      parseVisionResult(result([spine({ text_orientation: 'diagonal' })])),
    ).toBeNull();
  });
});

describe('classifyVisionRun', () => {
  it('spawnError ENOENT is cli_unavailable', () => {
    const o = classifyVisionRun(
      run({ exitCode: null, spawnError: { code: 'ENOENT', message: 'x' } }),
    );
    expect(o.ok ? 'ok' : o.kind).toBe('cli_unavailable');
  });

  it('timedOut is timeout and aborted is interrupted', () => {
    const t = classifyVisionRun(run({ timedOut: true }));
    const a = classifyVisionRun(run({ aborted: true }));
    expect(t.ok ? 'ok' : t.kind).toBe('timeout');
    expect(a.ok ? 'ok' : a.kind).toBe('interrupted');
  });

  it('stdout at the maxBuffer length is truncated', () => {
    const o = classifyVisionRun(run({ stdout: 'x'.repeat(64) }), 64);
    expect(o.ok ? 'ok' : o.kind).toBe('truncated');
    expect(VISION_MAX_BUFFER).toBeGreaterThan(1_000_000);
  });

  it("'not json' is failed", () => {
    const o = classifyVisionRun(run({ stdout: 'not json' }));
    expect(o.ok ? 'ok' : o.kind).toBe('failed');
  });

  it('subtype error_max_turns is truncated', () => {
    const o = classifyVisionRun(
      run({
        exitCode: 1,
        stdout: envelope({
          subtype: 'error_max_turns',
          is_error: true,
          structured_output: undefined,
        }),
      }),
    );
    expect(o.ok ? 'ok' : o.kind).toBe('truncated');
  });

  it('subtype error_max_structured_output_retries is schema_invalid', () => {
    const o = classifyVisionRun(
      run({
        exitCode: 1,
        stdout: envelope({
          subtype: 'error_max_structured_output_retries',
          is_error: true,
          structured_output: undefined,
        }),
      }),
    );
    expect(o.ok ? 'ok' : o.kind).toBe('schema_invalid');
  });

  it('success without structured_output is refused', () => {
    const o = classifyVisionRun(
      run({
        stdout: envelope({
          structured_output: undefined,
          result: 'I cannot help with that.',
        }),
      }),
    );
    expect(o.ok ? 'ok' : o.kind).toBe('refused');
  });

  it('a structured_output that does not match the schema is schema_invalid', () => {
    const o = classifyVisionRun(
      run({ stdout: envelope({ structured_output: { spines: 3 } }) }),
    );
    expect(o.ok ? 'ok' : o.kind).toBe('schema_invalid');
  });

  it('a login error in the result is cli_unavailable', () => {
    const o = classifyVisionRun(
      run({
        exitCode: 1,
        stdout: envelope({
          is_error: true,
          subtype: 'error_during_execution',
          result: 'Not logged in · Please run /login',
          structured_output: undefined,
        }),
      }),
    );
    expect(o.ok ? 'ok' : o.kind).toBe('cli_unavailable');
  });

  it('a good envelope is ok with the parsed result', () => {
    const o = classifyVisionRun(run({ stdout: envelope() }));
    expect(o.ok).toBe(true);
    if (o.ok) expect(o.result.spines).toHaveLength(1);
  });

  const recorded = RECORD_DIRS.flatMap((dir) =>
    fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((f) => f.endsWith('.json') && f !== 'report.json')
          .map((f) => path.join(dir, f))
      : [],
  );

  it('there are recorded spike and calibration responses', () => {
    expect(recorded.some((f) => f.includes('/spike/'))).toBe(true);
    expect(recorded.some((f) => f.includes('/calibration/'))).toBe(true);
  });

  it.each(recorded.map((f) => [path.relative(ROOT, f), f]))(
    'recorded %s classifies ok',
    (_name, file) => {
      const record = JSON.parse(fs.readFileSync(file, 'utf8'));
      const o = classifyVisionRun(record.run);
      expect(o.ok, o.ok ? '' : `${o.kind}: ${o.detail}`).toBe(true);
    },
  );
});
