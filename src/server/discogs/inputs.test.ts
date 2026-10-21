import { describe, expect, it } from 'vitest';
import {
  capCodePoints,
  inputHash,
  MAX_INPUT_CODE_POINTS,
  normalizeInput,
  searchInputs,
} from './inputs';

// Search input normalization (D-08, D-09): the one function behind the
// enqueue dedupe hash and the values sent to Discogs.

const EMOJI = '\u{1F3B5}'; // one code point, two UTF-16 units

function hasLoneSurrogate(s: string): boolean {
  return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(
    s,
  );
}

describe('normalizeInput', () => {
  it('trims and collapses whitespace runs', () => {
    expect(normalizeInput('  Sigur  Rós ')).toBe('Sigur Rós');
    expect(normalizeInput('a\t\n b')).toBe('a b');
  });

  it('NFC-normalizes, so decomposed and composed text are equal', () => {
    const decomposed = 'Sigur Rós';
    const composed = 'Sigur Rós';
    expect(decomposed).not.toBe(composed);
    expect(normalizeInput(decomposed)).toBe(composed);
  });

  it("'', whitespace, null and undefined give null", () => {
    expect(normalizeInput('')).toBeNull();
    expect(normalizeInput('   \t ')).toBeNull();
    expect(normalizeInput(null)).toBeNull();
    expect(normalizeInput(undefined)).toBeNull();
  });

  it('keeps 200 code points and cuts 201 to 200', () => {
    expect(MAX_INPUT_CODE_POINTS).toBe(200);
    const exact = 'a'.repeat(200);
    expect(normalizeInput(exact)).toBe(exact);
    expect(normalizeInput('a'.repeat(201))).toBe(exact);
  });

  it('never splits a surrogate pair at the cap', () => {
    // 201 code points, the emoji is the 200th: it is kept whole.
    const kept = normalizeInput(`${'a'.repeat(199)}${EMOJI}b`);
    expect(kept).toBe(`${'a'.repeat(199)}${EMOJI}`);
    expect(Array.from(kept ?? '')).toHaveLength(200);
    expect(hasLoneSurrogate(kept ?? '')).toBe(false);
    // 201 code points, the emoji is the 201st: it is cut whole.
    const cut = normalizeInput(`${'a'.repeat(200)}${EMOJI}`);
    expect(cut).toBe('a'.repeat(200));
    expect(hasLoneSurrogate(cut ?? '')).toBe(false);
  });
});

describe('capCodePoints', () => {
  it('counts code points, not UTF-16 units', () => {
    const s = EMOJI.repeat(3);
    expect(s.length).toBe(6);
    expect(capCodePoints(s, 2)).toBe(EMOJI.repeat(2));
    expect(capCodePoints(s, 3)).toBe(s);
  });
});

describe('searchInputs and inputHash', () => {
  it('caps artist, title and catalog number at 200 code points', () => {
    const long = 'x'.repeat(250);
    const inputs = searchInputs({
      artist: long,
      title: long,
      catalog_number: long,
      raw_text: long,
    });
    for (const v of Object.values(inputs)) {
      expect(Array.from(v ?? '')).toHaveLength(200);
    }
  });

  it('a decomposed and a composed value hash the same', () => {
    const a = searchInputs({ artist: 'Sigur Rós', title: ' Takk ' });
    const b = searchInputs({ artist: 'Sigur Rós', title: 'Takk' });
    expect(inputHash(a)).toBe(inputHash(b));
  });

  it('a whitespace-only difference hashes the same', () => {
    const a = searchInputs({ artist: '  Sigur  Rós ' });
    const b = searchInputs({ artist: 'Sigur Rós' });
    expect(inputHash(a)).toBe(inputHash(b));
  });

  it('a changed field or a field moved to another slot hashes differently', () => {
    const base = inputHash(searchInputs({ artist: 'A', title: 'B' }));
    expect(inputHash(searchInputs({ artist: 'A', title: 'C' }))).not.toBe(base);
    expect(inputHash(searchInputs({ artist: 'B', title: 'A' }))).not.toBe(base);
  });

  it('missing fields become null', () => {
    expect(searchInputs({})).toEqual({
      artist: null,
      title: null,
      catno: null,
      rawText: null,
    });
  });
});
