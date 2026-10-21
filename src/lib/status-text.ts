// Header status text (UI-SPEC "Header status indicator", D-07, Pitfall 8).
// Client-safe and pure: no server-only import here. Numbers stay numbers
// in the returned parts so the component can render them mono tabular-nums.

import type { StatusResponse } from './status-types';

export type Part = string | number;

export function partsText(parts: Part[]): string {
  return parts.join('');
}

function finiteCount(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * a: anthropic queued + running. d: the Discogs backlog. failed: failed
 * anthropic jobs only, because Discogs failures are counted per spine in
 * the tooltip (Pitfall 8). paused while pausedUntil is after now, with the
 * remaining whole seconds rounded up.
 */
export function headerInputs(
  data: StatusResponse,
  now: number,
): {
  a: number;
  d: number;
  failed: number;
  paused: boolean;
  pausedSeconds: number;
} {
  const anthropic = data.jobs?.anthropic;
  const a = finiteCount(anthropic?.queued) + finiteCount(anthropic?.running);
  const d = finiteCount(data.discogs?.backlog);
  const failed = finiteCount(anthropic?.failed);
  const until = data.discogs?.pausedUntil;
  const left =
    typeof until === 'number' && Number.isFinite(until) ? until - now : 0;
  const pausedSeconds = left > 0 ? Math.ceil(left / 1000) : 0;
  return { a, d, failed, paused: pausedSeconds > 0, pausedSeconds };
}

/** The header text segments and the failed suffix (null when 0). */
export function headerParts(input: {
  a: number;
  d: number;
  paused: boolean;
  failed: number;
}): { main: Part[]; failed: Part[] | null } {
  const { a, d, paused } = input;
  let main: Part[];
  if (a === 0 && d === 0) main = ['Worker idle'];
  else if (d === 0) main = ['Working · ', a, ' queued'];
  else if (a === 0) {
    main = [paused ? 'Discogs paused · ' : 'Searching Discogs · ', d, ' left'];
  } else if (paused) main = ['Working · ', a, ' queued · Discogs paused'];
  else main = ['Working · ', a, ' queued · Discogs ', d, ' left'];
  const failed = input.failed > 0 ? [' · ', input.failed, ' failed'] : null;
  return { main, failed };
}

/** The tooltip's Discogs lines; the countdown line only while paused. */
export function discogsTooltipLines(input: {
  connected: boolean;
  d: number;
  failedSpines: number;
  pausedSeconds: number;
}): Part[][] {
  const { d, failedSpines, pausedSeconds } = input;
  const lines: Part[][] = input.connected
    ? [
        [
          'Discogs — ',
          d,
          ' left, ',
          failedSpines,
          failedSpines === 1 ? ' search failed' : ' searches failed',
        ],
      ]
    : [['Discogs — not connected']];
  if (pausedSeconds > 0) {
    lines.push([
      'Discogs asked the app to slow down. Searching picks up again in ',
      pausedSeconds,
      pausedSeconds === 1 ? ' second.' : ' seconds.',
    ]);
  }
  return lines;
}
