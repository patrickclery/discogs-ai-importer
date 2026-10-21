// RED skeleton (03-06 Task 2): signatures only, implementation follows.
import type { StatusResponse } from './status-types';

export type Part = string | number;

export function partsText(parts: Part[]): string {
  return parts.join('');
}

export function headerParts(_input: {
  a: number;
  d: number;
  paused: boolean;
  failed: number;
}): { main: Part[]; failed: Part[] | null } {
  return { main: [], failed: null };
}

export function headerInputs(
  _data: StatusResponse,
  _now: number,
): {
  a: number;
  d: number;
  failed: number;
  paused: boolean;
  pausedSeconds: number;
} {
  return { a: 0, d: 0, failed: 0, paused: false, pausedSeconds: 0 };
}

export function discogsTooltipLines(_input: {
  connected: boolean;
  d: number;
  failedSpines: number;
  pausedSeconds: number;
}): Part[][] {
  return [];
}
