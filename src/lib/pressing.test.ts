import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseVersions } from '@/server/discogs/versions';
import {
  canonicalCountry,
  choosePressing,
  countryMatch,
  needsLookup,
  pressingPhrase,
  releaseTitleOf,
  type TopMatchLite,
  titleMatches,
  type VersionLite,
} from './pressing';

const FIXTURES = path.join(
  import.meta.dirname,
  '..',
  '..',
  'test',
  'fixtures',
  'discogs',
);
const fixture = (name: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));

function canadaVersions(): VersionLite[] {
  const v = parseVersions(fixture('master-versions-canada.json'));
  if (v === 'unusable') throw new Error('canada fixture is unusable');
  return v;
}

const TOP: TopMatchLite = {
  releaseId: 2000001,
  title: 'Nirvana - Nevermind',
  country: 'US',
  labels: ['DGC'],
  masterId: 13814,
  year: 1991,
  formats: [{ name: 'CD', qty: '1', descriptions: ['Album'], text: null }],
};

const version = (over: Partial<VersionLite>): VersionLite => ({
  id: 1,
  title: 'Nevermind',
  label: 'DGC',
  country: 'Canada',
  majorFormats: ['CD'],
  format: 'Album',
  catno: null,
  released: '1991',
  thumb: null,
  ...over,
});

describe('countryMatch (D-19)', () => {
  it.each([
    ['Canada', 'Canada', 'exact'],
    ['canada ', 'Canada', 'exact'],
    ['USA & Canada', 'Canada', 'combined'],
    ['USA, Canada & UK', 'Canada', 'combined'],
    ['USA & Canada', 'US', 'combined'],
    ['US', 'Canada', 'none'],
    [null, 'Canada', 'none'],
  ] as const)('countryMatch(%j, %j) = %s', (country, preferred, want) => {
    expect(countryMatch(country, preferred)).toBe(want);
  });
});

describe('canonicalCountry (Pitfall 1: the filter is case-sensitive)', () => {
  it.each([
    ['canada', 'Canada'],
    [' uk ', 'UK'],
    ['usa', 'US'],
    ['Hong Kong', 'Hong Kong'],
    ['   ', null],
  ] as const)('canonicalCountry(%j) = %j', (input, want) => {
    expect(canonicalCountry(input)).toBe(want);
  });
});

describe('pressingPhrase', () => {
  it('known demonym, plural', () => {
    expect(pressingPhrase('Canada', true)).toBe('Canadian pressings');
  });
  it('known demonym matched case-insensitively, singular', () => {
    expect(pressingPhrase('canada', false)).toBe('Canadian pressing');
  });
  it('unknown country', () => {
    expect(pressingPhrase('Hong Kong', true)).toBe('pressings from Hong Kong');
  });
});

describe('releaseTitleOf / titleMatches', () => {
  it('takes the text after the first " - "', () => {
    expect(releaseTitleOf('Nirvana - Nevermind')).toBe('Nevermind');
    expect(releaseTitleOf('Nevermind')).toBe('Nevermind');
  });
  it('matches across case and punctuation, either way round', () => {
    expect(titleMatches('NEVERMIND!', 'Nevermind')).toBe(true);
    expect(titleMatches('Nevermind (Deluxe Edition)', 'Nevermind')).toBe(true);
    expect(titleMatches('Bleach', 'Nevermind')).toBe(false);
  });
  it('an empty wanted title matches anything', () => {
    expect(titleMatches('Bleach', '')).toBe(true);
  });
  it('a missing version title does not match a real one', () => {
    expect(titleMatches(null, 'Nevermind')).toBe(false);
  });
});

describe('choosePressing', () => {
  it('D-02: a top match already in the preferred country is used as is', () => {
    const top = { ...TOP, country: 'Canada' };
    expect(needsLookup(top, 'Canada')).toBe(false);
    expect(choosePressing({ top, preferred: 'Canada' })).toEqual({
      use: 'top',
      outcome: 'preferred',
    });
  });

  it('needsLookup is true for another country with a master', () => {
    expect(needsLookup(TOP, 'Canada')).toBe(true);
  });

  it('needsLookup is false without a master (D-04)', () => {
    expect(needsLookup({ ...TOP, masterId: null }, 'Canada')).toBe(false);
  });

  it('D-04: no master falls back to the top match', () => {
    expect(
      choosePressing({ top: { ...TOP, masterId: null }, preferred: 'Canada' }),
    ).toEqual({ use: 'top', outcome: 'fallback_no_master' });
  });

  it('D-19: no master but a combined country counts as preferred', () => {
    expect(
      choosePressing({
        top: { ...TOP, masterId: null, country: 'USA & Canada' },
        preferred: 'Canada',
      }),
    ).toEqual({ use: 'top', outcome: 'preferred' });
  });

  it('D-03: picks the earliest official DGC CD from the recorded answer', () => {
    const choice = choosePressing({
      top: TOP,
      preferred: 'Canada',
      versions: canadaVersions(),
    });
    expect(choice.use).toBe('version');
    if (choice.use !== 'version') return;
    expect(choice.outcome).toBe('preferred');
    expect(choice.version.id).toBe(12009956);
    expect(choice.version.label).toBe('DGC');
    expect(choice.version.released).toBe('1991');
    expect(choice.version.format).not.toMatch(/unofficial release/i);
  });

  it('D-03: a dated version beats a "0"-year one', () => {
    const choice = choosePressing({
      top: TOP,
      preferred: 'Canada',
      versions: [
        version({ id: 5, released: '0' }),
        version({ id: 9, released: '1994' }),
      ],
    });
    expect(choice).toMatchObject({ use: 'version', version: { id: 9 } });
  });

  it('D-03: same label beats an earlier other label', () => {
    const choice = choosePressing({
      top: TOP,
      preferred: 'Canada',
      versions: [
        version({ id: 5, label: 'Geffen Records', released: '1990' }),
        version({ id: 9, label: 'DGC', released: '1994' }),
      ],
    });
    expect(choice).toMatchObject({ use: 'version', version: { id: 9 } });
  });

  it('D-18: only bootlegs in the country, so the bootleg is chosen', () => {
    const choice = choosePressing({
      top: TOP,
      preferred: 'Canada',
      versions: [version({ id: 7, format: 'Album, Unofficial Release' })],
    });
    expect(choice).toMatchObject({ use: 'version', version: { id: 7 } });
  });

  it('D-18: an official Box Set beats a bootleg CD', () => {
    const choice = choosePressing({
      top: TOP,
      preferred: 'Canada',
      versions: [
        version({ id: 3, format: 'Album, Unofficial Release' }),
        version({ id: 8, majorFormats: ['Box Set'], format: 'Album' }),
      ],
    });
    expect(choice).toMatchObject({ use: 'version', version: { id: 8 } });
  });

  it('D-19: an exact-country version beats a combined one', () => {
    const choice = choosePressing({
      top: TOP,
      preferred: 'Canada',
      versions: [
        version({ id: 2, country: 'USA & Canada', released: '1990' }),
        version({ id: 6, country: 'Canada', released: '1995' }),
      ],
    });
    expect(choice).toMatchObject({ use: 'version', version: { id: 6 } });
  });

  it('D-19: a combined top beats having no version (it is the pool)', () => {
    const top = { ...TOP, country: 'USA & Canada' };
    expect(choosePressing({ top, preferred: 'Canada', versions: [] })).toEqual({
      use: 'top',
      outcome: 'preferred',
    });
  });

  it('D-19: an exact-country version beats a combined top', () => {
    const top = { ...TOP, country: 'USA & Canada' };
    const choice = choosePressing({
      top,
      preferred: 'Canada',
      versions: [version({ id: 4 })],
    });
    expect(choice).toMatchObject({ use: 'version', version: { id: 4 } });
  });

  it('versions in other countries are re-checked and dropped', () => {
    expect(
      choosePressing({
        top: TOP,
        preferred: 'Canada',
        versions: [version({ id: 4, country: 'US' })],
      }),
    ).toEqual({ use: 'top', outcome: 'fallback_no_version' });
  });

  it('an empty pool falls back with fallback_no_version', () => {
    expect(
      choosePressing({ top: TOP, preferred: 'Canada', versions: [] }),
    ).toEqual({ use: 'top', outcome: 'fallback_no_version' });
  });

  it('T-06-01: the bogus answer is unusable and falls back', () => {
    const versions = parseVersions(fixture('master-versions-bogus.json'));
    expect(versions).toBe('unusable');
    expect(choosePressing({ top: TOP, preferred: 'Canada', versions })).toEqual(
      { use: 'top', outcome: 'fallback_unusable_master' },
    );
  });

  it('an unusable answer with a combined top counts as preferred', () => {
    expect(
      choosePressing({
        top: { ...TOP, country: 'USA & Canada' },
        preferred: 'Canada',
        versions: 'unusable',
      }),
    ).toEqual({ use: 'top', outcome: 'preferred' });
  });

  it('D-21: a chosen version with another title falls back', () => {
    expect(
      choosePressing({
        top: TOP,
        preferred: 'Canada',
        versions: [version({ id: 4, title: 'Bleach' })],
      }),
    ).toEqual({ use: 'top', outcome: 'fallback_unusable_master' });
  });

  it('D-21: the title check applies to the chosen version, not as a filter', () => {
    // The best-ranked version is Bleach; a worse Nevermind is not promoted.
    expect(
      choosePressing({
        top: TOP,
        preferred: 'Canada',
        versions: [
          version({ id: 4, title: 'Bleach', released: '1989' }),
          version({ id: 9, title: 'Nevermind', released: '1995' }),
        ],
      }),
    ).toEqual({ use: 'top', outcome: 'fallback_unusable_master' });
  });
});
