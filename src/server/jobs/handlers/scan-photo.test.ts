import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LAYOUTS,
  makeSyntheticShelf,
  structuredOutputFor,
} from '../../../../test/fixtures/vision/synthetic-shelf.mjs';
import { useTempDataDir } from '../../../../test/helpers/temp-data-dir';
import { getDb } from '../../db/client';
import type { JobRow } from '../../db/schema';
import { ingestUpload } from '../../scan/ingest';
import { listSpines } from '../../scan/queries';
import type { JobContext } from '../types';
import { runScanPhoto } from './scan-photo';

// The ledgered scan job against the fake CLI's vision mode (never the live
// CLI): one call per run, raw output first, crops from the master image, and
// no throw after the spawn.

const FAKE = path.resolve(
  import.meta.dirname,
  '../../../../test/fixtures/fake-claude.mjs',
);
const ENV_KEYS = [
  'CLAUDE_BIN',
  'FAKE_CLAUDE_MODE',
  'FAKE_CLAUDE_LOG',
  'FAKE_CLAUDE_VISION_FIXTURE',
] as const;
const layout = LAYOUTS.tracerShelf;
const saved: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

type RunDb = {
  id: string;
  status: string;
  model: string | null;
  effort: string | null;
  spawned_at: number | null;
  raw_path: string | null;
  vision_path: string | null;
  vision_w: number | null;
  vision_h: number | null;
  source_w: number | null;
  error_kind: string | null;
  error_reason: string | null;
  cd_count: number | null;
  detected_count: number | null;
};

function ctx(current = true): JobContext {
  return {
    job: { id: 'job', attempts: 1 } as JobRow,
    signal: new AbortController().signal,
    isCurrent: () => current,
  };
}

function runRow(): RunDb {
  return getDb().$client.prepare('SELECT * FROM vision_runs').get() as RunDb;
}

function calls(): number {
  const file = process.env.FAKE_CLAUDE_LOG as string;
  if (!fs.existsSync(file)) return 0;
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .filter((l) => (JSON.parse(l) as { argv: string[] }).argv[0] === '-p')
    .length;
}

describe('runScanPhoto', () => {
  const dataDir = useTempDataDir();
  let photoId = '';
  let runId = '';

  beforeEach(async () => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    const dir = dataDir();
    const fixture = path.join(dir, 'structured.json');
    fs.writeFileSync(fixture, JSON.stringify(structuredOutputFor(layout)));
    process.env.CLAUDE_BIN = FAKE;
    process.env.FAKE_CLAUDE_MODE = 'vision';
    process.env.FAKE_CLAUDE_VISION_FIXTURE = fixture;
    process.env.FAKE_CLAUDE_LOG = path.join(dir, 'log.jsonl');
    const { jpeg } = await makeSyntheticShelf(layout);
    ({ photoId } = await ingestUpload({
      bytes: new Uint8Array(jpeg),
      kind: 'jpeg',
      filename: 'tracer.jpg',
    }));
    runId = runRow().id;
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('makes one recorded call, stores raw first, crops and persists spines', async () => {
    await runScanPhoto({ photoId, runId }, ctx());
    const run = runRow();
    expect(run.status).toBe('done');
    expect(run.model).toBe('claude-opus-5-5');
    expect(run.effort).toBe('high');
    expect(run.spawned_at).toBeTypeOf('number');
    expect(run.raw_path).toBe(`vision/${photoId}/run-1/raw.json`);
    expect(run.vision_path).toBe(`vision/${photoId}/run-1/image.jpg`);
    expect(run.cd_count).toBe(layout.spines.length);
    expect(calls()).toBe(1);

    const raw = JSON.parse(
      fs.readFileSync(path.join(dataDir(), run.raw_path as string), 'utf8'),
    ) as { runId: string; run: { stdout: string } };
    expect(raw.runId).toBe(runId);
    expect(JSON.parse(raw.run.stdout).structured_output).toBeTruthy();

    const meta = await sharp(
      path.join(dataDir(), run.vision_path as string),
    ).metadata();
    expect([meta.width, meta.height]).toEqual([run.vision_w, run.vision_h]);

    const spines = listSpines();
    expect(spines).toHaveLength(layout.spines.length);
    // Identical reads stay separate spines, in Claude's index order.
    expect(
      spines.map((s) => s.fields.find((f) => f.field === 'raw_text')?.value),
    ).toEqual(layout.spines.map((s) => s.text));
    for (const s of spines) {
      expect(s.crop?.url).toMatch(
        new RegExp(`^/api/files/crops/${photoId}/[0-9A-Z]{26}\\.webp$`),
      );
      expect(s.crop && s.crop.width > s.crop.height).toBe(true);
      for (const f of s.fields) expect(f.aiValue).toBe(f.value);
    }
  });

  it('does not spawn when the claim is no longer current', async () => {
    await runScanPhoto({ photoId, runId }, ctx(false));
    expect(calls()).toBe(0);
    expect(runRow().status).toBe('preparing');
  });

  it('never runs a run twice', async () => {
    await runScanPhoto({ photoId, runId }, ctx());
    await runScanPhoto({ photoId, runId }, ctx());
    expect(calls()).toBe(1);
  });

  it('records a CLI failure on the run without throwing', async () => {
    process.env.FAKE_CLAUDE_MODE = 'error';
    await expect(runScanPhoto({ photoId, runId }, ctx())).resolves.toBe(
      undefined,
    );
    const run = runRow();
    expect(run.status).toBe('error');
    expect(run.error_kind).toBe('failed');
    expect(run.error_reason).toBe(
      'Scan failed: Overloaded. Re-scan to try again.',
    );
    expect(run.raw_path).not.toBeNull();
    expect(calls()).toBe(1);
  });

  it('turns an unreadable original into image_unreadable before any call', async () => {
    const photo = getDb()
      .$client.prepare('SELECT original_path FROM photos')
      .get() as { original_path: string };
    fs.writeFileSync(path.join(dataDir(), photo.original_path), 'not a jpeg');
    await runScanPhoto({ photoId, runId }, ctx());
    const run = runRow();
    expect(run.status).toBe('error');
    expect(run.error_kind).toBe('image_unreadable');
    expect(run.spawned_at).toBeNull();
    expect(calls()).toBe(0);
  });
});
