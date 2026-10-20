import 'server-only';
import decodeHeic from 'heic-decode';
import sharp, { type Metadata, type Sharp } from 'sharp';
import {
  THUMB_LONG_EDGE,
  VISION_JPEG_MAX_BYTES,
  VISION_JPEG_MIN_QUALITY,
  VISION_JPEG_QUALITY,
} from '@/lib/vision-contract';
import { resizedSize } from './resize';

// Deterministic normalization (RESEARCH Pattern 3, the pixel-space contract):
// decode, apply orientation, materialize the upright image once as raw RGB,
// and derive the vision JPEG and the thumbnail from those exact pixels. The
// vision JPEG is a pure resize of the upright image (same frame, no crop),
// so a box in vision space maps to upright space by a plain scale.

export type ImageKind = 'jpeg' | 'png' | 'webp' | 'heic';

export type ImageDecodeErrorKind =
  | 'heic_decode'
  | 'image_unreadable'
  | 'too_large';

export class ImageDecodeError extends Error {
  readonly kind: ImageDecodeErrorKind;
  constructor(kind: ImageDecodeErrorKind, message: string) {
    super(message);
    this.name = 'ImageDecodeError';
    this.kind = kind;
  }
}

export type RawImage = {
  data: Buffer;
  width: number;
  height: number;
  channels: 3;
};

export type NormalizedImage = {
  upright: RawImage;
  vision: {
    jpeg: Buffer;
    width: number;
    height: number;
    quality: number;
    /** The long-edge limit the size was computed with (WR-03). */
    maxEdge: number;
  };
  thumb: { webp: Buffer; width: number; height: number };
};

/** Decompression-bomb guard (RESEARCH Security). */
const MAX_SOURCE_PIXELS = 100_000_000;

/**
 * WR-03: when even the lowest quality is over VISION_JPEG_MAX_BYTES, the
 * vision image is made smaller rather than sent oversize. Bytes grow with the
 * pixel count, so each step scales the long edge by the square root of the
 * byte overshoot (with a margin, and at least 10% off), down to this long
 * edge, below which the photo is refused.
 */
const VISION_SHRINK_MARGIN = 0.95;
const VISION_SHRINK_MAX_FACTOR = 0.9;
const VISION_MIN_EDGE = 512;

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function openSource(input: Buffer, kind: ImageKind): Promise<Sharp> {
  if (kind === 'heic') {
    // WR-02: read the primary image's size from the container and refuse a
    // bomb before decode() allocates width x height x 4 bytes.
    let images: Awaited<ReturnType<typeof decodeHeic.all>>;
    try {
      images = await decodeHeic.all({ buffer: input });
    } catch (err) {
      throw new ImageDecodeError('heic_decode', message(err));
    }
    let decoded: Awaited<ReturnType<typeof decodeHeic>>;
    try {
      const first = images[0];
      if (!first) throw new ImageDecodeError('heic_decode', 'no image found');
      if (first.width * first.height > MAX_SOURCE_PIXELS) {
        throw new ImageDecodeError(
          'too_large',
          `${first.width}x${first.height} is too large`,
        );
      }
      try {
        decoded = await first.decode();
      } catch (err) {
        throw new ImageDecodeError('heic_decode', message(err));
      }
    } finally {
      images.dispose();
    }
    const { width, height, data } = decoded;
    // D-05: raw RGBA straight into sharp, no intermediate JPEG. libheif has
    // already applied the container transforms, so there is no EXIF to apply.
    return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
      raw: { width, height, channels: 4 },
    }).removeAlpha();
  }

  let meta: Metadata;
  try {
    meta = await sharp(input, { failOn: 'error' }).metadata();
  } catch (err) {
    throw new ImageDecodeError('image_unreadable', message(err));
  }
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new ImageDecodeError('image_unreadable', 'no dimensions');
  if (w * h > MAX_SOURCE_PIXELS) {
    throw new ImageDecodeError('too_large', `${w}x${h} is too large`);
  }
  return sharp(input, {
    failOn: 'error',
    limitInputPixels: MAX_SOURCE_PIXELS,
  }).autoOrient();
}

async function materializeUpright(img: Sharp): Promise<RawImage> {
  try {
    const { data, info } = await img
      .removeAlpha()
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.channels !== 3) {
      throw new Error(`expected 3 channels, got ${info.channels}`);
    }
    return { data, width: info.width, height: info.height, channels: 3 };
  } catch (err) {
    if (err instanceof ImageDecodeError) throw err;
    throw new ImageDecodeError('image_unreadable', message(err));
  }
}

function fromRaw(src: RawImage): Sharp {
  return sharp(src.data, {
    raw: { width: src.width, height: src.height, channels: src.channels },
  });
}

/**
 * Vision JPEG at the exact resized size, at the highest quality step that is
 * at most VISION_JPEG_MAX_BYTES, else at VISION_JPEG_MIN_QUALITY (which the
 * caller then checks).
 */
async function encodeVision(
  upright: RawImage,
  w: number,
  h: number,
): Promise<Omit<NormalizedImage['vision'], 'maxEdge'>> {
  const resized = await fromRaw(upright)
    .resize(w, h, { fit: 'fill' })
    .raw()
    .toBuffer();
  const small: RawImage = { data: resized, width: w, height: h, channels: 3 };
  let quality = VISION_JPEG_QUALITY;
  let jpeg = await fromRaw(small).jpeg({ quality, mozjpeg: true }).toBuffer();
  while (
    jpeg.length > VISION_JPEG_MAX_BYTES &&
    quality - 5 >= VISION_JPEG_MIN_QUALITY
  ) {
    quality -= 5;
    jpeg = await fromRaw(small).jpeg({ quality, mozjpeg: true }).toBuffer();
  }
  const meta = await sharp(jpeg).metadata();
  if (meta.width !== w || meta.height !== h) {
    throw new Error(
      `vision JPEG is ${meta.width}x${meta.height}, expected ${w}x${h}`,
    );
  }
  return { jpeg, width: w, height: h, quality };
}

export async function normalizeImage(
  input: Buffer,
  kind: ImageKind,
  opts: { maxEdge: number; maxTokens: number },
): Promise<NormalizedImage> {
  const upright = await materializeUpright(await openSource(input, kind));
  // The CLI Read tool re-encodes an image above VISION_JPEG_MAX_BYTES, and
  // then Claude would not see the stored image.jpg (WR-03). Deterministic, so
  // a reparse of the same original gets the same size.
  let maxEdge = opts.maxEdge;
  let vision: NormalizedImage['vision'];
  for (;;) {
    const [w, h] = resizedSize(
      upright.width,
      upright.height,
      maxEdge,
      opts.maxTokens,
    );
    vision = { ...(await encodeVision(upright, w, h)), maxEdge };
    if (vision.jpeg.length <= VISION_JPEG_MAX_BYTES) break;
    const factor = Math.min(
      VISION_SHRINK_MAX_FACTOR,
      Math.sqrt(VISION_JPEG_MAX_BYTES / vision.jpeg.length) *
        VISION_SHRINK_MARGIN,
    );
    const next = Math.floor(Math.max(w, h) * factor);
    if (next < VISION_MIN_EDGE) {
      throw new ImageDecodeError(
        'too_large',
        `the vision image is over ${VISION_JPEG_MAX_BYTES} bytes even at ${w}x${h}`,
      );
    }
    console.warn(
      `normalizeImage: ${w}x${h} is ${vision.jpeg.length} bytes at quality ${vision.quality}; retrying with long edge ${next}`,
    );
    maxEdge = next;
  }

  const { data: webp, info } = await fromRaw(upright)
    .resize(THUMB_LONG_EDGE, THUMB_LONG_EDGE, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });

  return {
    upright,
    vision,
    thumb: { webp, width: info.width, height: info.height },
  };
}
