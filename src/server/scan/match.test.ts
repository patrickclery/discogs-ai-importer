import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LAYOUTS,
  structuredOutputFor,
} from '../../../test/fixtures/vision/synthetic-shelf.mjs';
import { textSimilarity } from './levenshtein';
import {
  centreDistanceInShortSides,
  MATCH_CUTOFF,
  type MatchItem,
  matchDetections,
  pairScore,
} from './match';

// D-14 matching on synthetic shifts and on the recorded spike runs (two
// models x two efforts per real shelf photo, test/fixtures/vision/spike).

const SPIKE_DIR = path.resolve(
  import.meta.dirname,
  '../../../test/fixtures/vision/spike',
);

type SpikeFile = {
  image: { sentW: number; sentH: number };
  run: { stdout: string };
};
type SpikeSpine = {
  index: number;
  bbox: number[];
  raw_text: { value: string | null };
};

/** One recorded run as match items, or null if it has no structured answer. */
function loadSpike(file: string): MatchItem[] | null {
  const spike = JSON.parse(
    fs.readFileSync(path.join(SPIKE_DIR, file), 'utf8'),
  ) as SpikeFile;
  const envelope = JSON.parse(spike.run.stdout) as {
    structured_output?: { spines?: SpikeSpine[] };
  };
  const spines = envelope.structured_output?.spines;
  if (!spines) return null;
  return spines.map((s, i) => {
    const [a, b, c, d] = s.bbox;
    return {
      key: `${file}#${i}`,
      idx: s.index,
      box: {
        x1: Math.min(a, c),
        y1: Math.min(b, d),
        x2: Math.max(a, c),
        y2: Math.max(b, d),
      },
      visionW: spike.image.sentW,
      visionH: spike.image.sentH,
      rawText: s.raw_text.value,
    };
  });
}

/** Recorded runs grouped by photo: { photo: { 'model.effort': items } }. */
function spikeRuns(): Map<string, Map<string, MatchItem[]>> {
  const out = new Map<string, Map<string, MatchItem[]>>();
  for (const file of fs.readdirSync(SPIKE_DIR).sort()) {
    const m = /^(.+?)\.(claude-[^.]+(?:\.[^.]+)?)\.json$/.exec(file);
    if (!m) continue;
    const items = loadSpike(file);
    if (!items) continue;
    const [, photo, config] = m;
    if (!out.has(photo)) out.set(photo, new Map());
    out.get(photo)?.set(config, items);
  }
  return out;
}

function pairRate(a: MatchItem[], b: MatchItem[]): number {
  return matchDetections(a, b).pairs.length / Math.min(a.length, b.length);
}

function item(
  key: string,
  idx: number,
  box: [number, number, number, number] | null,
  rawText: string | null,
  vision: [number, number] = [1400, 1050],
): MatchItem {
  return {
    key,
    idx,
    box: box ? { x1: box[0], y1: box[1], x2: box[2], y2: box[3] } : null,
    visionW: vision[0],
    visionH: vision[1],
    rawText,
  };
}

function keyPairs(old: MatchItem[], neu: MatchItem[]): string[] {
  return matchDetections(old, neu)
    .pairs.map((p) => `${p.old.key}>${p.new.key}`)
    .sort();
}

describe('matchDetections on synthetic boxes', () => {
  const tracer = structuredOutputFor(LAYOUTS.tracerShelf).spines;
  const asItems = (prefix: string, shift: number) =>
    tracer.map((s) =>
      item(
        `${prefix}${s.index}`,
        s.index,
        [
          s.bbox[0] + shift,
          s.bbox[1] + shift,
          s.bbox[2] + shift,
          s.bbox[3] + shift,
        ],
        s.raw_text.value,
      ),
    );

  it('boxes shifted by 6 px with unchanged text re-pair with themselves', () => {
    const old = asItems('o', 0);
    const neu = asItems('n', 6);
    // Spines 0 and 2 have identical raw text: geometry tells them apart.
    expect(keyPairs(old, neu)).toEqual(
      tracer.map((s) => `o${s.index}>n${s.index}`).sort(),
    );
  });

  it('two-column stack: the other column never pairs, even with x overlap', () => {
    // Two stacks of lying spines with the same x range, one above the
    // other. Horizontal-only overlap would pair every spine across them.
    const upper = [0, 1, 2, 3].map((i) =>
      item(`u${i}`, i, [40, 60 + i * 40, 600, 96 + i * 40], `Upper ${i}`),
    );
    const lower = [0, 1, 2, 3].map((i) =>
      item(`l${i}`, i, [40, 600 + i * 40, 600, 636 + i * 40], `Lower ${i}`),
    );
    expect(matchDetections(upper, lower).pairs).toEqual([]);
    // With both stacks in both runs, every spine pairs inside its column.
    const shifted = [...upper, ...lower].map((s) => ({
      ...s,
      key: `${s.key}'`,
      box: s.box && { ...s.box, y1: s.box.y1 + 4, y2: s.box.y2 + 4 },
    }));
    expect(keyPairs([...upper, ...lower], shifted)).toEqual(
      [...upper, ...lower].map((s) => `${s.key}>${s.key}'`).sort(),
    );
  });

  it('a pair below the cutoff stays unmatched', () => {
    const old = [item('a', 0, [40, 60, 700, 140], 'Nova Lane - Blue Hour')];
    const far = [
      item('b', 0, [800, 40, 890, 1000], 'Owen Ashby - North Light'),
    ];
    expect(pairScore(old[0], far[0])).toBeLessThan(MATCH_CUTOFF);
    const result = matchDetections(old, far);
    expect(result.pairs).toEqual([]);
    expect(result.unmatchedOld.map((x) => x.key)).toEqual(['a']);
    expect(result.unmatchedNew.map((x) => x.key)).toEqual(['b']);
  });

  it('a missing box never pairs on text alone', () => {
    const old = [item('a', 0, null, 'Nova Lane - Blue Hour')];
    const neu = [item('b', 0, [40, 60, 700, 140], 'Nova Lane - Blue Hour')];
    expect(matchDetections(old, neu).pairs).toEqual([]);
  });

  it('index distance only breaks ties', () => {
    const old = [item('a', 3, [40, 60, 700, 140], 'Same')];
    const neu = [
      item('far-idx', 9, [40, 60, 700, 140], 'Same'),
      item('near-idx', 3, [40, 60, 700, 140], 'Same'),
    ];
    expect(keyPairs(old, neu)).toEqual(['a>near-idx']);
  });

  it('boxes are compared in each run’s own vision size', () => {
    const old = [item('a', 0, [40, 60, 700, 140], 'Same', [1400, 1050])];
    const neu = [item('b', 0, [20, 30, 350, 70], 'Same', [700, 525])];
    expect(pairScore(old[0], neu[0])).toBeCloseTo(1, 10);
  });
});

describe('matchDetections on recorded spike runs', () => {
  const runs = spikeRuns();

  it('loads recorded runs for several photos', () => {
    expect(runs.size).toBeGreaterThanOrEqual(5);
  });

  it('an effort change (Opus high vs medium) pairs >= 85% within one short side', () => {
    let compared = 0;
    for (const [photo, configs] of runs) {
      const a = configs.get('claude-opus-5-5.high');
      const b = configs.get('claude-opus-5-5.medium');
      if (!a || !b) continue;
      compared += 1;
      const { pairs } = matchDetections(a, b);
      const rate = pairs.length / Math.min(a.length, b.length);
      expect(rate, `${photo} pair rate`).toBeGreaterThanOrEqual(0.85);
      for (const p of pairs) {
        expect(
          centreDistanceInShortSides(p.old, p.new),
          `${photo}: ${p.old.rawText} > ${p.new.rawText}`,
        ).toBeLessThanOrEqual(1);
      }
    }
    expect(compared).toBeGreaterThanOrEqual(5);
  });

  it('every pair of configurations of a photo pairs >= 85% of spines', () => {
    for (const [photo, configs] of runs) {
      const list = [...configs.entries()];
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const [ca, a] = list[i];
          const [cb, b] = list[j];
          expect(
            pairRate(a, b),
            `${photo} ${ca} vs ${cb}`,
          ).toBeGreaterThanOrEqual(0.85);
        }
      }
    }
  });

  it('geometry alone never pairs boxes more than one short side apart', () => {
    // Model changes loosen boxes, so the same spine can sit just over one
    // short side away; such a pair must also read alike. A neighbour that
    // reads differently (a box shifted by a whole spine) stays unmatched.
    for (const [photo, configs] of runs) {
      const list = [...configs.entries()];
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const [ca, a] = list[i];
          const [cb, b] = list[j];
          for (const p of matchDetections(a, b).pairs) {
            if (centreDistanceInShortSides(p.old, p.new) <= 1) continue;
            expect(
              textSimilarity(p.old.rawText, p.new.rawText),
              `${photo} ${ca} vs ${cb}: ${p.old.rawText} > ${p.new.rawText}`,
            ).toBeGreaterThanOrEqual(0.5);
          }
        }
      }
    }
  });
});
