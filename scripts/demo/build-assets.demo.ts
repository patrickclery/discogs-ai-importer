// Phase 5 sample shelf builder (D-06, D-07, D-18). Developer-run, never part
// of `pnpm test`:
//
//   pnpm demo:assets
//
// Runs the real normalize/crop pipeline on the owner's cd-spines.heic (opened
// by exact path; fixtures/spike is never listed) with the saved Opus/high
// read, and writes demo/fixtures/shelf.json plus demo/assets/{vision.jpg,
// thumb.webp,crops/NN.webp}. The HEIC itself is never copied or committed.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import type { DensityFlag } from '@/lib/scan-types';
import {
  CROP_SOURCE,
  DEFAULT_DENSITY_MAX_SPINES,
  DEFAULT_DENSITY_MIN_SHORT_SIDE_PX,
  type Legibility,
  type MediaKind,
  SPINE_FIELDS,
  SPINE_MEDIA_KINDS,
  type SpineField,
  type TextOrientation,
  VISION_MAX_EDGE,
  VISION_MAX_TOKENS,
} from '@/lib/vision-contract';
import {
  type Box,
  cropSpine,
  normalizeBox,
  padBox,
  scaleBox,
} from '@/server/images/crop';
import {
  type NormalizedImage,
  normalizeImage,
  type RawImage,
} from '@/server/images/normalize';
import type { RunResult } from '@/server/proc/run';
import { computeDensityFlags } from '@/server/vision/density';
import { classifyVisionRun } from '@/server/vision/parse';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HEIC = path.join(ROOT, 'fixtures/spike/cd-spines.heic');
const READ_NAME = 'cd-spines.claude-opus-5-5.high';
const SAVED_READ = path.join(
  ROOT,
  `test/fixtures/vision/spike/${READ_NAME}.json`,
);
const DEMO = path.join(ROOT, 'demo');
const ASSETS = path.join(DEMO, 'assets');
const CROPS = path.join(ASSETS, 'crops');
const SHELF = path.join(DEMO, 'fixtures/shelf.json');

/** D-18: crops are downscaled to this long edge for the published demo. */
const CROP_MAX_EDGE = 1200;
const CROP_WEBP_QUALITY = 80;

type SavedRead = {
  config: { model: string; effort: string };
  image: { sentW: number; sentH: number };
  run: RunResult;
};

type ShelfSpine = {
  key: string;
  index: number;
  legibility: Legibility | null;
  mediaKind: MediaKind | null;
  textOrientation: TextOrientation | null;
  crop: { file: string; width: number; height: number } | null;
  fields: Array<{
    field: SpineField;
    value: string | null;
    confidence: number;
  }>;
};

/** cropSourceFor in scan-photo.ts: the source CROP_SOURCE names, raw RGB. */
async function cropSourceFor(image: NormalizedImage): Promise<RawImage> {
  if (CROP_SOURCE === 'master') return image.upright;
  const { data, info } = await sharp(image.vision.jpeg)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: 3 };
}

it('builds the sample shelf from cd-spines.heic and the saved read', async () => {
  if (!fs.existsSync(HEIC)) {
    throw new Error(
      `missing ${path.relative(ROOT, HEIC)}: the owner's cd-spines photo is required (it is gitignored and never committed)`,
    );
  }
  const rec = JSON.parse(fs.readFileSync(SAVED_READ, 'utf8')) as SavedRead;
  const outcome = classifyVisionRun(rec.run);
  if (!outcome.ok) {
    throw new Error(`saved read is not usable: ${outcome.kind}`);
  }
  const result = outcome.result;

  const image = await normalizeImage(fs.readFileSync(HEIC), 'heic', {
    maxEdge: VISION_MAX_EDGE,
    maxTokens: VISION_MAX_TOKENS,
  });
  const visionW = image.vision.width;
  const visionH = image.vision.height;
  if (visionW !== rec.image.sentW || visionH !== rec.image.sentH) {
    throw new Error(
      `vision image is ${visionW}x${visionH}, the saved read saw ${rec.image.sentW}x${rec.image.sentH}`,
    );
  }

  fs.mkdirSync(path.dirname(SHELF), { recursive: true });
  fs.mkdirSync(ASSETS, { recursive: true });
  fs.writeFileSync(path.join(ASSETS, 'vision.jpg'), image.vision.jpeg);
  fs.writeFileSync(path.join(ASSETS, 'thumb.webp'), image.thumb.webp);
  fs.rmSync(CROPS, { recursive: true, force: true });
  fs.mkdirSync(CROPS, { recursive: true });

  // The cropDetections loop of scan-photo.ts, plus the D-18 downscale.
  const source = await cropSourceFor(image);
  const detections: Array<{ idx: number; box: Box | null }> = [];
  const spines: ShelfSpine[] = [];
  let cropBytes = 0;
  for (const [position, read] of result.spines.entries()) {
    const key = String(position).padStart(2, '0');
    const idx = Number.isFinite(read.index) ? Math.round(read.index) : position;
    const box = normalizeBox(read.bbox, visionW, visionH);
    let crop: ShelfSpine['crop'] = null;
    if (box && SPINE_MEDIA_KINDS.includes(read.media_kind)) {
      const padded = padBox(box, visionW, visionH);
      const region = scaleBox(
        padded,
        { w: visionW, h: visionH },
        { w: source.width, h: source.height },
      );
      const cut = await cropSpine(source, region, read.text_orientation);
      const { data, info } = await sharp(cut.webp)
        .resize(CROP_MAX_EDGE, CROP_MAX_EDGE, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: CROP_WEBP_QUALITY })
        .toBuffer({ resolveWithObject: true });
      const file = `crops/${key}.webp`;
      fs.writeFileSync(path.join(ASSETS, file), data);
      cropBytes += data.byteLength;
      crop = { file, width: info.width, height: info.height };
    }
    detections.push({ idx, box });
    spines.push({
      key,
      index: idx,
      legibility: read.legibility ?? null,
      mediaKind: read.media_kind ?? null,
      textOrientation: read.text_orientation ?? null,
      crop,
      fields: SPINE_FIELDS.map((field) => ({
        field,
        value: read[field].value,
        confidence: read[field].confidence,
      })),
    });
  }

  const densityFlags: DensityFlag[] = computeDensityFlags(detections, {
    maxSpines: DEFAULT_DENSITY_MAX_SPINES,
    minShortSidePx: DEFAULT_DENSITY_MIN_SHORT_SIDE_PX,
  });

  const shelf = {
    source: {
      read: READ_NAME,
      model: rec.config.model,
      effort: rec.config.effort,
    },
    photo: {
      filename: 'cd-spines.heic',
      sentW: visionW,
      sentH: visionH,
      spineCountEstimate: Number.isFinite(result.spine_count_estimate)
        ? Math.round(result.spine_count_estimate)
        : null,
      detectedCount: spines.length,
      densityFlags,
      vision: 'vision.jpg',
      thumb: 'thumb.webp',
    },
    spines,
  };
  fs.writeFileSync(SHELF, `${JSON.stringify(shelf, null, 2)}\n`);

  console.log(
    `demo:assets ${spines.filter((s) => s.crop).length} crops, ${cropBytes} crop bytes, ${image.vision.jpeg.byteLength} vision bytes`,
  );
  expect(spines.length).toBe(result.spines.length);
});
