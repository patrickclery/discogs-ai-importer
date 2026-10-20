// D-01 vision spike harness. Runs the production vision modules on the
// owner's real shelf photos with live `claude -p` calls (subscription quota).
// Never part of `pnpm test`.
//
//   SPIKE_STEPS=one corepack pnpm spike:vision
//
// Env:
//   SPIKE_STEPS      comma list of steps to run (this plan: one)
//   SPIKE_MAX_CALLS  live-call budget per invocation (default 24)
//   SPIKE_FORCE=1    re-send a configuration that already has a record
//
// Recorded CLI results are committed under test/fixtures/vision/spike/.
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
import type { RunResult } from '@/server/proc/run';
import { classifyVisionRun } from '@/server/vision/parse';
import { runVisionCall } from '@/server/vision/run';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PHOTOS_DIR = path.join(ROOT, 'fixtures/spike');
const OUT_DIR = path.join(PHOTOS_DIR, 'out');
const RECORD_DIR = path.join(ROOT, 'test/fixtures/vision/spike');

const STEPS = new Set(
  (process.env.SPIKE_STEPS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);
const MAX_CALLS = Number(process.env.SPIKE_MAX_CALLS ?? 24);
const FORCE = process.env.SPIKE_FORCE === '1';

let liveCalls = 0;

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
  slug: string;
  config: SpikeConfig;
  image: SpikeRecord['image'];
  imagePath: string;
}): Promise<{ record: SpikeRecord; live: boolean }> {
  const { slug, config } = opts;
  const file = recordPath(slug, config.model, config.effort);
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
  fs.mkdirSync(RECORD_DIR, { recursive: true });
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
        slug,
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
});
