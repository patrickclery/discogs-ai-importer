import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  SPINE_MEDIA_KINDS,
  TEXT_ORIENTATIONS,
  VISION_MAX_EDGE,
  VISION_MAX_TOKENS,
} from '@/lib/vision-contract';
import { classifyVisionRun } from '@/server/vision/parse';
import {
  LAYOUTS,
  makeSyntheticShelf,
} from '../../../test/fixtures/vision/synthetic-shelf.mjs';
import {
  cropSpine,
  normalizeBox,
  ORIENTATION_ANGLE,
  padBox,
  scaleBox,
} from './crop';
import { normalizeImage, type RawImage } from './normalize';

// Crop geometry (VIS-04, RESEARCH Pattern 5 and A4). Synthetic spines carry a
// red square at their reading-start end; an upright crop has it on the left.

const ROOT = path.resolve(import.meta.dirname, '../../..');
const W = 1449;
const H = 2576;

async function rawOf(jpeg: Buffer): Promise<RawImage> {
  const { data, info } = await sharp(jpeg)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: 3 };
}

/** Mean x of the red marker pixels as a fraction of the width, or null. */
async function markerX(webp: Buffer): Promise<number | null> {
  const { data, info } = await sharp(webp)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0;
  let n = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const i = (y * info.width + x) * 3;
      if (data[i] > 180 && data[i + 1] < 80 && data[i + 2] < 80) {
        sum += x;
        n += 1;
      }
    }
  }
  return n ? sum / n / info.width : null;
}

describe('ORIENTATION_ANGLE', () => {
  it('maps each text_orientation to the clockwise angle that makes it upright', () => {
    expect(ORIENTATION_ANGLE).toEqual({
      horizontal: 0,
      upside_down: 180,
      top_to_bottom: 270,
      bottom_to_top: 90,
    });
  });
});

describe('cropSpine on synthetic spines', () => {
  const shelf = makeSyntheticShelf(LAYOUTS.tracerShelf);
  const raw = shelf.then((s) => rawOf(s.jpeg));

  it.each(TEXT_ORIENTATIONS)(
    '%s crop comes out horizontal with the start marker in the left third',
    async (orientation) => {
      const { truth, width, height } = await shelf;
      const spine = truth.find((s) => s.orientation === orientation);
      expect(spine).toBeDefined();
      if (!spine) return;
      const box = normalizeBox(
        [spine.x1, spine.y1, spine.x2, spine.y2],
        width,
        height,
      );
      expect(box).not.toBeNull();
      if (!box) return;
      const region = scaleBox(
        padBox(box, width, height),
        { w: width, h: height },
        { w: width, h: height },
      );
      const crop = await cropSpine(await raw, region, orientation);
      expect(crop.width).toBeGreaterThan(crop.height);
      const mx = await markerX(crop.webp);
      expect(mx).not.toBeNull();
      expect(mx as number).toBeLessThan(1 / 3);
    },
  );
});

describe('normalizeBox', () => {
  it('keeps coordinates exactly at 0 and exactly at the vision width and height', () => {
    expect(normalizeBox([0, 0, W, H], W, H)).toEqual({
      x1: 0,
      y1: 0,
      x2: W,
      y2: H,
    });
  });

  it('clamps coordinates beyond the image to its edges', () => {
    expect(normalizeBox([-5, -5, W + 9, H + 9], W, H)).toEqual({
      x1: 0,
      y1: 0,
      x2: W,
      y2: H,
    });
  });

  it('rounds with Math.round before clamping', () => {
    expect(normalizeBox([10.5, 2.4, 20.6, 30.5], W, H)).toEqual({
      x1: 11,
      y1: 2,
      x2: 21,
      y2: 31,
    });
    expect(normalizeBox([-0.4, 0, W + 0.4, 10], W, H)).toEqual({
      x1: 0,
      y1: 0,
      x2: W,
      y2: 10,
    });
  });

  it('returns null for a box that is zero-area, before or after clamping', () => {
    expect(normalizeBox([10, 10, 10, 50], W, H)).toBeNull();
    expect(normalizeBox([W + 1, 0, W + 9, 9], W, H)).toBeNull();
  });

  it('returns null for a box that is not four finite numbers', () => {
    for (const bad of [
      [1, 2, 3],
      [1, 2, 3, 4, 5],
      ['a', 0, 1, 1],
      [0, 0, Number.NaN, 5],
      [0, 0, Number.POSITIVE_INFINITY, 5],
      null,
      'box',
    ]) {
      expect(normalizeBox(bad, W, H)).toBeNull();
    }
  });
});

describe('scaleBox', () => {
  it('floors left/top and ceils right/bottom so a crop never loses spine pixels', () => {
    const box = { x1: 101, y1: 203, x2: 150, y2: 1999 };
    const from = { w: 1449, h: 2576 };
    const to = { w: 4536, h: 8064 };
    const r = scaleBox(box, from, to);
    const sx = to.w / from.w;
    const sy = to.h / from.h;
    expect(r.left).toBe(Math.floor(box.x1 * sx));
    expect(r.top).toBe(Math.floor(box.y1 * sy));
    expect(r.left + r.width).toBe(Math.ceil(box.x2 * sx));
    expect(r.top + r.height).toBe(Math.ceil(box.y2 * sy));
    expect(r.left).toBeLessThanOrEqual(box.x1 * sx);
    expect(r.left + r.width).toBeGreaterThanOrEqual(box.x2 * sx);
  });

  it('clamps the scaled region inside the target image', () => {
    const r = scaleBox(
      { x1: 0, y1: 0, x2: 1449, y2: 2576 },
      { w: 1449, h: 2576 },
      { w: 4536, h: 8064 },
    );
    expect(r).toEqual({ left: 0, top: 0, width: 4536, height: 8064 });
  });
});

describe('adjacent spines', () => {
  it('two touching boxes give two independent padded crops that overlap', async () => {
    const width = 400;
    const height = 300;
    const src = await rawOf(
      await sharp({
        create: {
          width,
          height,
          channels: 3,
          background: { r: 90, g: 90, b: 90 },
        },
      })
        .jpeg()
        .toBuffer(),
    );
    const a = normalizeBox([50, 20, 350, 60], width, height);
    const b = normalizeBox([50, 60, 350, 100], width, height);
    expect(a && b).toBeTruthy();
    if (!a || !b) return;
    const ra = scaleBox(
      padBox(a, width, height),
      { w: width, h: height },
      { w: width, h: height },
    );
    const rb = scaleBox(
      padBox(b, width, height),
      { w: width, h: height },
      { w: width, h: height },
    );
    // Overlap along y: a's padded bottom is below b's padded top.
    expect(ra.top + ra.height).toBeGreaterThan(rb.top);
    const ca = await cropSpine(src, ra, 'horizontal');
    const cb = await cropSpine(src, rb, 'horizontal');
    expect([ca.width, ca.height]).toEqual([ra.width, ra.height]);
    expect([cb.width, cb.height]).toEqual([rb.width, rb.height]);
  });
});

describe('recorded spike boxes', () => {
  const recordFile = path.join(
    ROOT,
    'test/fixtures/vision/spike/cd-spines.claude-opus-5-5.medium.json',
  );
  const photo = path.join(ROOT, 'fixtures/spike/cd-spines.heic');
  const record = JSON.parse(fs.readFileSync(recordFile, 'utf8'));
  const outcome = classifyVisionRun(record.run);
  const sentW: number = record.image.sentW;
  const sentH: number = record.image.sentH;

  it('every kept spine of the recorded run normalizes to a box inside the sent image', () => {
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const kept = outcome.result.spines.filter((s) =>
      SPINE_MEDIA_KINDS.includes(s.media_kind),
    );
    expect(kept.length).toBeGreaterThan(0);
    for (const s of kept) {
      const box = normalizeBox(s.bbox, sentW, sentH);
      expect(box).not.toBeNull();
      if (!box) continue;
      expect(box.x2).toBeLessThanOrEqual(sentW);
      expect(box.y2).toBeLessThanOrEqual(sentH);
    }
  });

  it.skipIf(!fs.existsSync(photo))(
    'master crops of the recorded boxes on the real photo are wider than tall',
    async () => {
      if (!outcome.ok) throw new Error(outcome.detail);
      const norm = await normalizeImage(fs.readFileSync(photo), 'heic', {
        maxEdge: VISION_MAX_EDGE,
        maxTokens: VISION_MAX_TOKENS,
      });
      expect([norm.vision.width, norm.vision.height]).toEqual([sentW, sentH]);
      const { upright } = norm;
      const kept = outcome.result.spines
        .filter((s) => SPINE_MEDIA_KINDS.includes(s.media_kind))
        .slice(0, 12);
      for (const s of kept) {
        const box = normalizeBox(s.bbox, sentW, sentH);
        if (!box) continue;
        const crop = await cropSpine(
          upright,
          scaleBox(
            padBox(box, sentW, sentH),
            { w: sentW, h: sentH },
            { w: upright.width, h: upright.height },
          ),
          s.text_orientation,
        );
        expect(crop.width).toBeGreaterThan(crop.height);
      }
    },
    60_000,
  );
});
