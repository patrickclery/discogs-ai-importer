import { describe, expect, it } from 'vitest';
import {
  detailsLine,
  formatText,
  labelsText,
  NO_DETAILS,
} from './candidate-format';
import type { CandidateDto, CandidateFormat } from './discogs-types';

// UI-SPEC CandidateRow details rules (DISC-04, D-12): missing parts drop
// with their separator, formats[0] gives the format part, labels cap at 2.

type Details = Pick<
  CandidateDto,
  'year' | 'country' | 'labels' | 'catno' | 'formats'
>;

const cd = (
  qty: string | null,
  descriptions: string[] = [],
): CandidateFormat => ({ name: 'CD', qty, descriptions, text: null });

const NEVERMIND: Details = {
  year: 1991,
  country: 'US',
  labels: ['DGC', 'DGC'],
  catno: 'DGCD-24425',
  formats: [cd('1', ['Album', 'Reissue'])],
};

const EMPTY: Details = {
  year: null,
  country: null,
  labels: [],
  catno: null,
  formats: [],
};

describe('detailsLine', () => {
  it('joins year, country, labels, catno and format with " · "', () => {
    expect(detailsLine(NEVERMIND)).toBe(
      '1991 · US · DGC · DGCD-24425 · CD, Album, Reissue',
    );
  });

  it('drops a missing part with its separator', () => {
    expect(detailsLine({ ...NEVERMIND, year: null, country: null })).toBe(
      'DGC · DGCD-24425 · CD, Album, Reissue',
    );
    expect(detailsLine({ ...NEVERMIND, labels: [], catno: '' })).toBe(
      '1991 · US · CD, Album, Reissue',
    );
  });

  it('reads "No details on Discogs" when every part is missing', () => {
    expect(detailsLine(EMPTY)).toBe('No details on Discogs');
    expect(NO_DETAILS).toBe('No details on Discogs');
  });

  it('adds no format part for an empty formats list', () => {
    expect(detailsLine({ ...NEVERMIND, formats: [] })).toBe(
      '1991 · US · DGC · DGCD-24425',
    );
  });

  it('shows the year as stored and never re-cases Discogs strings', () => {
    expect(
      detailsLine({
        ...EMPTY,
        year: 2003,
        country: 'UK & Europe',
        catno: 'cat-001 a',
      }),
    ).toBe('2003 · UK & Europe · cat-001 a');
  });
});

describe('formatText', () => {
  it('prefixes qty above 1 as "{qty}×"', () => {
    expect(formatText([cd('2')])).toBe('2×CD');
    expect(formatText([cd('2', ['Compilation'])])).toBe('2×CD, Compilation');
  });

  it('omits qty 1 or a missing qty', () => {
    expect(formatText([cd('1')])).toBe('CD');
    expect(formatText([cd(null)])).toBe('CD');
  });

  it('reads formats[0] only, then its descriptions joined ", "', () => {
    expect(
      formatText([
        cd('1', ['Album', 'Reissue']),
        { name: 'DVD', qty: '1', descriptions: [], text: null },
      ]),
    ).toBe('CD, Album, Reissue');
  });

  it('gives nothing for an empty list', () => {
    expect(formatText([])).toBeNull();
  });
});

describe('labelsText', () => {
  it('shows at most 2 labels, then " +{k} more"', () => {
    expect(labelsText(['A', 'B', 'C', 'D'])).toBe('A, B +2 more');
    expect(labelsText(['A', 'B'])).toBe('A, B');
  });

  it('dedupes before counting', () => {
    expect(labelsText(['A', 'A'])).toBe('A');
    expect(labelsText(['A', 'B', 'A', 'C'])).toBe('A, B +1 more');
  });

  it('gives nothing for no labels', () => {
    expect(labelsText([])).toBeNull();
  });
});
