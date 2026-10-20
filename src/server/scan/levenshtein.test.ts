import { describe, expect, it } from 'vitest';
import { levenshtein, normalizeForMatch, textSimilarity } from './levenshtein';

describe('levenshtein', () => {
  it('kitten -> sitting is 3', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });

  it('is the other length against an empty string', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abcd', '')).toBe(4);
    expect(levenshtein('', '')).toBe(0);
  });

  it('counts code points, not UTF-16 units', () => {
    // One astral character is one edit, not two.
    expect(levenshtein('a\u{1F4BF}b', 'ab')).toBe(1);
  });
});

describe('normalizeForMatch / textSimilarity', () => {
  it('NFC, lower case, trim and collapsed whitespace', () => {
    expect(normalizeForMatch('  Sigur  Rós \n')).toBe('sigur rós');
  });

  it("NFD 'Sigur Rós' and 'sigur rós' are identical (similarity 1)", () => {
    const nfd = 'Sigur Rós';
    const nfc = 'sigur rós';
    expect(nfd).not.toBe(nfc);
    expect(textSimilarity(nfd, nfc)).toBe(1);
  });

  it('two empty or missing strings score 0, so text never decides alone', () => {
    expect(textSimilarity('', '')).toBe(0);
    expect(textSimilarity(null, '   ')).toBe(0);
    expect(textSimilarity(undefined, null)).toBe(0);
  });

  it('is 1 - distance / longer length', () => {
    expect(textSimilarity('kitten', 'sitting')).toBeCloseTo(1 - 3 / 7, 10);
    expect(textSimilarity('abc', 'xyz')).toBe(0);
  });
});
