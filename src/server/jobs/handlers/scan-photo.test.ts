import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LAYOUTS,
  makeSyntheticShelf,
  structuredOutputFor,
} from '../../../../test/fixtures/vision/synthetic-shelf.mjs';
import { useTempDataDir } from '../../../../test/helpers/temp-data-dir';
import { getDb } from '../../db/client';
import type { JobRow } from '../../db/schema';
import { saveDiscogsAuth } from '../../discogs/auth';
import type { ImageKind } from '../../images/normalize';
import { ingestUpload } from '../../scan/ingest';
import { listSpines } from '../../scan/queries';
import { saveSecrets } from '../../secrets';
import { reasonFor, type ScanErrorKind } from '../../vision/reasons';
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
  'FAKE_CLAUDE_STDERR',
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

function ctx(
  current = true,
  signal = new AbortController().signal,
): JobContext {
  return {
    job: { id: 'job', attempts: 1 } as JobRow,
    signal,
    isCurrent: () => current,
  };
}

function runRow(id?: string): RunDb {
  const db = getDb().$client;
  return (
    id
      ? db.prepare('SELECT * FROM vision_runs WHERE id = ?').get(id)
      : db.prepare('SELECT * FROM vision_runs').get()
  ) as RunDb;
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

  it('a finished scan queues one Discogs auto search per CD spine when connected (D-08)', async () => {
    const previous = process.env.SECRETS_FILE;
    const secretsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-scan-dc-'));
    process.env.SECRETS_FILE = path.join(secretsDir, 'secrets.json');
    try {
      saveSecrets({
        discogsConsumerKey: 'CANARYDISCOGSKEY-0123456789wxyz',
        discogsConsumerSecret: 'CANARYDISCOGSSECRET-0123456789abcd',
      });
      saveDiscogsAuth({
        token: 'CANARYTOKEN-0123456789efgh',
        tokenSecret: 'CANARYTOKENSECRET-0123456789ijkl',
        username: 'fake-owner',
      });
      await runScanPhoto({ photoId, runId }, ctx());
      expect(runRow().status).toBe('done');
      const db = getDb().$client;
      const searched = db
        .prepare(
          `SELECT s.spine_id, j.type, j.lane FROM discogs_searches s
           JOIN jobs j ON j.id = s.job_id
           WHERE s.kind = 'auto' AND s.status = 'queued'`,
        )
        .all() as { spine_id: string; type: string; lane: string }[];
      expect(searched).toHaveLength(layout.spines.length);
      expect(new Set(searched.map((r) => r.spine_id))).toEqual(
        new Set(listSpines().map((s) => s.id)),
      );
      for (const r of searched) {
        expect([r.lane, r.type]).toEqual(['discogs', 'search_spine']);
      }
    } finally {
      if (previous === undefined) delete process.env.SECRETS_FILE;
      else process.env.SECRETS_FILE = previous;
      fs.rmSync(secretsDir, { recursive: true, force: true });
    }
  });

  it('a finished scan queues no Discogs search while not connected', async () => {
    await runScanPhoto({ photoId, runId }, ctx());
    expect(runRow().status).toBe('done');
    const n = (
      getDb()
        .$client.prepare('SELECT COUNT(*) AS n FROM discogs_searches')
        .get() as { n: number }
    ).n;
    expect(n).toBe(0);
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

  it('fails the run without a call unless the CLI is on the subscription (CR-02)', async () => {
    for (const mode of ['api-key', 'logged-out']) {
      process.env.FAKE_CLAUDE_MODE = mode;
      getDb()
        .$client.prepare(
          `UPDATE vision_runs SET status = 'queued', error_kind = NULL,
             error_reason = NULL, finished_at = NULL WHERE id = ?`,
        )
        .run(runId);
      await runScanPhoto({ photoId, runId }, ctx());
      const run = runRow();
      expect(run.status, mode).toBe('error');
      expect(run.error_kind, mode).toBe('cli_unavailable');
      expect(run.error_reason, mode).toBe(reasonFor('cli_unavailable'));
      expect(run.spawned_at, mode).toBeNull();
    }
    expect(calls()).toBe(0);
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

type Structured = ReturnType<typeof structuredOutputFor>;

/** A PNG header that claims width x height, with a valid IHDR CRC. */
function pngClaiming(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(2, 9); // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.alloc(16))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Every failure kind in the UI-SPEC copy table, end to end through the real
// handler and the fake CLI (D-04, VIS-03): the run ends in error with its
// reason, raw.json exists for every failure after the spawn, and no case
// costs more than one call.
describe('runScanPhoto failure modes', () => {
  const dataDir = useTempDataDir();

  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    const dir = dataDir();
    process.env.CLAUDE_BIN = FAKE;
    process.env.FAKE_CLAUDE_MODE = 'vision';
    process.env.FAKE_CLAUDE_LOG = path.join(dir, 'log.jsonl');
    delete process.env.FAKE_CLAUDE_STDERR;
    writeFixture(structuredOutputFor(layout));
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  function writeFixture(structured: unknown): void {
    const file = path.join(dataDir(), 'structured.json');
    fs.writeFileSync(file, JSON.stringify(structured));
    process.env.FAKE_CLAUDE_VISION_FIXTURE = file;
  }

  async function upload(
    bytes?: Uint8Array,
    kind: ImageKind = 'jpeg',
  ): Promise<{ photoId: string; runId: string }> {
    const data =
      bytes ?? new Uint8Array((await makeSyntheticShelf(layout)).jpeg);
    const { photoId } = await ingestUpload({
      bytes: data,
      kind,
      filename: `case.${kind}`,
    });
    const run = getDb()
      .$client.prepare('SELECT id FROM vision_runs WHERE photo_id = ?')
      .get(photoId) as { id: string };
    return { photoId, runId: run.id };
  }

  function rawExists(run: RunDb): boolean {
    return (
      run.raw_path !== null && fs.existsSync(path.join(dataDir(), run.raw_path))
    );
  }

  async function expectError(
    kind: ScanErrorKind,
    opts: { deps?: { callTimeoutMs?: number }; signal?: AbortSignal } = {},
  ): Promise<RunDb> {
    const { photoId, runId } = await upload();
    await expect(
      runScanPhoto({ photoId, runId }, ctx(true, opts.signal), opts.deps),
    ).resolves.toBe(undefined);
    const run = runRow(runId);
    expect(run.status).toBe('error');
    expect(run.error_kind).toBe(kind);
    expect(run.error_reason).toBe(reasonFor(kind));
    expect(run.spawned_at).toBeTypeOf('number');
    expect(rawExists(run)).toBe(true);
    expect(calls()).toBe(1);
    return run;
  }

  it('a refused answer (success without structured_output) is refused', async () => {
    process.env.FAKE_CLAUDE_MODE = 'vision-refused';
    const run = await expectError('refused');
    expect(run.error_reason).toBe(
      'Claude declined to read this photo. Re-scan to try again, or upload a different photo.',
    );
  });

  it('error_max_turns is truncated', async () => {
    process.env.FAKE_CLAUDE_MODE = 'vision-max-turns';
    await expectError('truncated');
  });

  it('stdout reaching the 8 MB buffer is truncated', async () => {
    const big: Structured = structuredOutputFor(layout);
    big.spines[0].raw_text.value = 'x'.repeat(8_100_000);
    writeFixture(big);
    const run = await expectError('truncated');
    expect(run.error_reason).toBe(
      "Claude's answer was cut off before every spine was returned. Photograph a narrower section, or re-scan.",
    );
  });

  it('a schema-invalid structured_output is schema_invalid', async () => {
    process.env.FAKE_CLAUDE_MODE = 'vision-invalid';
    await expectError('schema_invalid');
  });

  it('error_max_structured_output_retries is schema_invalid', async () => {
    process.env.FAKE_CLAUDE_MODE = 'vision-retries';
    await expectError('schema_invalid');
  });

  it('a call over its timeout is timeout', async () => {
    process.env.FAKE_CLAUDE_MODE = 'hang';
    await expectError('timeout', { deps: { callTimeoutMs: 300 } });
  });

  it('an aborted call is interrupted', async () => {
    process.env.FAKE_CLAUDE_MODE = 'hang';
    const ac = new AbortController();
    // Abort once the vision call is running: a fixed delay races the CLI
    // readiness check that now runs right before the spawn (CR-02).
    const poll = setInterval(() => {
      if (calls() > 0) ac.abort();
    }, 20);
    try {
      await expectError('interrupted', { signal: ac.signal });
    } finally {
      clearInterval(poll);
    }
  });

  it('a missing CLI is cli_unavailable before any vision spawn (CR-02)', async () => {
    process.env.CLAUDE_BIN = path.join(dataDir(), 'no-such-claude');
    const { photoId, runId } = await upload();
    await runScanPhoto({ photoId, runId }, ctx());
    const run = runRow(runId);
    expect(run.status).toBe('error');
    expect(run.error_kind).toBe('cli_unavailable');
    expect(run.error_reason).toBe(reasonFor('cli_unavailable'));
    // The readiness check fails first, so the call is never attempted.
    expect(run.spawned_at).toBeNull();
    expect(run.raw_path).toBeNull();
  });

  it('an undecodable HEIC is heic_decode with zero calls', async () => {
    const bytes = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from('ftypheic', 'ascii'),
      Buffer.from('\0\0\0\0mif1heic', 'ascii'),
      Buffer.from('garbage '.repeat(64), 'ascii'),
    ]);
    const { photoId, runId } = await upload(new Uint8Array(bytes), 'heic');
    await runScanPhoto({ photoId, runId }, ctx());
    const run = runRow(runId);
    expect(run.status).toBe('error');
    expect(run.error_kind).toBe('heic_decode');
    expect(run.error_reason).toBe(reasonFor('heic_decode'));
    expect(run.spawned_at).toBeNull();
    expect(calls()).toBe(0);
  });

  it('FF D8 FF plus garbage is image_unreadable with zero calls', async () => {
    const bytes = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from('garbage '.repeat(64), 'ascii'),
    ]);
    const { photoId, runId } = await upload(new Uint8Array(bytes));
    await runScanPhoto({ photoId, runId }, ctx());
    const run = runRow(runId);
    expect(run.status).toBe('error');
    expect(run.error_kind).toBe('image_unreadable');
    expect(run.error_reason).toBe(reasonFor('image_unreadable'));
    expect(calls()).toBe(0);
  });

  it('an image over 100 MP is too_large with zero calls', async () => {
    const { photoId, runId } = await upload(
      new Uint8Array(pngClaiming(20_000, 10_000)),
      'png',
    );
    await runScanPhoto({ photoId, runId }, ctx());
    const run = runRow(runId);
    expect(run.status).toBe('error');
    expect(run.error_kind).toBe('too_large');
    expect(run.error_reason).toBe(
      'Scan failed: 20000x10000 is too large. Re-scan to try again.',
    );
    expect(calls()).toBe(0);
  });

  it('zero spines finishes the run as done with 0 spines and no error', async () => {
    writeFixture({ ...structuredOutputFor(layout), spines: [] });
    const { photoId, runId } = await upload();
    await runScanPhoto({ photoId, runId }, ctx());
    const run = runRow(runId);
    expect(run.status).toBe('done');
    expect(run.error_kind).toBeNull();
    expect(run.detected_count).toBe(0);
    expect(run.cd_count).toBe(0);
    expect(listSpines()).toHaveLength(0);
    expect(calls()).toBe(1);
  });

  it('a CD detection with an unusable box is kept as a spine with no crop', async () => {
    const one: Structured = structuredOutputFor(layout);
    one.spines = [{ ...one.spines[0], bbox: [10, 20, 30] as never }];
    writeFixture(one);
    const { photoId, runId } = await upload();
    await runScanPhoto({ photoId, runId }, ctx());
    expect(runRow(runId).status).toBe('done');
    const spines = listSpines();
    expect(spines).toHaveLength(1);
    expect(spines[0].crop).toBeNull();
  });

  it('stores density flags and keeps two overlapping boxes as two spines', async () => {
    const two: Structured = structuredOutputFor(layout);
    const [a] = two.spines;
    const [x1, y1, x2, y2] = a.bbox;
    const shift = Math.round((y2 - y1) / 4);
    two.spines = [
      a,
      { ...a, index: 1, bbox: [x1, y1 + shift, x2, y2 + shift] },
    ];
    writeFixture(two);
    const { photoId, runId } = await upload();
    await runScanPhoto({ photoId, runId }, ctx());
    const run = getDb()
      .$client.prepare(
        'SELECT status, density_flags, detected_count FROM vision_runs WHERE id = ?',
      )
      .get(runId) as {
      status: string;
      density_flags: string;
      detected_count: number;
    };
    expect(run.status).toBe('done');
    expect(JSON.parse(run.density_flags)).toEqual(['overlapping']);
    expect(run.detected_count).toBe(2);
    expect(listSpines()).toHaveLength(2);
  });

  it('a clean shelf stores no density flags', async () => {
    const { photoId, runId } = await upload();
    await runScanPhoto({ photoId, runId }, ctx());
    const run = getDb()
      .$client.prepare('SELECT density_flags FROM vision_runs WHERE id = ?')
      .get(runId) as { density_flags: string };
    expect(JSON.parse(run.density_flags)).toEqual([]);
  });

  it('a reported image size off by more than 2% only logs a warning', async () => {
    writeFixture({
      ...structuredOutputFor(layout),
      image_width: Math.round(layout.width * 1.05),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { photoId, runId } = await upload();
      await runScanPhoto({ photoId, runId }, ctx());
      expect(runRow(runId).status).toBe('done');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(runId));
    } finally {
      warn.mockRestore();
    }
  });

  it('a fallback reason from stderr shows no absolute path and at most 160 characters of detail', async () => {
    process.env.FAKE_CLAUDE_MODE = 'bad-json';
    process.env.FAKE_CLAUDE_STDERR = `boom reading ${path.join(dataDir(), 'vision', 'x', 'image.jpg')} and ${path.join(os.homedir(), '.claude', 'secret.json')} ${'y'.repeat(300)}`;
    const { photoId, runId } = await upload();
    await runScanPhoto({ photoId, runId }, ctx());
    const run = runRow(runId);
    expect(run.status).toBe('error');
    expect(run.error_kind).toBe('failed');
    const reason = run.error_reason as string;
    expect(reason).not.toContain(dataDir());
    expect(reason).not.toContain(os.homedir());
    expect(reason).toMatch(
      /^Scan failed: boom reading … and … y+\. Re-scan to try again\.$/,
    );
    const detail = reason
      .replace(/^Scan failed: /, '')
      .replace(/\. Re-scan to try again\.$/, '');
    expect(Array.from(detail).length).toBeLessThanOrEqual(160);
    expect(rawExists(run)).toBe(true);
    expect(calls()).toBe(1);
  });
});
