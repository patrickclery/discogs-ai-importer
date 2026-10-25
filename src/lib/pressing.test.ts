import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseVersions } from '@/server/discogs/versions';
import { PRESSING_OUTCOMES } from './bulk-types';
import {
  canonicalCountry,
  choosePressing,
  countryMatch,
  distinctFallback,
  needsFallbackLookup,
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

describe('distinctFallback (G-06-side-1)', () => {
  it.each([
    ['Canada', 'US', 'US'],
    ['Canada', '  us ', 'US'],
    ['Canada', 'canada', null],
    ['US', 'USA', null],
    ['Canada', '   ', null],
    ['Canada', null, null],
    ['Canada', undefined, null],
  ] as const)('distinctFallback(%j, %j) = %j', (preferred, fallback, want) => {
    expect(distinctFallback(preferred, fallback)).toBe(want);
  });
});

describe('choosePressing fallback tier (G-06-side-1)', () => {
  const HK: TopMatchLite = { ...TOP, country: 'Hong Kong' };

  it('PRESSING_OUTCOMES includes fallback_country', () => {
    expect(PRESSING_OUTCOMES).toContain('fallback_country');
  });

  it('tracer: a Hong Kong top with no Canadian version takes the US version', () => {
    const us = version({ id: 31, country: 'US' });
    expect(
      choosePressing({
        top: HK,
        preferred: 'Canada',
        fallback: 'US',
        versions: [],
        fallbackVersions: [us],
      }),
    ).toEqual({ use: 'version', version: us, outcome: 'fallback_country' });
  });

  it('without a fallback the answer is unchanged (fallback_no_version)', () => {
    const us = version({ id: 31, country: 'US' });
    for (const fallback of [undefined, null]) {
      expect(
        choosePressing({
          top: HK,
          preferred: 'Canada',
          fallback,
          versions: [],
          fallbackVersions: [us],
        }),
      ).toEqual({ use: 'top', outcome: 'fallback_no_version' });
    }
  });
});

describe('choosePressing fallback tier rules (G-06-side-1)', () => {
  const HK: TopMatchLite = { ...TOP, country: 'Hong Kong' };
  const base = { top: HK, preferred: 'Canada', fallback: 'US', versions: [] };
  const us = (over: Partial<VersionLite>): VersionLite =>
    version({ country: 'US', ...over });
  const pick = (fallbackVersions: VersionLite[]) =>
    choosePressing({ ...base, fallbackVersions });

  it('D-02 second tier: a top already from the fallback country is used as is', () => {
    expect(choosePressing({ ...base, top: { ...TOP, country: 'US' } })).toEqual(
      { use: 'top', outcome: 'fallback_country' },
    );
    expect(
      choosePressing({ ...base, top: { ...TOP, country: 'USA' } }),
    ).toEqual({ use: 'top', outcome: 'fallback_country' });
  });

  it('D-18: an official US CD beats a US bootleg', () => {
    expect(
      pick([
        us({ id: 3, format: 'Album, Unofficial Release', released: '1985' }),
        us({ id: 8, released: '1995' }),
      ]),
    ).toMatchObject({ use: 'version', version: { id: 8 } });
  });

  it('D-19: an exact US version beats "US & Europe"', () => {
    expect(
      pick([
        us({ id: 2, country: 'US & Europe', released: '1990' }),
        us({ id: 6, released: '1995' }),
      ]),
    ).toMatchObject({ use: 'version', version: { id: 6 } });
  });

  it('a CD beats a non-CD', () => {
    expect(
      pick([
        us({ id: 2, majorFormats: ['Vinyl'], released: '1990' }),
        us({ id: 6, released: '1995' }),
      ]),
    ).toMatchObject({ use: 'version', version: { id: 6 } });
  });

  it("the top match's label wins a tie", () => {
    expect(
      pick([
        us({ id: 2, label: 'Geffen Records', released: '1990' }),
        us({ id: 6, label: 'DGC', released: '1995' }),
      ]),
    ).toMatchObject({ use: 'version', version: { id: 6 } });
  });

  it('then the earliest year, then the lowest id (D-03)', () => {
    expect(
      pick([us({ id: 9, released: '1994' }), us({ id: 5, released: '1992' })]),
    ).toMatchObject({ use: 'version', version: { id: 5 } });
    expect(
      pick([us({ id: 9, released: '1994' }), us({ id: 5, released: '1994' })]),
    ).toMatchObject({ use: 'version', version: { id: 5 } });
  });

  it('every pick carries the fallback_country outcome', () => {
    expect(pick([us({ id: 5 })])).toMatchObject({
      outcome: 'fallback_country',
    });
  });

  describe('a combined-fallback top ("US & Europe")', () => {
    const top: TopMatchLite = { ...TOP, country: 'US & Europe' };
    it('an exact US version beats it', () => {
      expect(
        choosePressing({ ...base, top, fallbackVersions: [us({ id: 6 })] }),
      ).toMatchObject({
        use: 'version',
        version: { id: 6 },
        outcome: 'fallback_country',
      });
    });
    it('kept as fallback_country when the fallback answer is absent, unusable or fails the guard (mirrors D-19)', () => {
      expect(choosePressing({ ...base, top })).toEqual({
        use: 'top',
        outcome: 'fallback_country',
      });
      expect(
        choosePressing({ ...base, top, fallbackVersions: 'unusable' }),
      ).toEqual({ use: 'top', outcome: 'fallback_country' });
      expect(
        choosePressing({
          ...base,
          top,
          fallbackVersions: [us({ id: 4, title: 'Bleach' })],
        }),
      ).toEqual({ use: 'top', outcome: 'fallback_country' });
    });
    it('with no exact US version the top is kept as fallback_country', () => {
      expect(choosePressing({ ...base, top, fallbackVersions: [] })).toEqual({
        use: 'top',
        outcome: 'fallback_country',
      });
    });
  });

  it('D-21: a fallback winner with another title keeps the top match', () => {
    expect(
      pick([
        us({ id: 4, title: 'Bleach', released: '1989' }),
        us({ id: 9, released: '1995' }),
      ]),
    ).toEqual({ use: 'top', outcome: 'fallback_country_unusable' });
  });

  it('an unusable fallback answer keeps the top match', () => {
    expect(choosePressing({ ...base, fallbackVersions: 'unusable' })).toEqual({
      use: 'top',
      outcome: 'fallback_country_unusable',
    });
  });

  it('WR-01: a preferred-tier unusable answer or title-guard miss stays fallback_unusable_master, and sends no fallback lookup', () => {
    const guarded = [version({ id: 4, title: 'Bleach' })];
    expect(choosePressing({ ...base, versions: guarded })).toEqual({
      use: 'top',
      outcome: 'fallback_unusable_master',
    });
    expect(needsFallbackLookup({ ...base, versions: guarded })).toBe(false);
    expect(choosePressing({ ...base, versions: 'unusable' })).toEqual({
      use: 'top',
      outcome: 'fallback_unusable_master',
    });
    expect(needsFallbackLookup({ ...base, versions: 'unusable' })).toBe(false);
  });

  it('IN-01: no fallback answer (never sent, or failed) is fallback_country_unchecked, never fallback_no_version', () => {
    expect(choosePressing(base)).toEqual({
      use: 'top',
      outcome: 'fallback_country_unchecked',
    });
    expect(choosePressing({ ...base, fallbackVersions: 'failed' })).toEqual({
      use: 'top',
      outcome: 'fallback_country_unchecked',
    });
    expect(
      choosePressing({
        ...base,
        top: { ...TOP, country: 'US & Europe' },
        fallbackVersions: 'failed',
      }),
    ).toEqual({ use: 'top', outcome: 'fallback_country' });
  });

  it('an examined answer with none from the fallback country: fallback_no_version', () => {
    expect(pick([])).toEqual({ use: 'top', outcome: 'fallback_no_version' });
    expect(pick([version({ id: 4, country: 'UK' })])).toEqual({
      use: 'top',
      outcome: 'fallback_no_version',
    });
  });

  it('a Canadian version always wins over a US one', () => {
    expect(
      choosePressing({
        ...base,
        versions: [version({ id: 40, released: '1999' })],
        fallbackVersions: [us({ id: 1, released: '1980' })],
      }),
    ).toMatchObject({
      use: 'version',
      version: { id: 40 },
      outcome: 'preferred',
    });
    expect(
      choosePressing({
        ...base,
        top: { ...TOP, country: 'US' },
        versions: [version({ id: 40 })],
      }),
    ).toMatchObject({
      use: 'version',
      version: { id: 40 },
      outcome: 'preferred',
    });
  });

  it('D-19: a combined-preferred top still answers preferred', () => {
    expect(
      choosePressing({
        ...base,
        top: { ...TOP, country: 'USA & Canada' },
        fallbackVersions: [us({ id: 6 })],
      }),
    ).toEqual({ use: 'top', outcome: 'preferred' });
  });
});

describe('needsFallbackLookup (G-06-side-1)', () => {
  const HK: TopMatchLite = { ...TOP, country: 'Hong Kong' };
  const base = { top: HK, preferred: 'Canada', fallback: 'US' };

  it('true for a Hong Kong top with an empty or US-free Canadian answer', () => {
    expect(needsFallbackLookup({ ...base, versions: [] })).toBe(true);
    expect(
      needsFallbackLookup({
        ...base,
        versions: [version({ id: 4, country: 'UK' })],
      }),
    ).toBe(true);
  });

  it('true for a combined-fallback top (an exact US version could beat it)', () => {
    expect(
      needsFallbackLookup({
        ...base,
        top: { ...TOP, country: 'US & Europe' },
        versions: [],
      }),
    ).toBe(true);
  });

  it.each([null, undefined, '', '  ', 'Canada', 'canada'])(
    'false when the fallback is %j',
    (fallback) => {
      expect(needsFallbackLookup({ ...base, fallback, versions: [] })).toBe(
        false,
      );
    },
  );

  it('false when the preferred answer is absent or unusable', () => {
    expect(needsFallbackLookup(base)).toBe(false);
    expect(needsFallbackLookup({ ...base, versions: 'unusable' })).toBe(false);
    expect(
      needsFallbackLookup({
        ...base,
        top: { ...HK, masterId: null },
        versions: [],
      }),
    ).toBe(false);
  });

  it('false when the preferred tier has a candidate', () => {
    expect(
      needsFallbackLookup({ ...base, versions: [version({ id: 4 })] }),
    ).toBe(false);
    expect(
      needsFallbackLookup({
        ...base,
        top: { ...TOP, country: 'USA & Canada' },
        versions: [],
      }),
    ).toBe(false);
  });

  it("false when the preferred tier's pick failed the title guard", () => {
    expect(
      needsFallbackLookup({
        ...base,
        versions: [version({ id: 4, title: 'Bleach' })],
      }),
    ).toBe(false);
  });

  it('false when the top match is exactly from the fallback country', () => {
    expect(
      needsFallbackLookup({
        ...base,
        top: { ...TOP, country: 'US' },
        versions: [],
      }),
    ).toBe(false);
  });

  it('false when the top match is already from the preferred country', () => {
    expect(
      needsFallbackLookup({
        ...base,
        top: { ...TOP, country: 'Canada' },
        versions: [],
      }),
    ).toBe(false);
  });
});
