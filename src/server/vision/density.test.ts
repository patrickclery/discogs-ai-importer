import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeBox } from '../images/crop';
import type { RunResult } from '../proc/run';
import { computeDensityFlags, iou } from './density';
import { classifyVisionRun } from './parse';

// D-03 density flags, layout-agnostic (RESEARCH Pitfall 5): the owner's
// shelves are stacked columns, so left-to-right order means nothing.

const T = { maxSpines: 40, minShortSidePx: 30 };
const SPIKE = path.resolve(
  import.meta.dirname,
  '../../../test/fixtures/vision/spike',
);

/** A box from its corner and size. */
const box = (x: number, y: number, w: number, h: number) => ({
  x1: x,
  y1: y,
  x2: x + w,
  y2: y + h,
});

/** n lying spines stacked top to bottom in one column, `short` px tall. */
function column(n: number, x: number, short: number, from = 0) {
  return Array.from({ length: n }, (_, i) => ({
    idx: from + i,
    box: box(x, i * short, 400, short),
  }));
}

describe('iou', () => {
  it('is 0 for boxes that only touch and 1 for identical boxes', () => {
    expect(iou(box(0, 0, 10, 10), box(10, 0, 10, 10))).toBe(0);
    expect(iou(box(0, 0, 10, 10), box(0, 0, 10, 10))).toBe(1);
  });

  it('is intersection over union', () => {
    // 10x10 boxes offset by 5 px: inter 50, union 150.
    expect(iou(box(0, 0, 10, 10), box(5, 0, 10, 10))).toBeCloseTo(1 / 3, 6);
  });
});

describe('computeDensityFlags', () => {
  it('raises nothing for an empty result', () => {
    expect(computeDensityFlags([], T)).toEqual([]);
  });

  it('too_many_spines only above N (exactly N raises nothing)', () => {
    expect(computeDensityFlags(column(40, 0, 40), T)).not.toContain(
      'too_many_spines',
    );
    expect(computeDensityFlags(column(41, 0, 40), T)).toContain(
      'too_many_spines',
    );
  });

  it('counts every detection, including ones without a usable box', () => {
    const d = [...column(40, 0, 40), { idx: 40, box: null }];
    expect(computeDensityFlags(d, T)).toContain('too_many_spines');
  });

  it('small_spines when the median short side is below W (exactly W raises nothing)', () => {
    expect(computeDensityFlags(column(5, 0, 30), T)).not.toContain(
      'small_spines',
    );
    expect(computeDensityFlags(column(5, 0, 29), T)).toContain('small_spines');
  });

  it('boxes that only touch are not overlapping and stay two detections', () => {
    const d = [
      { idx: 0, box: box(0, 0, 400, 40) },
      { idx: 1, box: box(0, 40, 400, 40) },
    ];
    expect(computeDensityFlags(d, T)).toEqual([]);
    expect(d).toHaveLength(2);
  });

  it('overlapping when a pair has IoU above 0.3', () => {
    // Same width, vertical offset o: IoU = (h - o) / (h + o).
    // h 100: o 52 gives 48 / 152 = 0.316; o 54 gives 46 / 154 = 0.299.
    const over = [
      { idx: 0, box: box(0, 0, 400, 100) },
      { idx: 1, box: box(0, 52, 400, 100) },
    ];
    const under = [
      { idx: 0, box: box(0, 0, 400, 100) },
      { idx: 1, box: box(0, 54, 400, 100) },
    ];
    expect(iou(over[0].box, over[1].box)).toBeGreaterThan(0.3);
    expect(iou(under[0].box, under[1].box)).toBeLessThan(0.3);
    expect(computeDensityFlags(over, T)).toContain('overlapping');
    expect(computeDensityFlags(under, T)).not.toContain('overlapping');
  });

  it('a two-column stack indexed top to bottom, column by column, is in order', () => {
    const d = [...column(10, 0, 40), ...column(10, 500, 40, 10)];
    expect(computeDensityFlags(d, T)).toEqual([]);
  });

  it('a shuffled index order is out_of_order', () => {
    const d = column(20, 0, 40);
    const order = [
      7, 15, 2, 19, 11, 0, 13, 5, 17, 9, 3, 18, 1, 12, 6, 16, 4, 10, 14, 8,
    ];
    const shuffled = d.map((s, i) => ({ ...s, idx: order[i] }));
    expect(computeDensityFlags(shuffled, T)).toContain('out_of_order');
  });

  it('a repeated index is out_of_order', () => {
    const d = column(5, 0, 40);
    d[3] = { ...d[3], idx: 2 };
    expect(computeDensityFlags(d, T)).toContain('out_of_order');
  });

  it('never removes a detection', () => {
    const d = [...column(41, 0, 20), { idx: 0, box: box(0, 0, 400, 20) }];
    const before = JSON.stringify(d);
    const flags = computeDensityFlags(d, T);
    expect(flags).toEqual(
      expect.arrayContaining([
        'too_many_spines',
        'small_spines',
        'overlapping',
        'out_of_order',
      ]),
    );
    expect(JSON.stringify(d)).toBe(before);
  });
});

type SpikeRun = {
  photo: string;
  model: string;
  effort: string;
  outcome: string;
  spines: number;
  medianShortSidePx: number;
  maxPairIoU: number;
};

describe('computeDensityFlags on the recorded spike runs', () => {
  const report = JSON.parse(
    fs.readFileSync(path.join(SPIKE, 'report.json'), 'utf8'),
  ) as {
    runs: SpikeRun[];
    proposals: { densityMaxSpines: number; densityMinShortSidePx: number };
  };
  const frozen = {
    maxSpines: report.proposals.densityMaxSpines,
    minShortSidePx: report.proposals.densityMinShortSidePx,
  };

  function flagsFor(r: SpikeRun) {
    const file = path.join(SPIKE, `${r.photo}.${r.model}.${r.effort}.json`);
    const rec = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      image: { sentW: number; sentH: number };
      run: RunResult;
    };
    const outcome = classifyVisionRun(rec.run);
    if (!outcome.ok) throw new Error(`${file}: ${outcome.kind}`);
    const detections = outcome.result.spines.map((s, i) => ({
      idx: Number.isFinite(s.index) ? Math.round(s.index) : i,
      box: normalizeBox(s.bbox, rec.image.sentW, rec.image.sentH),
    }));
    return computeDensityFlags(detections, frozen);
  }

  const ok = report.runs.filter((r) => r.outcome === 'ok');

  it.each(ok.map((r) => [`${r.photo} ${r.model} ${r.effort}`, r] as const))(
    '%s matches its report.json stats',
    (_label, r) => {
      const flags = flagsFor(r);
      expect(flags.includes('too_many_spines')).toBe(
        r.spines > frozen.maxSpines,
      );
      expect(flags.includes('small_spines')).toBe(
        r.medianShortSidePx < frozen.minShortSidePx,
      );
      expect(flags.includes('overlapping')).toBe(r.maxPairIoU > 0.3);
    },
  );

  it('raises no flags on the sparse photo (img-3554)', () => {
    const sparse = ok.filter((r) => r.photo === 'img-3554');
    expect(sparse.length).toBeGreaterThan(0);
    for (const r of sparse) expect(flagsFor(r)).toEqual([]);
  });
});
