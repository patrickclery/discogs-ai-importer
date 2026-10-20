import 'server-only';

// Official model-tier resize, copied from the reference implementation at
// https://platform.claude.com/docs/en/build-with-claude/vision-coordinates
// (Pattern 3). The image sent to Claude is exactly resizedSize() of the
// upright image, so the model sees it unscaled and its boxes are 1:1.

export function countImageTokens(width: number, height: number): number {
  return Math.ceil(width / 28) * Math.ceil(height / 28);
}

function roundTiesToEven(value: number): number {
  const floor = Math.floor(value);
  if (value - floor !== 0.5) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
}

export function resizedSize(
  width: number,
  height: number,
  maxEdge = 1568,
  maxTokens = 1568,
): [number, number] {
  const fits = (w: number, h: number): boolean =>
    Math.ceil(w / 28) * 28 <= maxEdge &&
    Math.ceil(h / 28) * 28 <= maxEdge &&
    countImageTokens(w, h) <= maxTokens;
  if (fits(width, height)) return [width, height];
  if (height > width) {
    const [rh, rw] = resizedSize(height, width, maxEdge, maxTokens);
    return [rw, rh];
  }
  const aspectRatio = width / height;
  let lo = 1;
  let hi = width;
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid, Math.max(roundTiesToEven(mid / aspectRatio), 1))) lo = mid;
    else hi = mid;
  }
  return [lo, Math.max(roundTiesToEven(lo / aspectRatio), 1)];
}
