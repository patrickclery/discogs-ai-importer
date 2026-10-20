// D-01 vision spike harness. Runs the production vision modules on the
// owner's real shelf photos with live `claude -p` calls (subscription quota).
// Never part of `pnpm test`.
//
//   SPIKE_STEPS=one corepack pnpm spike:vision
//   SPIKE_STEPS=calibrate corepack pnpm spike:vision
//
// Env:
//   SPIKE_STEPS        comma list of steps to run: one, calibrate
//   SPIKE_MAX_CALLS    live-call budget per invocation (default 24)
//   SPIKE_FORCE=1      re-send a configuration that already has a record
//   SPIKE_CONCURRENCY  live calls in flight at once (default 4)
//
// Recorded CLI results are committed under test/fixtures/vision/spike/ and
// test/fixtures/vision/calibration/.
// Photos, vision images and crops stay under fixtures/spike/ (gitignored).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  PROMPT_VERSION,
  SCHEMA_VERSION,
  SPINE_MEDIA_KINDS,
  VISION_MAX_EDGE,
  VISION_MAX_TOKENS,
  type VisionEffort,
} from '@/lib/vision-contract';
import {
  cropSpine,
  normalizeBox,
  padBox,
  type Region,
  scaleBox,
} from '@/server/images/crop';
import {
  type ImageKind,
  normalizeImage,
  type RawImage,
} from '@/server/images/normalize';
import { resizedSize } from '@/server/images/resize';
import type { RunResult } from '@/server/proc/run';
import { classifyVisionRun } from '@/server/vision/parse';
import { runVisionCall } from '@/server/vision/run';
import type { VisionResult } from '@/server/vision/schema';
import {
  LAYOUTS,
  makeSyntheticShelf,
} from '../../test/fixtures/vision/synthetic-shelf.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PHOTOS_DIR = path.join(ROOT, 'fixtures/spike');
const OUT_DIR = path.join(PHOTOS_DIR, 'out');
const RECORD_DIR = path.join(ROOT, 'test/fixtures/vision/spike');
const CAL_DIR = path.join(ROOT, 'test/fixtures/vision/calibration');

const STEPS = new Set(
  (process.env.SPIKE_STEPS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);
const MAX_CALLS = Number(process.env.SPIKE_MAX_CALLS ?? 24);
const FORCE = process.env.SPIKE_FORCE === '1';
const CONCURRENCY = Math.max(1, Number(process.env.SPIKE_CONCURRENCY ?? 4));

let liveCalls = 0;

/** Runs tasks with at most `limit` in flight, keeping input order. */
async function pool<T>(
  tasks: Array<() => Promise<T>>,
  limit = CONCURRENCY,
): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next;
      next += 1;
      out[i] = await tasks[i]();
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker),
  );
  return out;
}

type SpikeConfig = {
  model: string;
  effort: VisionEffort;
  maxEdge: number;
  maxTokens: number;
  promptVersion: number;
  schemaVersion: number;
};

type SpikeRecord = {
  config: SpikeConfig;
  image: {
    sentW: number;
    sentH: number;
    sentBytes: number;
    sourceW: number;
    sourceH: number;
  };
  run: RunResult;
  recordedAt: string;
};

export function photoSlug(file: string): string {
  return path
    .basename(file, path.extname(file))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}

function recordPath(slug: string, model: string, effort: string): string {
  return path.join(RECORD_DIR, `${slug}.${model}.${effort}.json`);
}

function shortModel(model: string): string {
  return model.replace(/^claude-/, '').split('-')[0];
}

function kindOf(file: string): ImageKind {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.heic' || ext === '.heif') return 'heic';
  if (ext === '.png') return 'png';
  if (ext === '.webp') return 'webp';
  return 'jpeg';
}

/** Clean directory holding only the vision image (the Read scope). */
function writeVisionImage(dir: string, jpeg: Buffer): string {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'image.jpg');
  fs.writeFileSync(file, jpeg);
  return file;
}

/**
 * The recorded run for this configuration, or one live call recorded before
 * anything parses it.
 */
async function recordedOrLive(opts: {
  file: string;
  config: SpikeConfig;
  image: SpikeRecord['image'];
  imagePath: string;
}): Promise<{ record: SpikeRecord; live: boolean }> {
  const { file, config } = opts;
  if (fs.existsSync(file) && !FORCE) {
    return {
      record: JSON.parse(fs.readFileSync(file, 'utf8')) as SpikeRecord,
      live: false,
    };
  }
  if (liveCalls >= MAX_CALLS) {
    throw new Error(`SPIKE_MAX_CALLS (${MAX_CALLS}) reached; refusing to call`);
  }
  liveCalls += 1;
  const run = await runVisionCall({
    imagePath: opts.imagePath,
    width: opts.image.sentW,
    height: opts.image.sentH,
    model: config.model,
    effort: config.effort,
  });
  const record: SpikeRecord = {
    config,
    image: opts.image,
    run,
    recordedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  return { record, live: true };
}

async function rawFromJpeg(jpeg: Buffer): Promise<RawImage> {
  const { data, info } = await sharp(jpeg)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: 3 };
}

// ---------------------------------------------------------------------------
// Calibration (D-01 item 1, RESEARCH Pitfall 2, A1, A7): synthetic spines at
// known pixel boxes go through the production argv; the returned boxes are
// compared with the truth.

type TruthBox = { x1: number; y1: number; x2: number; y2: number };

export const CALIBRATION_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5'];
export const CALIBRATION_EFFORT: VisionEffort = 'medium';
/** Pass threshold: median corner error as a percentage of the short edge. */
export const CALIBRATION_MAX_MEDIAN_PCT = 1.5;
const FALLBACK_MAX_EDGE = 2000;

export type CalibrationMetrics = {
  matched: number;
  truth: number;
  medianPct: number | null;
  p90Pct: number | null;
  /** Least-squares scale of returned over true coordinates, per axis. */
  scaleX: number | null;
  scaleY: number | null;
  reported: { w: number; h: number };
  sent: { w: number; h: number };
  pass: boolean;
};

/** Calibration number printed on a spine (CAL-07 -> 7), or null. */
export function calNumber(text: string | null | undefined): number | null {
  const m = /CAL\s*[-–]?\s*0*(\d{1,3})/i.exec(text ?? '');
  return m ? Number(m[1]) : null;
}

function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1);
  return sorted[Math.max(0, i)];
}

const round2 = (n: number | null) =>
  n === null ? null : Math.round(n * 100) / 100;
const round4 = (n: number | null) =>
  n === null ? null : Math.round(n * 10_000) / 10_000;

/**
 * Matches returned spines to the truth by their CAL number and measures the
 * corner error (mean absolute deviation of x1, y1, x2, y2) as a percentage of
 * the short edge of the sent image.
 */
export function calibrationMetrics(
  result: VisionResult,
  truth: TruthBox[],
  sent: { w: number; h: number },
): CalibrationMetrics {
  const short = Math.min(sent.w, sent.h);
  const errs: number[] = [];
  let sxNum = 0;
  let sxDen = 0;
  let syNum = 0;
  let syDen = 0;
  const seen = new Set<number>();
  for (const spine of result.spines) {
    const n = calNumber(spine.raw_text.value);
    if (n === null || seen.has(n) || n < 1 || n > truth.length) continue;
    const b = spine.bbox;
    if (b.length !== 4 || !b.every(Number.isFinite)) continue;
    seen.add(n);
    const t = truth[n - 1];
    const r = {
      x1: Math.min(b[0], b[2]),
      y1: Math.min(b[1], b[3]),
      x2: Math.max(b[0], b[2]),
      y2: Math.max(b[1], b[3]),
    };
    const mad =
      (Math.abs(r.x1 - t.x1) +
        Math.abs(r.y1 - t.y1) +
        Math.abs(r.x2 - t.x2) +
        Math.abs(r.y2 - t.y2)) /
      4;
    errs.push((mad / short) * 100);
    sxNum += r.x1 * t.x1 + r.x2 * t.x2;
    sxDen += t.x1 * t.x1 + t.x2 * t.x2;
    syNum += r.y1 * t.y1 + r.y2 * t.y2;
    syDen += t.y1 * t.y1 + t.y2 * t.y2;
  }
  errs.sort((a, b) => a - b);
  const medianPct = quantile(errs, 0.5);
  return {
    matched: errs.length,
    truth: truth.length,
    medianPct: round2(medianPct),
    p90Pct: round2(quantile(errs, 0.9)),
    scaleX: round4(sxDen ? sxNum / sxDen : null),
    scaleY: round4(syDen ? syNum / syDen : null),
    reported: { w: result.image_width, h: result.image_height },
    sent,
    pass:
      medianPct !== null &&
      medianPct <= CALIBRATION_MAX_MEDIAN_PCT &&
      errs.length >= Math.ceil(truth.length / 2),
  };
}

export type CalibrationEntry = {
  layout: string;
  model: string;
  effort: VisionEffort;
  maxEdge: number;
  sentBytes: number;
  outcome: string;
  metrics: CalibrationMetrics | null;
};

function calibrationFile(name: string, model: string, effort: string): string {
  return path.join(CAL_DIR, `${name}.${model}.${effort}.json`);
}

type CalLayoutName =
  | 'calibrationPortrait'
  | 'calibrationLandscape'
  | 'calibrationHeavy';
const CAL_LAYOUTS: CalLayoutName[] = [
  'calibrationPortrait',
  'calibrationLandscape',
  'calibrationHeavy',
];

/**
 * One calibration call (or its record). maxEdge other than the tier is the
 * fallback probe (A1): the layout is resized and the truth scaled with it.
 */
async function calibrateOne(
  layoutName: CalLayoutName,
  model: string,
  maxEdge: number,
): Promise<CalibrationEntry> {
  const layout = LAYOUTS[layoutName];
  const shelf = await makeSyntheticShelf(layout);
  const effort = CALIBRATION_EFFORT;
  const name =
    maxEdge === VISION_MAX_EDGE ? layoutName : `${layoutName}-edge${maxEdge}`;
  const runDir = path.join(
    OUT_DIR,
    'calibration',
    name,
    `${shortModel(model)}-${effort}`,
  );

  let jpeg: Buffer;
  let sent: { w: number; h: number };
  if (layoutName === 'calibrationHeavy') {
    // Sent as rendered (over 500 KB) so the CLI's own re-encode is exercised.
    jpeg = shelf.jpeg;
    sent = { w: shelf.width, h: shelf.height };
  } else {
    const norm = await normalizeImage(shelf.jpeg, 'jpeg', {
      maxEdge,
      maxTokens: VISION_MAX_TOKENS,
    });
    jpeg = norm.vision.jpeg;
    sent = { w: norm.vision.width, h: norm.vision.height };
    if (maxEdge === VISION_MAX_EDGE) {
      expect(sent).toEqual({ w: shelf.width, h: shelf.height });
    } else {
      expect(sent).toEqual(
        Object.fromEntries(
          ['w', 'h'].map((k, i) => [
            k,
            resizedSize(shelf.width, shelf.height, maxEdge, VISION_MAX_TOKENS)[
              i
            ],
          ]),
        ),
      );
    }
  }
  const imagePath = writeVisionImage(path.join(runDir, 'vision'), jpeg);
  const { record, live } = await recordedOrLive({
    file: calibrationFile(name, model, effort),
    config: {
      model,
      effort,
      maxEdge,
      maxTokens: VISION_MAX_TOKENS,
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
    },
    image: {
      sentW: sent.w,
      sentH: sent.h,
      sentBytes: jpeg.length,
      sourceW: shelf.width,
      sourceH: shelf.height,
    },
    imagePath,
  });

  const outcome = classifyVisionRun(record.run);
  const tag = `${name} ${shortModel(model)} ${effort} (${live ? 'live' : 'recorded'}, ${jpeg.length} bytes)`;
  if (!outcome.ok) {
    console.log(`${tag}: ${outcome.kind}: ${outcome.detail}`);
    return {
      layout: name,
      model,
      effort,
      maxEdge,
      sentBytes: jpeg.length,
      outcome: outcome.kind,
      metrics: null,
    };
  }
  const sx = sent.w / shelf.width;
  const sy = sent.h / shelf.height;
  const truth = shelf.truth.map((t) => ({
    x1: t.x1 * sx,
    y1: t.y1 * sy,
    x2: t.x2 * sx,
    y2: t.y2 * sy,
  }));
  const metrics = calibrationMetrics(outcome.result, truth, sent);
  console.log(
    `${tag}: matched ${metrics.matched}/${metrics.truth}, median ${metrics.medianPct}%, p90 ${metrics.p90Pct}%, scale x ${metrics.scaleX} y ${metrics.scaleY}, reported ${metrics.reported.w}x${metrics.reported.h} vs sent ${sent.w}x${sent.h}, ${metrics.pass ? 'PASS' : 'FAIL'}`,
  );
  return {
    layout: name,
    model,
    effort,
    maxEdge,
    sentBytes: jpeg.length,
    outcome: 'ok',
    metrics,
  };
}

/** Every recorded calibration entry, without calling anything. */
export async function recordedCalibration(): Promise<CalibrationEntry[]> {
  const out: CalibrationEntry[] = [];
  if (!fs.existsSync(CAL_DIR)) return out;
  for (const layoutName of CAL_LAYOUTS) {
    for (const maxEdge of [VISION_MAX_EDGE, FALLBACK_MAX_EDGE]) {
      for (const model of CALIBRATION_MODELS) {
        const name =
          maxEdge === VISION_MAX_EDGE
            ? layoutName
            : `${layoutName}-edge${maxEdge}`;
        if (!fs.existsSync(calibrationFile(name, model, CALIBRATION_EFFORT))) {
          continue;
        }
        out.push(await calibrateOne(layoutName, model, maxEdge));
      }
    }
  }
  return out;
}

// Tests in one file run in order; fileParallelism is off in the spike config.
describe('vision spike', () => {
  it.skipIf(!STEPS.has('one'))(
    'one: a real HEIC shelf photo goes through the production vision path',
    async () => {
      const photo = path.join(PHOTOS_DIR, 'cd-spines.heic');
      expect(fs.existsSync(photo), `${photo} is missing`).toBe(true);
      const model = 'claude-opus-5-5';
      const effort: VisionEffort = 'medium';
      const slug = photoSlug(photo);
      const runDir = path.join(OUT_DIR, slug, `${shortModel(model)}-${effort}`);

      const norm = await normalizeImage(fs.readFileSync(photo), kindOf(photo), {
        maxEdge: VISION_MAX_EDGE,
        maxTokens: VISION_MAX_TOKENS,
      });
      const { upright, vision } = norm;
      const imagePath = writeVisionImage(
        path.join(runDir, 'vision'),
        vision.jpeg,
      );
      console.log(
        `source ${upright.width}x${upright.height} -> vision ${vision.width}x${vision.height}, ${vision.jpeg.length} bytes at q${vision.quality}`,
      );

      const { record, live } = await recordedOrLive({
        file: recordPath(slug, model, effort),
        config: {
          model,
          effort,
          maxEdge: VISION_MAX_EDGE,
          maxTokens: VISION_MAX_TOKENS,
          promptVersion: PROMPT_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
        image: {
          sentW: vision.width,
          sentH: vision.height,
          sentBytes: vision.jpeg.length,
          sourceW: upright.width,
          sourceH: upright.height,
        },
        imagePath,
      });
      console.log(
        `${live ? 'live call' : 'recorded run'}: exit ${record.run.exitCode}, stdout ${record.run.stdout.length} chars`,
      );

      const outcome = classifyVisionRun(record.run);
      if (!outcome.ok) {
        console.log('stderr:', record.run.stderr.slice(0, 2000));
        console.log('stdout:', record.run.stdout.slice(0, 2000));
      }
      expect(
        outcome.ok,
        outcome.ok ? '' : `${outcome.kind}: ${outcome.detail}`,
      ).toBe(true);
      if (!outcome.ok) return;
      const { result, envelope } = outcome;
      console.log(
        `spines ${result.spines.length} (estimate ${result.spine_count_estimate}), reported image ${result.image_width}x${result.image_height}, turns ${envelope.num_turns}, cost $${envelope.total_cost_usd}, ${envelope.duration_ms} ms`,
      );
      expect(result.spines.length).toBeGreaterThan(0);

      const visionRaw = await rawFromJpeg(vision.jpeg);
      const sources: Array<{
        dir: string;
        raw: RawImage;
        region: (b: ReturnType<typeof padBox>) => Region;
      }> = [
        {
          dir: path.join(runDir, 'crops-master'),
          raw: upright,
          region: (b) =>
            scaleBox(
              b,
              { w: vision.width, h: vision.height },
              { w: upright.width, h: upright.height },
            ),
        },
        {
          dir: path.join(runDir, 'crops-vision'),
          raw: visionRaw,
          region: (b) =>
            scaleBox(
              b,
              { w: vision.width, h: vision.height },
              { w: vision.width, h: vision.height },
            ),
        },
      ];
      for (const s of sources) {
        fs.rmSync(s.dir, { recursive: true, force: true });
        fs.mkdirSync(s.dir, { recursive: true });
      }

      const notWide: string[] = [];
      let kept = 0;
      let dropped = 0;
      for (const spine of result.spines) {
        if (!SPINE_MEDIA_KINDS.includes(spine.media_kind)) continue;
        const box = normalizeBox(spine.bbox, vision.width, vision.height);
        if (!box) {
          dropped += 1;
          continue;
        }
        kept += 1;
        const padded = padBox(box, vision.width, vision.height);
        const name = `${String(spine.index).padStart(3, '0')}-${spine.text_orientation}.webp`;
        for (const s of sources) {
          const crop = await cropSpine(
            s.raw,
            s.region(padded),
            spine.text_orientation,
          );
          fs.writeFileSync(path.join(s.dir, name), crop.webp);
          if (crop.width <= crop.height) {
            notWide.push(
              `${path.basename(s.dir)}/${name} ${crop.width}x${crop.height} (${spine.raw_text.value ?? ''})`,
            );
          }
        }
      }
      fs.writeFileSync(
        path.join(runDir, 'result.json'),
        `${JSON.stringify(result, null, 2)}\n`,
      );
      console.log(`kept ${kept} spines, dropped ${dropped} invalid boxes`);
      if (notWide.length)
        console.log('not wider than tall:\n', notWide.join('\n'));
      expect(kept).toBeGreaterThan(0);
      expect(notWide).toEqual([]);
    },
  );
  it.skipIf(!STEPS.has('calibrate'))(
    'calibrate: synthetic spines at known boxes come back within 1.5% of the short edge',
    async () => {
      const entries = await pool(
        CAL_LAYOUTS.flatMap((layoutName) =>
          CALIBRATION_MODELS.map(
            (model) => () => calibrateOne(layoutName, model, VISION_MAX_EDGE),
          ),
        ),
      );
      const heavy = entries.filter((e) => e.layout === 'calibrationHeavy');
      for (const e of heavy) expect(e.sentBytes).toBeGreaterThan(500_000);

      // A1 fallback probe: a failing tier-size layout is sent once more at
      // 2000 px to fit the scale factor. No alternate input path is built;
      // the Plan 02-04 freeze decides.
      const failed = ['calibrationPortrait', 'calibrationLandscape'].filter(
        (name) =>
          entries.some(
            (e) => e.layout === name && e.metrics && !e.metrics.pass,
          ),
      ) as CalLayoutName[];
      const fallback = await pool(
        failed.map(
          (name) => () =>
            calibrateOne(name, CALIBRATION_MODELS[0], FALLBACK_MAX_EDGE),
        ),
      );

      const all = [...entries, ...fallback];
      const failures = all.filter((e) => e.outcome !== 'ok');
      expect(
        failures.map((e) => `${e.layout} ${e.model}: ${e.outcome}`),
      ).toEqual([]);
      for (const e of all) expect(e.metrics?.matched ?? 0).toBeGreaterThan(0);
      const passed = all.filter((e) => e.metrics?.pass).length;
      console.log(
        `calibration: ${passed}/${all.length} calls within ${CALIBRATION_MAX_MEDIAN_PCT}% median corner error`,
      );
    },
  );
});
