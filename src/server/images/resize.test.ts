import { describe, expect, it } from 'vitest';
import { VISION_MAX_EDGE, VISION_MAX_TOKENS } from '@/lib/vision-contract';
import { countImageTokens, resizedSize } from './resize';

// The official model-tier resize (INGEST-05). The three cases are the worked
// examples from the vision-coordinates docs.

describe('resizedSize', () => {
  it('docs case: 1075x1520 at the default 1568 tier gives 924x1307', () => {
    expect(resizedSize(1075, 1520)).toEqual([924, 1307]);
  });

  it('docs case: 3840x2160 at 2576/4784 gives 2576x1449', () => {
    expect(resizedSize(3840, 2160, 2576, 4784)).toEqual([2576, 1449]);
  });

  it('docs case: 4536x8064 at 2576/4784 gives 1449x2576', () => {
    expect(resizedSize(4536, 8064, 2576, 4784)).toEqual([1449, 2576]);
  });

  it('leaves an image already inside the tier unchanged (1400x1050)', () => {
    expect(resizedSize(1400, 1050, 2576, 4784)).toEqual([1400, 1050]);
  });

  it('the contract tier constants are the 2576/4784 tier', () => {
    expect([VISION_MAX_EDGE, VISION_MAX_TOKENS]).toEqual([2576, 4784]);
  });

  it('every result fits the edge and token budget', () => {
    for (const [w, h] of [
      [4032, 3024],
      [3024, 4032],
      [6000, 1000],
      [800, 12000],
    ]) {
      const [rw, rh] = resizedSize(w, h, 2576, 4784);
      expect(Math.max(rw, rh)).toBeLessThanOrEqual(2576);
      expect(countImageTokens(rw, rh)).toBeLessThanOrEqual(4784);
    }
  });
});
