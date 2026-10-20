import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import decodeHeic from 'heic-decode';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  VISION_JPEG_MAX_BYTES,
  VISION_MAX_EDGE,
  VISION_MAX_TOKENS,
} from '@/lib/vision-contract';
import { ImageDecodeError, normalizeImage } from './normalize';
import { resizedSize } from './resize';

// INGEST-05 and RESEARCH Pattern 3. Owner photos under fixtures/spike/ are
// gitignored, so the HEIC cases skip on a fresh clone (RESEARCH A8).

const TIER = { maxEdge: VISION_MAX_EDGE, maxTokens: VISION_MAX_TOKENS };
const SPIKE_DIR = path.resolve(import.meta.dirname, '../../../fixtures/spike');
const HEICS = fs.existsSync(SPIKE_DIR)
  ? fs
      .readdirSync(SPIKE_DIR)
      .filter((f) => /\.(heic|heif)$/i.test(f))
      .sort()
  : [];
// One photo keeps `pnpm test` fast; the spike matrix checks every photo.
const HEIC =
  HEICS.find((f) => f === 'cd-spines.heic') ?? (HEICS[0] as string | undefined);
const HAS_HEIF_INFO = spawnSync('heif-info', ['--version']).error === undefined;

/** A 400x300 JPEG whose EXIF orientation is 6 (display rotated 90 cw). */
async function exif6Jpeg(): Promise<Buffer> {
  return sharp({
    create: {
      width: 400,
      height: 300,
      channels: 3,
      background: { r: 40, g: 120, b: 200 },
    },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

describe('normalizeImage', () => {
  it('applies EXIF orientation 6 before resizing: 400x300 comes out 300x400', async () => {
    const out = await normalizeImage(await exif6Jpeg(), 'jpeg', TIER);
    expect([out.upright.width, out.upright.height]).toEqual([300, 400]);
  });

  it('the vision JPEG decodes to exactly resizedSize and is at most 500000 bytes', async () => {
    const out = await normalizeImage(await exif6Jpeg(), 'jpeg', TIER);
    const meta = await sharp(out.vision.jpeg).metadata();
    expect([meta.width, meta.height]).toEqual(
      resizedSize(300, 400, TIER.maxEdge, TIER.maxTokens),
    );
    expect(out.vision.jpeg.length).toBeLessThanOrEqual(VISION_JPEG_MAX_BYTES);
    expect(VISION_JPEG_MAX_BYTES).toBe(500_000);
  });

  it('downsizes a large image to the tier size', async () => {
    const big = await sharp({
      create: {
        width: 4000,
        height: 3000,
        channels: 3,
        background: { r: 10, g: 10, b: 10 },
      },
    })
      .jpeg()
      .toBuffer();
    const out = await normalizeImage(big, 'jpeg', TIER);
    expect([out.vision.width, out.vision.height]).toEqual(
      resizedSize(4000, 3000, TIER.maxEdge, TIER.maxTokens),
    );
    expect([out.upright.width, out.upright.height]).toEqual([4000, 3000]);
  });

  it('random bytes throw ImageDecodeError with kind image_unreadable', async () => {
    const junk = Buffer.from(
      Array.from({ length: 4096 }, (_, i) => (i * 7919) % 256),
    );
    const err = await normalizeImage(junk, 'jpeg', TIER).catch((e) => e);
    expect(err).toBeInstanceOf(ImageDecodeError);
    expect((err as ImageDecodeError).kind).toBe('image_unreadable');
  });

  it('random bytes declared as HEIC throw ImageDecodeError heic_decode', async () => {
    const junk = Buffer.alloc(2048, 7);
    const err = await normalizeImage(junk, 'heic', TIER).catch((e) => e);
    expect(err).toBeInstanceOf(ImageDecodeError);
    expect((err as ImageDecodeError).kind).toBe('heic_decode');
  });

  it.skipIf(!HEIC)(
    'a spike HEIC comes out at the dimensions heic-decode reports',
    async () => {
      const buf = fs.readFileSync(path.join(SPIKE_DIR, HEIC as string));
      const decoded = await decodeHeic({ buffer: buf });
      const out = await normalizeImage(buf, 'heic', TIER);
      expect([out.upright.width, out.upright.height]).toEqual([
        decoded.width,
        decoded.height,
      ]);
      expect([out.vision.width, out.vision.height]).toEqual(
        resizedSize(decoded.width, decoded.height, 2576, 4784),
      );
      expect(out.vision.jpeg.length).toBeLessThanOrEqual(VISION_JPEG_MAX_BYTES);

      // Pitfall 4: libheif applies irot/imir, so the decoded size is
      // heif-info's size, swapped only if a quarter-turn was not applied.
      if (HAS_HEIF_INFO) {
        const file = path.join(SPIKE_DIR, HEIC as string);
        const info = spawnSync('heif-info', [file], {
          encoding: 'utf8',
        }).stdout;
        const size = /image: (\d+)x(\d+)/.exec(info);
        const angle = Number(/angle \(ccw\): (\d+)/.exec(info)?.[1] ?? 0);
        expect(size).not.toBeNull();
        const [w, h] = [Number(size?.[1]), Number(size?.[2])];
        const got = [out.upright.width, out.upright.height];
        if (angle % 180 === 0) expect(got).toEqual([w, h]);
        else expect([...got].sort()).toEqual([w, h].sort());
      }
    },
    60_000,
  );
});
