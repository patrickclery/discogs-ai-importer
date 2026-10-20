import 'server-only';
import type { DensityFlag } from '@/lib/scan-types';
import type { Box } from '../images/crop';

// D-03 density flags, computed after parsing and layout-agnostic (RESEARCH
// Pitfall 5): the owner's shelves are stacked columns, so neither
// left-to-right order nor horizontal-only overlap means anything. The flags
// are warnings for a "retake closer" badge only; no detection is ever
// removed and there is no hard cap (VIS-03).

/** Any pair above this IoU is an overlap; touching boxes have IoU 0. */
export const OVERLAP_IOU = 0.3;
/** Consecutive indexes farther apart than this many median short sides jump. */
const JUMP_SHORT_SIDES = 3;
/** Share of consecutive-index pairs that may jump (one column change is fine). */
const MAX_JUMP_SHARE = 0.2;

export function iou(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const iy = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const inter = ix * iy;
  const area = (r: Box) => (r.x2 - r.x1) * (r.y2 - r.y1);
  const union = area(a) + area(b) - inter;
  return union > 0 ? inter / union : 0;
}

function shortSide(b: Box): number {
  return Math.min(b.x2 - b.x1, b.y2 - b.y1);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function centreDistance(a: Box, b: Box): number {
  const dx = (a.x1 + a.x2) / 2 - (b.x1 + b.x2) / 2;
  const dy = (a.y1 + a.y2) / 2 - (b.y1 + b.y2) / 2;
  return Math.hypot(dx, dy);
}

function anyOverlap(boxes: Box[]): boolean {
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      if (iou(boxes[i], boxes[j]) > OVERLAP_IOU) return true;
    }
  }
  return false;
}

/**
 * Claude repeated an index, or more than 20% of consecutive-index pairs are
 * farther apart than 3x the median short side (spines read in a scattered
 * order rather than neighbour by neighbour).
 */
function outOfOrder(
  detections: ReadonlyArray<{ idx: number; box: Box | null }>,
  medianShort: number | null,
): boolean {
  const seen = new Set<number>();
  for (const d of detections) {
    if (seen.has(d.idx)) return true;
    seen.add(d.idx);
  }
  if (medianShort === null || medianShort <= 0) return false;
  const placed = detections
    .filter((d): d is { idx: number; box: Box } => d.box !== null)
    .sort((a, b) => a.idx - b.idx);
  const pairs = placed.length - 1;
  if (pairs < 1) return false;
  let jumps = 0;
  for (let i = 1; i < placed.length; i += 1) {
    const dist = centreDistance(placed[i - 1].box, placed[i].box);
    if (dist > JUMP_SHORT_SIDES * medianShort) jumps += 1;
  }
  return jumps / pairs > MAX_JUMP_SHARE;
}

/** Flags over every detection of a run (every media kind). Pure. */
export function computeDensityFlags(
  detections: ReadonlyArray<{ idx: number; box: Box | null }>,
  thresholds: { maxSpines: number; minShortSidePx: number },
): DensityFlag[] {
  const flags: DensityFlag[] = [];
  const boxes = detections
    .map((d) => d.box)
    .filter((b): b is Box => b !== null);
  const medianShort = median(boxes.map(shortSide));

  if (detections.length > thresholds.maxSpines) flags.push('too_many_spines');
  if (medianShort !== null && medianShort < thresholds.minShortSidePx) {
    flags.push('small_spines');
  }
  if (anyOverlap(boxes)) flags.push('overlapping');
  if (outOfOrder(detections, medianShort)) flags.push('out_of_order');
  return flags;
}
