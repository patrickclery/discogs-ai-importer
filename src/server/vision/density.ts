import 'server-only';
import type { DensityFlag } from '@/lib/scan-types';
import type { Box } from '../images/crop';

// D-03 density flags. Not implemented yet.

export function iou(_a: Box, _b: Box): number {
  return 0;
}

export function computeDensityFlags(
  _detections: ReadonlyArray<{ idx: number; box: Box | null }>,
  _thresholds: { maxSpines: number; minShortSidePx: number },
): DensityFlag[] {
  return [];
}
