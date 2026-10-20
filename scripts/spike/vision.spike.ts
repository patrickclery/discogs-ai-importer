// D-01 vision spike harness. Runs the production vision modules on the
// owner's real shelf photos with live `claude -p` calls (subscription quota).
// Never part of `pnpm test`.
//
//   SPIKE_STEPS=one corepack pnpm spike:vision
//   SPIKE_STEPS=calibrate corepack pnpm spike:vision
//   SPIKE_STEPS=matrix,report corepack pnpm spike:vision
//
// Env:
//   SPIKE_STEPS        comma list of steps to run: one, calibrate, matrix,
//                      report
//   SPIKE_CONFIGS      matrix configurations, model:effort comma list
//                      (default opus and sonnet, each at medium and high)
//   SPIKE_MAX_CALLS    live-call budget per invocation (default 24)
//   SPIKE_FORCE=1      re-send a configuration that already has a record
//   SPIKE_CONCURRENCY  live calls in flight at once (default 4)
//
// Recorded CLI results are committed under test/fixtures/vision/spike/ and
// test/fixtures/vision/calibration/.
// Photos, vision images and crops stay under fixtures/spike/ (gitignored).
import { spawnSync } from 'node:child_process';
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
/**
 * The live-call budget. Anything but a non-negative integer is refused
 * (IN-01): Number('abc') is NaN and `liveCalls >= NaN` is always false, which
 * would remove the budget.
 */
function maxCalls(raw: string | undefined): number {
  const text = (raw ?? '24').trim();
  if (!/^\d+$/.test(text)) {
    throw new Error(
      `SPIKE_MAX_CALLS must be a non-negative integer, got ${JSON.stringify(raw)}`,
    );
  }
  return Number.parseInt(text, 10);
}
const MAX_CALLS = maxCalls(process.env.SPIKE_MAX_CALLS);
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

// ---------------------------------------------------------------------------
// Matrix (D-01 item 2) and report (D-01 item 3, D-03): every spike photo is
// read once per configuration; report.json proposes the constants the
// Plan 02-04 freeze decides.

const PHOTO_EXT = /\.(heic|heif|jpe?g|png|webp)$/i;
const REPORT_FILE = path.join(RECORD_DIR, 'report.json');
const PAIR_IOU_MIN = 0.3;
const AGREE_SIMILARITY = 0.8;
/** A photo whose cross-model agreement is at least this counts as readable. */
const GOOD_AGREEMENT = 0.75;

type MatrixConfig = { model: string; effort: VisionEffort };

/** SPIKE_CONFIGS="claude-opus-5-5:medium,claude-sonnet-5-5:high" */
export const SPIKE_CONFIGS: MatrixConfig[] = (
  process.env.SPIKE_CONFIGS ??
  'claude-opus-5-5:medium,claude-opus-5-5:high,claude-sonnet-5-5:medium,claude-sonnet-5-5:high'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => {
    const [model, effort] = s.split(':');
    return { model, effort: (effort || 'medium') as VisionEffort };
  });

function spikePhotos(): string[] {
  if (!fs.existsSync(PHOTOS_DIR)) return [];
  return fs
    .readdirSync(PHOTOS_DIR)
    .filter((f) => PHOTO_EXT.test(f))
    .sort()
    .map((f) => path.join(PHOTOS_DIR, f));
}

function configDir(c: MatrixConfig): string {
  return `${shortModel(c.model)}-${c.effort}`;
}

type HeifInfo = {
  available: boolean;
  width?: number;
  height?: number;
  angleCcw?: number;
  mirror?: string | null;
  decodedW?: number;
  decodedH?: number;
  match?: boolean;
};

function heifInfo(file: string): HeifInfo {
  const res = spawnSync('heif-info', [file], { encoding: 'utf8' });
  if (res.error) return { available: false };
  const size = /image: (\d+)x(\d+)/.exec(res.stdout);
  const angle = /angle \(ccw\): (\d+)/.exec(res.stdout);
  const mirror = /mirror: (\S+)/.exec(res.stdout);
  return {
    available: true,
    width: size ? Number(size[1]) : undefined,
    height: size ? Number(size[2]) : undefined,
    angleCcw: angle ? Number(angle[1]) : 0,
    mirror: mirror ? mirror[1] : null,
  };
}

type KeptSpine = {
  spine: VisionResult['spines'][number];
  box: { x1: number; y1: number; x2: number; y2: number };
  name: string;
};

function keptSpines(result: VisionResult, w: number, h: number): KeptSpine[] {
  const out: KeptSpine[] = [];
  for (const spine of result.spines) {
    if (!SPINE_MEDIA_KINDS.includes(spine.media_kind)) continue;
    const box = normalizeBox(spine.bbox, w, h);
    if (!box) continue;
    out.push({
      spine,
      box,
      name: `${String(spine.index).padStart(3, '0')}-${spine.text_orientation}.webp`,
    });
  }
  return out;
}

function iou(a: KeptSpine['box'], b: KeptSpine['box']): number {
  const ix = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const iy = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const inter = ix * iy;
  const area = (r: KeptSpine['box']) => (r.x2 - r.x1) * (r.y2 - r.y1);
  const union = area(a) + area(b) - inter;
  return union > 0 ? inter / union : 0;
}

/** Greedy one-to-one match of b's spines onto a's by IoU (index in b or -1). */
function matchByIoU(a: KeptSpine[], b: KeptSpine[]): number[] {
  const pairs: Array<[number, number, number]> = [];
  a.forEach((x, i) => {
    b.forEach((y, j) => {
      const v = iou(x.box, y.box);
      if (v >= PAIR_IOU_MIN) pairs.push([v, i, j]);
    });
  });
  pairs.sort((p, q) => q[0] - p[0]);
  const out = new Array<number>(a.length).fill(-1);
  const used = new Set<number>();
  for (const [, i, j] of pairs) {
    if (out[i] !== -1 || used.has(j)) continue;
    out[i] = j;
    used.add(j);
  }
  return out;
}

function normText(s: string | null): string {
  return (s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type LoadedRun = {
  slug: string;
  config: MatrixConfig;
  record: SpikeRecord;
  outcome: ReturnType<typeof classifyVisionRun>;
  kept: KeptSpine[];
};

function loadRun(slug: string, config: MatrixConfig): LoadedRun | null {
  const file = recordPath(slug, config.model, config.effort);
  if (!fs.existsSync(file)) return null;
  const record = JSON.parse(fs.readFileSync(file, 'utf8')) as SpikeRecord;
  const outcome = classifyVisionRun(record.run);
  const kept = outcome.ok
    ? keptSpines(outcome.result, record.image.sentW, record.image.sentH)
    : [];
  return { slug, config, record, outcome, kept };
}

/** Static comparison page: per spine, both crops and every reading. */
function writeComparePage(slug: string, runs: LoadedRun[]): string {
  const ok = runs.filter((r) => r.outcome.ok);
  const file = path.join(OUT_DIR, slug, 'compare.html');
  if (!ok.length) return file;
  const ref = ok[0];
  const others = ok.slice(1);
  const matches = others.map((o) => matchByIoU(ref.kept, o.kept));
  const fieldCell = (k: KeptSpine | undefined) => {
    if (!k) return '<td class="none">not found</td>';
    const s = k.spine;
    const f = (
      label: string,
      r: { value: string | null; confidence: number },
    ) =>
      `<div><b>${label}</b> ${esc(r.value ?? '—')} <i>${r.confidence.toFixed(2)}</i></div>`;
    return `<td><div class="raw">${esc(s.raw_text.value ?? '—')}</div>${f('artist', s.artist)}${f('title', s.title)}${f('cat#', s.catalog_number)}<div class="meta">${s.legibility}, ${s.text_orientation}</div></td>`;
  };
  const head = ok
    .map((r) => {
      const e = r.outcome.ok ? r.outcome.envelope : undefined;
      const est = r.outcome.ok ? r.outcome.result.spine_count_estimate : '';
      return `<th>${esc(configDir(r.config))}<div class="meta">${r.kept.length} kept / estimate ${est}, ${Math.round((e?.duration_ms ?? 0) / 1000)} s, $${(e?.total_cost_usd ?? 0).toFixed(3)}</div></th>`;
    })
    .join('');
  const rows = ref.kept
    .map((k, i) => {
      const dir = configDir(ref.config);
      const cells = [
        fieldCell(k),
        ...others.map((o, oi) => fieldCell(o.kept[matches[oi][i]])),
      ].join('');
      return `<tr><td>${i + 1}</td><td><img src="${dir}/crops-master/${k.name}" alt=""><img src="${dir}/crops-vision/${k.name}" alt="" class="small"></td>${cells}</tr>`;
    })
    .join('\n');
  const unmatched = others
    .map((o, oi) => {
      const used = new Set(matches[oi]);
      const extra = o.kept.filter((_, j) => !used.has(j));
      if (!extra.length) return '';
      const dir = configDir(o.config);
      return `<h2>Only in ${esc(dir)} (${extra.length})</h2><table>${extra
        .map(
          (k) =>
            `<tr><td><img src="${dir}/crops-master/${k.name}" alt=""></td>${fieldCell(k)}</tr>`,
        )
        .join('')}</table>`;
    })
    .join('\n');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(slug)} spike comparison</title><style>
body{font:13px system-ui,sans-serif;margin:16px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px;vertical-align:top;text-align:left}
img{display:block;max-width:420px;max-height:90px}img.small{opacity:.8;max-height:40px}.raw{font-family:monospace;color:#333}.meta{color:#777;font-size:11px}i{color:#888}.none{color:#b00}
</style></head><body><h1>${esc(slug)}</h1><p>Rows follow ${esc(configDir(ref.config))}; other columns are matched by box overlap (IoU at least ${PAIR_IOU_MIN}). Count misreads per column.</p>
<table><tr><th>#</th><th>crop (master, vision)</th>${head}</tr>
${rows}</table>
${unmatched}</body></html>
`;
  fs.writeFileSync(file, html);
  return file;
}

/** Crops every kept spine of a run from both sources. */
async function writeCrops(
  run: LoadedRun,
  upright: RawImage,
  visionRaw: RawImage,
): Promise<string[]> {
  const runDir = path.join(OUT_DIR, run.slug, configDir(run.config));
  const sentW = run.record.image.sentW;
  const sentH = run.record.image.sentH;
  const notWide: string[] = [];
  const sources = [
    { dir: path.join(runDir, 'crops-master'), raw: upright },
    { dir: path.join(runDir, 'crops-vision'), raw: visionRaw },
  ];
  for (const s of sources) {
    fs.rmSync(s.dir, { recursive: true, force: true });
    fs.mkdirSync(s.dir, { recursive: true });
  }
  for (const k of run.kept) {
    const padded = padBox(k.box, sentW, sentH);
    for (const s of sources) {
      const crop = await cropSpine(
        s.raw,
        scaleBox(
          padded,
          { w: sentW, h: sentH },
          { w: s.raw.width, h: s.raw.height },
        ),
        k.spine.text_orientation,
      );
      fs.writeFileSync(path.join(s.dir, k.name), crop.webp);
      if (crop.width <= crop.height) {
        notWide.push(`${path.basename(s.dir)}/${k.name}`);
      }
    }
  }
  if (run.outcome.ok) {
    fs.writeFileSync(
      path.join(runDir, 'result.json'),
      `${JSON.stringify(run.outcome.result, null, 2)}\n`,
    );
  }
  return notWide;
}

type RunReport = {
  photo: string;
  model: string;
  effort: VisionEffort;
  outcome: string;
  spines: number | null;
  cdSpines: number | null;
  estimate: number | null;
  ratio: number | null;
  legibility: Record<string, number>;
  medianShortSidePx: number | null;
  maxPairIoU: number | null;
  durationMs: number | null;
  costUsd: number | null;
  numTurns: number | null;
  reported: { w: number; h: number } | null;
  sent: { w: number; h: number; bytes: number };
  source: { w: number; h: number };
  heic: HeifInfo | null;
  agreement: {
    otherModel: string;
    matched: number;
    agreed: number;
    rate: number;
    coverage: number;
  } | null;
};

function runReport(run: LoadedRun, all: LoadedRun[]): RunReport {
  const { record, outcome, kept } = run;
  const heifFile = path.join(OUT_DIR, run.slug, 'heif.json');
  const heic = fs.existsSync(heifFile)
    ? (JSON.parse(fs.readFileSync(heifFile, 'utf8')) as HeifInfo)
    : null;
  const base = {
    photo: run.slug,
    model: run.config.model,
    effort: run.config.effort,
    sent: {
      w: record.image.sentW,
      h: record.image.sentH,
      bytes: record.image.sentBytes,
    },
    source: { w: record.image.sourceW, h: record.image.sourceH },
    heic,
  };
  const env = outcome.envelope;
  if (!outcome.ok) {
    return {
      ...base,
      outcome: outcome.kind,
      spines: null,
      cdSpines: null,
      estimate: null,
      ratio: null,
      legibility: {},
      medianShortSidePx: null,
      maxPairIoU: null,
      durationMs: env?.duration_ms ?? null,
      costUsd: env?.total_cost_usd ?? null,
      numTurns: env?.num_turns ?? null,
      reported: null,
      agreement: null,
    };
  }
  const { result } = outcome;
  const legibility: Record<string, number> = {};
  for (const s of result.spines) {
    legibility[s.legibility] = (legibility[s.legibility] ?? 0) + 1;
  }
  let maxPair = 0;
  for (let i = 0; i < kept.length; i += 1) {
    for (let j = i + 1; j < kept.length; j += 1) {
      maxPair = Math.max(maxPair, iou(kept[i].box, kept[j].box));
    }
  }
  const other = all.find(
    (r) =>
      r.slug === run.slug &&
      r.config.effort === run.config.effort &&
      r.config.model !== run.config.model &&
      r.outcome.ok,
  );
  let agreement: RunReport['agreement'] = null;
  if (other) {
    const m = matchByIoU(kept, other.kept);
    let matched = 0;
    let agreed = 0;
    m.forEach((j, i) => {
      if (j < 0) return;
      matched += 1;
      const a = normText(kept[i].spine.raw_text.value);
      const b = normText(other.kept[j].spine.raw_text.value);
      if (similarity(a, b) >= AGREE_SIMILARITY) agreed += 1;
    });
    // rate: raw_text agreement over the spines both models found (misread
    // proxy); coverage: share of this run's spines the other model also found.
    agreement = {
      otherModel: other.config.model,
      matched,
      agreed,
      rate: matched ? Math.round((agreed / matched) * 1000) / 1000 : 0,
      coverage: kept.length
        ? Math.round((matched / kept.length) * 1000) / 1000
        : 0,
    };
  }
  const shortSides = kept.map((k) =>
    Math.min(k.box.x2 - k.box.x1, k.box.y2 - k.box.y1),
  );
  return {
    ...base,
    outcome: 'ok',
    spines: result.spines.length,
    cdSpines: kept.length,
    estimate: result.spine_count_estimate,
    ratio: result.spine_count_estimate
      ? Math.round(
          (result.spines.length / result.spine_count_estimate) * 1000,
        ) / 1000
      : null,
    legibility,
    medianShortSidePx: median(shortSides),
    maxPairIoU: Math.round(maxPair * 1000) / 1000,
    durationMs: env?.duration_ms ?? null,
    costUsd: env?.total_cost_usd ?? null,
    numTurns: env?.num_turns ?? null,
    reported: { w: result.image_width, h: result.image_height },
    agreement,
  };
}

function mean(values: Array<number | null>): number | null {
  const v = values.filter((x): x is number => typeof x === 'number');
  return v.length
    ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1000) / 1000
    : null;
}

function proposals(runs: RunReport[], calibration: CalibrationEntry[]) {
  const tier = calibration.filter((c) => c.maxEdge === VISION_MAX_EDGE);
  const tierPass = tier.length > 0 && tier.every((c) => c.metrics?.pass);
  const fallbackPass = calibration.some(
    (c) => c.maxEdge === FALLBACK_MAX_EDGE && c.metrics?.pass,
  );
  const maxEdge =
    tierPass || !fallbackPass ? VISION_MAX_EDGE : FALLBACK_MAX_EDGE;

  const stats = (pred: (r: RunReport) => boolean) => {
    const rs = runs.filter(pred);
    return {
      runs: rs.length,
      okRate: rs.length
        ? rs.filter((r) => r.outcome === 'ok').length / rs.length
        : null,
      ratio: mean(rs.map((r) => r.ratio)),
      agreement: mean(rs.map((r) => r.agreement?.rate ?? null)),
      clearShare: mean(
        rs.map((r) => (r.spines ? (r.legibility.clear ?? 0) / r.spines : null)),
      ),
      costUsd: mean(rs.map((r) => r.costUsd)),
      durationMs: mean(rs.map((r) => r.durationMs)),
    };
  };
  const models = [...new Set(runs.map((r) => r.model))];
  const efforts = [...new Set(runs.map((r) => r.effort))];
  const byConfig = Object.fromEntries(
    models.flatMap((m) =>
      efforts.map((e) => [
        `${m}:${e}`,
        stats((r) => r.model === m && r.effort === e),
      ]),
    ),
  );
  const opus = stats((r) => r.model === 'claude-opus-5-5');
  const sonnet = stats((r) => r.model === 'claude-sonnet-5-5');
  // Sonnet only when it matches Opus on reliability and output completeness
  // (agreement is symmetric, so it cannot separate the two models).
  const sonnetEqual =
    sonnet.runs > 0 &&
    opus.runs > 0 &&
    (sonnet.okRate ?? 0) >= (opus.okRate ?? 0) &&
    (sonnet.ratio ?? 0) >= (opus.ratio ?? 0) - 0.05 &&
    (sonnet.clearShare ?? 0) >= (opus.clearShare ?? 0) - 0.05;
  const defaultModel = sonnetEqual ? 'claude-sonnet-5-5' : 'claude-opus-5-5';
  const med = byConfig[`${defaultModel}:medium`];
  const high = byConfig[`${defaultModel}:high`];
  const highBetter =
    !!med &&
    !!high &&
    high.runs > 0 &&
    ((high.okRate ?? 0) > (med.okRate ?? 0) ||
      (high.agreement ?? 0) > (med.agreement ?? 0) + 0.05 ||
      (high.ratio ?? 0) > (med.ratio ?? 0) + 0.05);
  const defaultEffort: VisionEffort = highBetter ? 'high' : 'medium';

  // Density thresholds (D-03) from per-photo agreement at the default effort.
  const perPhoto = [...new Set(runs.map((r) => r.photo))]
    .map((photo) => {
      const rs = runs.filter(
        (r) =>
          r.photo === photo && r.effort === defaultEffort && r.outcome === 'ok',
      );
      return {
        photo,
        spines: mean(rs.map((r) => r.cdSpines)),
        shortSide: mean(rs.map((r) => r.medianShortSidePx)),
        agreement: mean(rs.map((r) => r.agreement?.rate ?? null)),
      };
    })
    .filter((p) => p.spines !== null && p.agreement !== null) as Array<{
    photo: string;
    spines: number;
    shortSide: number;
    agreement: number;
  }>;
  // Only dense failures set the thresholds: a photo that disagrees for
  // another reason (tilted spines, glare) but is sparse with wide spines
  // says nothing about density, so it is listed and left out.
  const good = perPhoto.filter((p) => p.agreement >= GOOD_AGREEMENT);
  const bad = perPhoto.filter((p) => p.agreement < GOOD_AGREEMENT);
  const goodSpines = median(good.map((p) => p.spines)) ?? 0;
  const goodShort = median(good.map((p) => p.shortSide)) ?? 0;
  const dense = bad.filter(
    (p) => p.spines >= goodSpines || p.shortSide <= goodShort,
  );
  const excluded = bad.filter((p) => !dense.includes(p)).map((p) => p.photo);
  const maxGoodSpines = good.length
    ? Math.max(...good.map((p) => p.spines))
    : null;
  const minGoodShort = good.length
    ? Math.min(...good.map((p) => p.shortSide))
    : null;
  const maxDenseShort = dense.length
    ? Math.max(...dense.map((p) => p.shortSide))
    : null;
  const densityMaxSpines =
    maxGoodSpines === null ? null : Math.ceil(maxGoodSpines / 5) * 5;
  const densityMinShortSidePx =
    minGoodShort === null
      ? null
      : maxDenseShort === null || maxDenseShort >= minGoodShort
        ? Math.floor(minGoodShort)
        : Math.floor((minGoodShort + maxDenseShort) / 2);
  const truncated = runs.some(
    (r) => r.outcome === 'truncated' || (r.ratio !== null && r.ratio < 0.8),
  );
  return {
    maxEdge,
    maxTokens: VISION_MAX_TOKENS,
    defaultModel,
    defaultEffort,
    densityMaxSpines: densityMaxSpines ?? 40,
    densityMinShortSidePx: densityMinShortSidePx ?? 30,
    confidenceThreshold: 0.6,
    maxOutputTokens: truncated ? 32000 : null,
    cropSource: 'master' as const,
    tilingNeeded: false,
    evidence: {
      calibrationTierPass: tierPass,
      calibrationFallbackPass: fallbackPass,
      byModel: { 'claude-opus-5-5': opus, 'claude-sonnet-5-5': sonnet },
      byConfig,
      perPhoto,
      goodAgreement: GOOD_AGREEMENT,
      densePhotos: dense.map((p) => p.photo),
      excludedFromDensity: excluded,
    },
    rationale: {
      maxEdge: tierPass
        ? 'Calibration passed at the 2576/4784 tier for both layouts and the >500 KB file: boxes are 1:1 with the sent image.'
        : 'Calibration did not pass at the tier size; see calibration and the 2000 px probe.',
      defaultModel: sonnetEqual
        ? 'Sonnet matched Opus on ok rate, spines/estimate ratio and clear share at half the price.'
        : 'Opus kept; Sonnet did not match it on ok rate, spines/estimate ratio or clear share.',
      defaultEffort: highBetter
        ? 'High improved ok rate, agreement or completeness by more than 5 points over medium.'
        : 'High did not improve ok rate, agreement or completeness by more than 5 points over medium.',
      density: `Per photo at the default effort: a photo is good when cross-model raw_text agreement on matched spines is >= ${GOOD_AGREEMENT}. N is the largest good spine count rounded up to 5; W sits between the smallest good median short side and the largest dense-failure short side. Bad photos that are neither crowded nor narrow are left out (${excluded.join(', ') || 'none'}). Defaults 40 / 30 px when no photo qualifies. A run returning under 80% of its own spine_count_estimate is a separate truncation signal.`,
      confidenceThreshold:
        'Starting value (Claude discretion); self-reported confidences are uncalibrated (A6).',
      maxOutputTokens: truncated
        ? 'At least one run was truncated or returned fewer than 80% of its own estimate.'
        : 'No run was truncated and every ratio was at least 0.8.',
      cropSource:
        'Master: same frame as the vision image by an exact scale and about 3x sharper (A5). Owner confirms at the freeze.',
      tilingNeeded:
        'Recommendation only (tiling is deferred). Stays false unless the owner counts a misread rate over 10-15% on the 30-50 spine photos in compare.html.',
    },
  };
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
  it.skipIf(!STEPS.has('matrix'))(
    'matrix: every spike photo is read once per configuration',
    async () => {
      const photos = spikePhotos();
      expect(photos.length).toBeGreaterThan(0);
      let skipped = 0;
      for (const photo of photos) {
        const slug = photoSlug(photo);
        const kind = kindOf(photo);
        const norm = await normalizeImage(fs.readFileSync(photo), kind, {
          maxEdge: VISION_MAX_EDGE,
          maxTokens: VISION_MAX_TOKENS,
        });
        const { upright, vision } = norm;
        fs.mkdirSync(path.join(OUT_DIR, slug), { recursive: true });
        console.log(
          `${slug}: source ${upright.width}x${upright.height} -> vision ${vision.width}x${vision.height}, ${vision.jpeg.length} bytes at q${vision.quality}`,
        );

        // Pitfall 4 / A3: libheif applies irot/imir, so the decoded size is
        // the transformed size heif-info reports.
        if (kind === 'heic') {
          const info = heifInfo(photo);
          if (!info.available) {
            console.log(`SKIP ${slug}: heif-info not on PATH`);
          } else {
            const quarter = (info.angleCcw ?? 0) % 180 !== 0;
            info.decodedW = upright.width;
            info.decodedH = upright.height;
            info.match = quarter
              ? [upright.width, upright.height].sort().join() ===
                [info.width, info.height].sort().join()
              : upright.width === info.width && upright.height === info.height;
            fs.writeFileSync(
              path.join(OUT_DIR, slug, 'heif.json'),
              `${JSON.stringify(info, null, 2)}\n`,
            );
            console.log(
              `${slug}: heif-info ${info.width}x${info.height}, angle ${info.angleCcw}, mirror ${info.mirror ?? 'none'}, decoded ${upright.width}x${upright.height}`,
            );
            expect(info.match, `${slug} decoded size`).toBe(true);
          }
        }

        const visionRaw = await rawFromJpeg(vision.jpeg);
        const image = {
          sentW: vision.width,
          sentH: vision.height,
          sentBytes: vision.jpeg.length,
          sourceW: upright.width,
          sourceH: upright.height,
        };
        const runs = await pool(
          SPIKE_CONFIGS.map((config) => async () => {
            const file = recordPath(slug, config.model, config.effort);
            if ((!fs.existsSync(file) || FORCE) && liveCalls >= MAX_CALLS) {
              skipped += 1;
              return null;
            }
            const imagePath = writeVisionImage(
              path.join(OUT_DIR, slug, configDir(config), 'vision'),
              vision.jpeg,
            );
            const { live } = await recordedOrLive({
              file,
              config: {
                ...config,
                maxEdge: VISION_MAX_EDGE,
                maxTokens: VISION_MAX_TOKENS,
                promptVersion: PROMPT_VERSION,
                schemaVersion: SCHEMA_VERSION,
              },
              image,
              imagePath,
            });
            const run = loadRun(slug, config);
            if (!run) return null;
            const o = run.outcome;
            console.log(
              `${slug} ${configDir(config)} (${live ? 'live' : 'recorded'}): ${
                o.ok
                  ? `${o.result.spines.length} spines (estimate ${o.result.spine_count_estimate}), ${run.kept.length} kept, ${o.envelope.duration_ms} ms, $${o.envelope.total_cost_usd}`
                  : `${o.kind}: ${o.detail}`
              }`,
            );
            const notWide = await writeCrops(run, upright, visionRaw);
            if (notWide.length) {
              console.log(
                `${slug} ${configDir(config)} not wider than tall:`,
                notWide,
              );
            }
            return run;
          }),
        );
        const loaded = runs.filter((r): r is LoadedRun => r !== null);
        if (loaded.length) {
          console.log(`${slug}: ${writeComparePage(slug, loaded)}`);
        }
      }
      if (skipped) {
        console.log(
          `SPIKE_MAX_CALLS (${MAX_CALLS}) reached: ${skipped} configurations not sent; re-run to continue (recorded ones are skipped).`,
        );
      }
      console.log(`matrix: ${liveCalls} live calls this run`);
    },
  );

  it.skipIf(!STEPS.has('report'))(
    'report: report.json records every run and proposes the constants to freeze',
    async () => {
      const files = fs.existsSync(RECORD_DIR)
        ? fs
            .readdirSync(RECORD_DIR)
            .filter((f) => f.endsWith('.json') && f !== 'report.json')
        : [];
      const loaded: LoadedRun[] = [];
      for (const f of files.sort()) {
        const [slug, model, effort] = f.replace(/\.json$/, '').split('.');
        const run = loadRun(slug, { model, effort: effort as VisionEffort });
        if (run) loaded.push(run);
      }
      const runs = loaded.map((r) => runReport(r, loaded));
      const calibration = await recordedCalibration();
      const report = {
        generatedAt: new Date().toISOString(),
        runs,
        calibration,
        proposals: proposals(runs, calibration),
      };
      fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`);
      for (const r of runs) {
        console.log(
          `${r.photo} ${shortModel(r.model)}-${r.effort}: ${r.outcome}, ${r.cdSpines ?? '-'} kept / ${r.spines ?? '-'} spines / estimate ${r.estimate ?? '-'}, short side ${r.medianShortSidePx ?? '-'} px, agreement ${r.agreement?.rate ?? '-'}, ${r.durationMs ?? '-'} ms, $${r.costUsd ?? '-'}`,
        );
      }
      const { evidence, ...props } = report.proposals;
      console.log('proposals:', JSON.stringify(props, null, 2));
      expect(runs.length).toBeGreaterThan(0);
      expect(evidence).toBeDefined();
    },
  );
});
