import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { VersionLite } from '@/lib/pressing';
import {
  MAX_PLAUSIBLE_VERSIONS,
  masterVersionsPath,
  parseVersions,
  pressingCandidateValues,
  versionsQuery,
} from './versions';

const FIXTURES = path.join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'test',
  'fixtures',
  'discogs',
);
const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));

function usable(json: unknown): VersionLite[] {
  const v = parseVersions(json);
  if (v === 'unusable') throw new Error('unexpected unusable');
  return v;
}

describe('fixtures', () => {
  it('the canada fixture has 5+ versions and one Unofficial Release', () => {
    const json = fixture('master-versions-canada.json');
    const versions = json.versions as { format: string }[];
    expect(versions.length).toBeGreaterThanOrEqual(5);
    expect(
      versions.some((v) => v.format.includes('Unofficial Release')),
    ).toBe(true);
  });

  it('the bogus fixture claims the whole database', () => {
    const json = fixture('master-versions-bogus.json');
    expect((json.pagination as { items: number }).items).toBe(8135288);
  });
});

describe('masterVersionsPath (D-01)', () => {
  it('builds the versions path', () => {
    expect(masterVersionsPath(13814)).toBe('/masters/13814/versions');
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'refuses %s',
    (id) => {
      expect(() => masterVersionsPath(id)).toThrow('invalid master id');
    },
  );
});

describe('versionsQuery', () => {
  it('asks for one page of CDs in the country, earliest first', () => {
    expect(versionsQuery('Canada')).toEqual({
      country: 'Canada',
      format: 'CD',
      per_page: 100,
      page: 1,
      sort: 'released',
      sort_order: 'asc',
    });
  });

  it('sends the country verbatim', () => {
    expect(versionsQuery('USA & Canada').country).toBe('USA & Canada');
  });
});

describe('parseVersions', () => {
  it('maps the recorded answer to VersionLite', () => {
    const versions = usable(fixture('master-versions-canada.json'));
    expect(versions).toHaveLength(6);
    expect(versions[0]).toEqual({
      id: 12009956,
      title: 'Nevermind',
      label: 'DGC',
      country: 'Canada',
      majorFormats: ['CD'],
      format: 'Album',
      catno: 'DGCD-24425',
      released: '1991',
      thumb: expect.stringMatching(/^https:\/\/i\.discogs\.com\//),
    });
  });

  it('drops an entry missing id or with a non-number id, keeps the rest', () => {
    const json = fixture('master-versions-canada.json');
    const versions = json.versions as Record<string, unknown>[];
    const { id: _drop, ...noId } = versions[0];
    const body = {
      ...json,
      versions: [noId, { ...versions[1], id: '14253977' }, versions[2]],
    };
    const out = usable(body);
    expect(out.map((v) => v.id)).toEqual([versions[2].id]);
  });

  it('major_formats null becomes []', () => {
    const out = usable({
      pagination: { items: 1 },
      versions: [{ id: 5, major_formats: null }],
    });
    expect(out[0].majorFormats).toEqual([]);
    expect(out[0].title).toBeNull();
  });

  it('caps strings and major_formats (T-06-02)', () => {
    const out = usable({
      pagination: { items: 1 },
      versions: [
        {
          id: 5,
          title: 'x'.repeat(900),
          major_formats: Array.from({ length: 30 }, () => 'CD'),
        },
      ],
    });
    expect(Array.from(out[0].title ?? '')).toHaveLength(500);
    expect(out[0].majorFormats).toHaveLength(10);
  });

  it(`more than ${MAX_PLAUSIBLE_VERSIONS} items is unusable (T-06-01)`, () => {
    expect(parseVersions(fixture('master-versions-bogus.json'))).toBe(
      'unusable',
    );
    expect(
      parseVersions({ pagination: { items: MAX_PLAUSIBLE_VERSIONS }, versions: [] }),
    ).toEqual([]);
  });

  it('an envelope without pagination throws', () => {
    expect(() => parseVersions({ versions: [] })).toThrow(
      'Discogs answered an unexpected versions body',
    );
  });
});

describe('pressingCandidateValues', () => {
  const [first] = usable(fixture('master-versions-canada.json'));

  it('builds a pressing candidate from a version and the top match', () => {
    expect(
      pressingCandidateValues(first, {
        artist: 'Nirvana',
        title: 'Nirvana - Nevermind',
        masterId: 13814,
      }),
    ).toEqual({
      releaseId: 12009956,
      title: 'Nirvana - Nevermind',
      artist: 'Nirvana',
      year: 1991,
      country: 'Canada',
      labels: ['DGC'],
      catno: 'DGCD-24425',
      formats: [{ name: 'CD', qty: null, descriptions: ['Album'], text: null }],
      thumbUrl: first.thumb,
      masterId: 13814,
      stage: 'release',
    });
  });

  it('takes the artist from the top title when the top has none', () => {
    const v = pressingCandidateValues(
      { ...first, released: '0', label: null, majorFormats: [], format: 'Album, Reissue' },
      { artist: null, title: 'Nirvana - Nevermind', masterId: null },
    );
    expect(v.artist).toBe('Nirvana');
    expect(v.title).toBe('Nirvana - Nevermind');
    expect(v.year).toBeNull();
    expect(v.labels).toEqual([]);
    expect(v.formats).toEqual([
      { name: 'CD', qty: null, descriptions: ['Album', 'Reissue'], text: null },
    ]);
    expect(v.masterId).toBeNull();
  });

  it('uses the version title alone when no artist is known', () => {
    const v = pressingCandidateValues(first, {
      artist: null,
      title: 'Nevermind',
      masterId: 13814,
    });
    expect(v.artist).toBeNull();
    expect(v.title).toBe('Nevermind');
  });
});
