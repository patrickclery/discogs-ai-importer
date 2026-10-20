import type { Box } from '../images/crop';
import { textSimilarity } from './levenshtein';

// Re-scan pairing of old spines with a new run's detections (CONTEXT D-14,
// RESEARCH Pattern 6). Geometry is the main signal, raw-text similarity the
// minor one, and Claude's index only breaks ties. Pairing is greedy and one
// to one in descending score, above MATCH_CUTOFF. Pure: no DB, no I/O.

/** One side of a candidate pair: a detection box in its own run's pixels. */
export type MatchItem = {
  key: string;
  idx: number;
  box: Box | null;
  /** The vision image size of the run this box was read in. */
  visionW: number;
  visionH: number;
  rawText: string | null;
};

export type MatchPair = { old: MatchItem; new: MatchItem; score: number };

export type MatchResult = {
  pairs: MatchPair[];
  unmatchedOld: MatchItem[];
  unmatchedNew: MatchItem[];
};

/** Weight of the geometry score; text gets the rest (tuned in Plan 02-10). */
export const GEO_WEIGHT = 0.8;
export const TEXT_WEIGHT = 1 - GEO_WEIGHT;
/** Centre distance, in mean short sides, at which the distance score is 0. */
export const DISTANCE_REACH = 3;
/** Pairs scoring below this stay unmatched. */
export const MATCH_CUTOFF = 0.5;

type Unit = { x1: number; y1: number; x2: number; y2: number };

/**
 * The box divided by its run's vision size (so runs with different vision
 * sizes compare), then scaled by that run's aspect ratio so x and y share
 * one unit: distances and short sides are not stretched on tall photos.
 */
function toUnit(item: MatchItem): Unit | null {
  const { box, visionW: w, visionH: h } = item;
  if (!box || !(w > 0) || !(h > 0)) return null;
  const long = Math.max(w, h);
  const sx = w / long;
  const sy = h / long;
  return {
    x1: (box.x1 / w) * sx,
    y1: (box.y1 / h) * sy,
    x2: (box.x2 / w) * sx,
    y2: (box.y2 / h) * sy,
  };
}

function area(b: Unit): number {
  return Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
}

/** 2-D intersection over union (never horizontal overlap alone). */
function iou(a: Unit, b: Unit): number {
  const ix = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const iy = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  if (ix <= 0 || iy <= 0) return 0;
  const inter = ix * iy;
  const union = area(a) + area(b) - inter;
  return union > 0 ? inter / union : 0;
}

function shortSide(b: Unit): number {
  return Math.min(b.x2 - b.x1, b.y2 - b.y1);
}

function centreDistance(a: Unit, b: Unit): number {
  const dx = (a.x1 + a.x2) / 2 - (b.x1 + b.x2) / 2;
  const dy = (a.y1 + a.y2) / 2 - (b.y1 + b.y2) / 2;
  return Math.hypot(dx, dy);
}

/**
 * Centre distance between two items in mean short sides (Infinity when a box
 * is missing). Exported for the fixture tests' one-short-side bound.
 */
export function centreDistanceInShortSides(a: MatchItem, b: MatchItem): number {
  const ua = toUnit(a);
  const ub = toUnit(b);
  if (!ua || !ub) return Number.POSITIVE_INFINITY;
  const meanShort = 0.5 * (shortSide(ua) + shortSide(ub));
  return meanShort > 0
    ? centreDistance(ua, ub) / meanShort
    : Number.POSITIVE_INFINITY;
}

/** max(IoU, distance score) in [0, 1]; 0 when either box is missing. */
export function geometryScore(a: MatchItem, b: MatchItem): number {
  const ua = toUnit(a);
  const ub = toUnit(b);
  if (!ua || !ub) return 0;
  const reach = 0.5 * (shortSide(ua) + shortSide(ub)) * DISTANCE_REACH;
  const near = reach > 0 ? 1 - centreDistance(ua, ub) / reach : 0;
  const geo = Math.max(iou(ua, ub), near);
  return Math.min(1, Math.max(0, geo));
}

/** score = 0.8 x geometry + 0.2 x raw-text similarity. */
export function pairScore(a: MatchItem, b: MatchItem): number {
  return (
    GEO_WEIGHT * geometryScore(a, b) +
    TEXT_WEIGHT * textSimilarity(a.rawText, b.rawText)
  );
}

/**
 * Scores every old x new pair, sorts by score descending (then by the
 * smaller index difference), and assigns greedily one to one while the
 * score is at least MATCH_CUTOFF.
 */
export function matchDetections(
  oldItems: readonly MatchItem[],
  newItems: readonly MatchItem[],
): MatchResult {
  const candidates: { o: number; n: number; score: number; gap: number }[] = [];
  oldItems.forEach((o, oi) => {
    newItems.forEach((n, ni) => {
      const score = pairScore(o, n);
      if (score >= MATCH_CUTOFF) {
        candidates.push({ o: oi, n: ni, score, gap: Math.abs(o.idx - n.idx) });
      }
    });
  });
  candidates.sort((a, b) => b.score - a.score || a.gap - b.gap);

  const usedOld = new Set<number>();
  const usedNew = new Set<number>();
  const pairs: MatchPair[] = [];
  for (const c of candidates) {
    if (usedOld.has(c.o) || usedNew.has(c.n)) continue;
    usedOld.add(c.o);
    usedNew.add(c.n);
    pairs.push({ old: oldItems[c.o], new: newItems[c.n], score: c.score });
  }
  return {
    pairs,
    unmatchedOld: oldItems.filter((_, i) => !usedOld.has(i)),
    unmatchedNew: newItems.filter((_, i) => !usedNew.has(i)),
  };
}
