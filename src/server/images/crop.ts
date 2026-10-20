import 'server-only';
import sharp from 'sharp';
import type { TextOrientation } from '@/lib/vision-contract';

// Crop geometry (RESEARCH Pattern 5). Boxes arrive in vision-image pixels as
// [x1, y1, x2, y2]. They are normalized, padded, scaled to the crop source,
// extracted and then rotated so the spine text reads left to right.

export type Box = { x1: number; y1: number; x2: number; y2: number };
export type Region = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Clockwise sharp rotation that makes the glyphs upright. top_to_bottom text
 * (tops facing right) needs a quarter turn counter-clockwise, i.e. 270.
 */
export const ORIENTATION_ANGLE: Record<TextOrientation, 0 | 90 | 180 | 270> = {
  horizontal: 0,
  upside_down: 180,
  top_to_bottom: 270,
  bottom_to_top: 90,
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** A valid integer box inside the vision image, or null. */
export function normalizeBox(
  raw: unknown,
  visionW: number,
  visionH: number,
): Box | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  if (!raw.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return null;
  }
  const [a, b, c, d] = (raw as number[]).map(Math.round);
  const x1 = clamp(Math.min(a, c), 0, visionW);
  const x2 = clamp(Math.max(a, c), 0, visionW);
  const y1 = clamp(Math.min(b, d), 0, visionH);
  const y2 = clamp(Math.max(b, d), 0, visionH);
  if (x2 - x1 <= 0 || y2 - y1 <= 0) return null;
  return { x1, y1, x2, y2 };
}

/**
 * Pads 15% of the short side (at least 3 px) across the short axis and 2% of
 * the long side along the long axis, then clamps to the image.
 */
export function padBox(box: Box, visionW: number, visionH: number): Box {
  const w = box.x2 - box.x1;
  const h = box.y2 - box.y1;
  const short = Math.min(w, h);
  const long = Math.max(w, h);
  const across = Math.max(3, Math.round(short * 0.15));
  const along = Math.round(long * 0.02);
  const [px, py] = w <= h ? [across, along] : [along, across];
  return {
    x1: clamp(box.x1 - px, 0, visionW),
    y1: clamp(box.y1 - py, 0, visionH),
    x2: clamp(box.x2 + px, 0, visionW),
    y2: clamp(box.y2 + py, 0, visionH),
  };
}

/** Maps a box between two frames of the same image (floor/ceil outward). */
export function scaleBox(
  box: Box,
  from: { w: number; h: number },
  to: { w: number; h: number },
): Region {
  const sx = to.w / from.w;
  const sy = to.h / from.h;
  const left = clamp(Math.floor(box.x1 * sx), 0, to.w - 1);
  const top = clamp(Math.floor(box.y1 * sy), 0, to.h - 1);
  const right = clamp(Math.ceil(box.x2 * sx), left + 1, to.w);
  const bottom = clamp(Math.ceil(box.y2 * sy), top + 1, to.h);
  return { left, top, width: right - left, height: bottom - top };
}

/** Extracts the region from a raw RGB source, then rotates it upright. */
export async function cropSpine(
  source: { data: Buffer; width: number; height: number; channels: 3 },
  region: Region,
  orientation: TextOrientation,
): Promise<{ webp: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(source.data, {
    raw: {
      width: source.width,
      height: source.height,
      channels: source.channels,
    },
  })
    .extract(region)
    .rotate(ORIENTATION_ANGLE[orientation])
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  return { webp: data, width: info.width, height: info.height };
}
