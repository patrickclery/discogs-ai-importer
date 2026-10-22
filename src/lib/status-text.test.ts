import { describe, expect, it } from 'vitest';
import {
  discogsTooltipLines,
  headerInputs,
  headerParts,
  partsText,
} from './status-text';
import type { StatusResponse } from './status-types';

// Header status text (UI-SPEC "Header status indicator", D-07, Pitfall 8).
// Numbers are returned as numbers so the component renders them in Num.

function header(input: Parameters<typeof headerParts>[0]): string {
  return partsText(headerParts(input).main);
}

describe('headerParts', () => {
  it.each([
    [{ a: 0, d: 0, paused: false }, 'Worker idle'],
    [{ a: 0, d: 0, paused: true }, 'Worker idle'],
    [{ a: 2, d: 0, paused: false }, 'Working · 2 queued'],
    [{ a: 0, d: 34, paused: false }, 'Searching Discogs · 34 left'],
    [{ a: 0, d: 34, paused: true }, 'Discogs paused · 34 left'],
    [{ a: 1, d: 3, paused: false }, 'Working · 1 queued · Discogs 3 left'],
    [{ a: 1, d: 3, paused: true }, 'Working · 1 queued · Discogs paused'],
  ])('%j reads %s', (input, text) => {
    expect(header({ ...input, failed: 0 })).toBe(text);
  });

  it.each([
    [{ a: 0, d: 3, paused: false }, 'Adding to Discogs · 3 left'],
    [
      { a: 2, d: 3, paused: false },
      'Working · 2 queued · Adding to Discogs · 3 left',
    ],
    [{ a: 0, d: 3, paused: true }, 'Discogs paused · 3 left'],
    [{ a: 2, d: 3, paused: true }, 'Working · 2 queued · Discogs paused'],
    [{ a: 2, d: 0, paused: false }, 'Working · 2 queued'],
  ])('imports only: %j reads %s', (input, text) => {
    expect(header({ ...input, failed: 0, importsOnly: true })).toBe(text);
  });

  it('importsOnly false keeps the Phase 3 wording', () => {
    expect(
      header({ a: 0, d: 3, paused: false, failed: 0, importsOnly: false }),
    ).toBe('Searching Discogs · 3 left');
    expect(
      header({ a: 1, d: 3, paused: false, failed: 0, importsOnly: false }),
    ).toBe('Working · 1 queued · Discogs 3 left');
  });

  it('the import wording keeps every count a number', () => {
    expect(
      headerParts({ a: 2, d: 3, paused: false, failed: 0, importsOnly: true })
        .main,
    ).toEqual(['Working · ', 2, ' queued · Adding to Discogs · ', 3, ' left']);
  });

  it('marks every count as a number for the mono Num', () => {
    expect(headerParts({ a: 1, d: 3, paused: false, failed: 0 }).main).toEqual([
      'Working · ',
      1,
      ' queued · Discogs ',
      3,
      ' left',
    ]);
  });

  it('adds the failed suffix only when the failed count is at least 1', () => {
    expect(headerParts({ a: 0, d: 0, paused: false, failed: 0 }).failed).toBe(
      null,
    );
    const parts = headerParts({ a: 0, d: 0, paused: false, failed: 2 });
    expect(partsText(parts.failed ?? [])).toBe(' · 2 failed');
  });
});

function status(over: Partial<StatusResponse> = {}): StatusResponse {
  const lane = { queued: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0 };
  return {
    worker: { bootId: 'b', startedAt: 1, starts: 1, pid: 1 },
    jobs: { anthropic: { ...lane }, discogs: { ...lane } },
    lease: null,
    discogs: {
      connected: true,
      backlog: 0,
      pausedUntil: null,
      failedSpines: 0,
      imports: { left: 0, failed: 0 },
    },
    ...over,
  };
}

describe('headerInputs', () => {
  it('a is anthropic queued + running, d the Discogs backlog', () => {
    const data = status();
    data.jobs.anthropic.queued = 2;
    data.jobs.anthropic.running = 1;
    data.jobs.discogs.queued = 40;
    data.discogs.backlog = 7;
    const input = headerInputs(data, 1000);
    expect(input.a).toBe(3);
    expect(input.d).toBe(7);
  });

  it('the failed suffix counts failed anthropic jobs only (Pitfall 8)', () => {
    const data = status();
    data.jobs.anthropic.failed = 2;
    data.jobs.discogs.failed = 9;
    data.discogs.failedSpines = 4;
    expect(headerInputs(data, 1000).failed).toBe(2);
  });

  it('importsLeft and importsFailed come from discogs.imports', () => {
    const data = status();
    data.discogs.backlog = 5;
    data.discogs.imports = { left: 2, failed: 4 };
    expect(headerInputs(data, 1000)).toMatchObject({
      importsLeft: 2,
      importsFailed: 4,
      importsOnly: false,
    });
  });

  it('importsOnly only when the whole backlog (at least 1) is imports', () => {
    const data = status();
    data.discogs.backlog = 3;
    data.discogs.imports = { left: 3, failed: 0 };
    expect(headerInputs(data, 1000).importsOnly).toBe(true);
    data.discogs.backlog = 0;
    data.discogs.imports = { left: 0, failed: 2 };
    expect(headerInputs(data, 1000).importsOnly).toBe(false);
  });

  it('a status without imports reads 0 and not imports only', () => {
    const data = status();
    data.discogs.backlog = 3;
    delete (data.discogs as Partial<StatusResponse['discogs']>).imports;
    expect(headerInputs(data, 1000)).toMatchObject({
      importsLeft: 0,
      importsFailed: 0,
      importsOnly: false,
    });
  });

  it('paused while pausedUntil is in the future, with whole seconds rounded up', () => {
    const data = status();
    data.discogs.pausedUntil = 20_500;
    expect(headerInputs(data, 8_600)).toMatchObject({
      paused: true,
      pausedSeconds: 12,
    });
    expect(headerInputs(data, 20_500)).toMatchObject({
      paused: false,
      pausedSeconds: 0,
    });
    data.discogs.pausedUntil = null;
    expect(headerInputs(data, 8_600)).toMatchObject({
      paused: false,
      pausedSeconds: 0,
    });
  });
});

type TooltipInput = Parameters<typeof discogsTooltipLines>[0];

function tooltip(
  input: Omit<TooltipInput, 'importsLeft' | 'importsFailed'> &
    Partial<Pick<TooltipInput, 'importsLeft' | 'importsFailed'>>,
): string[] {
  return discogsTooltipLines({
    importsLeft: 0,
    importsFailed: 0,
    ...input,
  }).map(partsText);
}

describe('discogsTooltipLines', () => {
  it('not connected reads "Discogs — not connected"', () => {
    expect(
      tooltip({ connected: false, d: 0, failedSpines: 0, pausedSeconds: 0 }),
    ).toEqual(['Discogs — not connected']);
  });

  it.each([
    [0, 'Discogs — 3 left, 0 searches failed'],
    [1, 'Discogs — 3 left, 1 search failed'],
    [2, 'Discogs — 3 left, 2 searches failed'],
  ])('connected with %i failed spines', (f, line) => {
    expect(
      tooltip({ connected: true, d: 3, failedSpines: f, pausedSeconds: 0 }),
    ).toEqual([line]);
  });

  it('paused with 12 s left adds the countdown line', () => {
    expect(
      tooltip({ connected: true, d: 3, failedSpines: 1, pausedSeconds: 12 }),
    ).toEqual([
      'Discogs — 3 left, 1 search failed',
      'Discogs asked the app to slow down. Searching picks up again in 12 seconds.',
    ]);
  });

  it('1 s left reads "1 second"', () => {
    expect(
      tooltip({ connected: true, d: 3, failedSpines: 0, pausedSeconds: 1 })[1],
    ).toBe(
      'Discogs asked the app to slow down. Searching picks up again in 1 second.',
    );
  });

  it('0 s left drops the countdown line', () => {
    expect(
      tooltip({ connected: true, d: 3, failedSpines: 1, pausedSeconds: 0 }),
    ).toEqual(['Discogs — 3 left, 1 search failed']);
  });

  it('adds the collection line under the Discogs line when imports are in progress or failed', () => {
    expect(
      tooltip({
        connected: true,
        d: 3,
        failedSpines: 0,
        pausedSeconds: 12,
        importsLeft: 2,
        importsFailed: 1,
      }),
    ).toEqual([
      'Discogs — 3 left, 0 searches failed',
      'Collection — 2 being added, 1 failed',
      'Discogs asked the app to slow down. Searching picks up again in 12 seconds.',
    ]);
    expect(
      tooltip({
        connected: true,
        d: 0,
        failedSpines: 0,
        pausedSeconds: 0,
        importsLeft: 0,
        importsFailed: 3,
      }),
    ).toEqual([
      'Discogs — 0 left, 0 searches failed',
      'Collection — 0 being added, 3 failed',
    ]);
  });

  it('drops the collection line when nothing is being added or failed', () => {
    expect(
      tooltip({
        connected: true,
        d: 3,
        failedSpines: 1,
        pausedSeconds: 0,
        importsLeft: 0,
        importsFailed: 0,
      }),
    ).toEqual(['Discogs — 3 left, 1 search failed']);
  });
});
