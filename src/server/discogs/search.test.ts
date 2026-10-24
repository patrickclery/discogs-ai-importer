import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { type SearchInputs, searchInputs } from './inputs';
import {
  buildStages,
  type Candidate,
  type CascadeSearch,
  normalizeCatno,
  type ParsedSearch,
  PER_PAGE,
  parseSearchResponse,
  ReleaseSchema,
  rankCandidates,
  runCascade,
  type SearchResult,
  toCandidateFromRelease,
  toCandidateFromSearch,
  toYear,
} from './search';

// The cascade (D-09), candidate mapping and catno pin (D-10) on recorded
// shapes: test/fixtures/discogs/*.json copy the RESEARCH "Discogs API Facts"
// key sets with made-up values. Never a live API.

const FIXTURES = path.join(process.cwd(), 'test/fixtures/discogs');
const fixture = (name: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));

const EMOJI = '\u{1F3B5}';
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

const COMMON = { type: 'release', format: 'CD', per_page: 10, page: 1 };

function inputs(p: Partial<SearchInputs>): SearchInputs {
  return { artist: null, title: null, catno: null, rawText: null, ...p };
}

function result(id: number, extra: Partial<SearchResult> = {}): SearchResult {
  return { id, title: `Artist ${id} - Title ${id}`, ...extra };
}

/** A stub search API answering per stage, recording every call. */
function stubApi(answer: (params: Record<string, unknown>) => ParsedSearch) {
  const calls: Record<string, unknown>[] = [];
  const api: CascadeSearch = {
    search: vi.fn(async (params) => {
      calls.push(params);
      return answer(params);
    }),
  };
  return { api, calls };
}

const none: ParsedSearch = { results: [], total: 0 };

describe('buildStages', () => {
  it('catno only: a catno stage, then a text stage whose q is the catno', () => {
    expect(buildStages(inputs({ catno: 'TR-200' }))).toEqual([
      { stage: 'catno', params: { catno: 'TR-200', ...COMMON } },
      { stage: 'text', params: { q: 'TR-200', ...COMMON } },
    ]);
  });

  it('artist only: artist_title sends artist and no release_title', () => {
    const stages = buildStages(inputs({ artist: 'Nova Lane' }));
    expect(stages.map((s) => s.stage)).toEqual(['artist_title', 'text']);
    expect(stages[0].params).toEqual({ artist: 'Nova Lane', ...COMMON });
    expect(stages[0].params).not.toHaveProperty('release_title');
  });

  it('title only: artist_title sends release_title and no artist', () => {
    const stages = buildStages(inputs({ title: 'Blue Hour' }));
    expect(stages[0].params).toEqual({ release_title: 'Blue Hour', ...COMMON });
  });

  it('no catalog number skips stage 1', () => {
    const stages = buildStages(inputs({ artist: 'A', title: 'B' }));
    expect(stages.map((s) => s.stage)).toEqual(['artist_title', 'text']);
  });

  it('neither artist nor title skips stage 2', () => {
    const stages = buildStages(inputs({ catno: 'X1', rawText: 'X1 raw' }));
    expect(stages.map((s) => s.stage)).toEqual(['catno', 'text']);
    expect(stages[1].params.q).toBe('X1 raw');
  });

  it('without raw text q joins artist, title and catno by single spaces', () => {
    const stages = buildStages(
      inputs({ artist: 'Nova Lane', title: 'Blue Hour', catno: 'TR-200' }),
    );
    expect(stages.map((s) => s.stage)).toEqual([
      'catno',
      'artist_title',
      'text',
    ]);
    expect(stages[2].params.q).toBe('Nova Lane Blue Hour TR-200');
  });

  it('raw text wins over the joined fields for q', () => {
    const stages = buildStages(
      inputs({ artist: 'A', title: 'B', rawText: 'A - B (raw)' }),
    );
    expect(stages[stages.length - 1].params.q).toBe('A - B (raw)');
  });

  it('nothing at all gives no stages', () => {
    expect(buildStages(inputs({}))).toEqual([]);
  });

  it('every stage is release-only, CD-only, ten per page, page 1', () => {
    const stages = buildStages(
      inputs({ artist: 'A', title: 'B', catno: 'C', rawText: 'D' }),
    );
    expect(stages).toHaveLength(3);
    for (const s of stages) expect(s.params).toMatchObject(COMMON);
  });

  it('q is capped at 200 code points without splitting a surrogate pair', () => {
    const a = 'a'.repeat(120);
    const b = `${'b'.repeat(78)}${EMOJI}${'c'.repeat(50)}`;
    const stages = buildStages(searchInputs({ artist: a, title: b }));
    const q = String(stages[stages.length - 1].params.q);
    // 120 + 1 space + 78 + emoji = 200 code points.
    expect(Array.from(q)).toHaveLength(200);
    expect(q.endsWith(EMOJI)).toBe(true);
    expect(LONE_SURROGATE.test(q)).toBe(false);
  });
});

describe('runCascade', () => {
  it('stops at catno when it returns results; artist_title is never called', async () => {
    const { api, calls } = stubApi((p) =>
      p.catno ? { results: [result(1)], total: 1 } : none,
    );
    const out = await runCascade(
      inputs({ catno: 'TR-200', artist: 'A', title: 'B' }),
      api,
    );
    expect(out.stage).toBe('catno');
    expect(out.results.map((r) => r.id)).toEqual([1]);
    expect(calls).toHaveLength(1);
  });

  // The demo recording of spine 01: Discogs catno= is fuzzy, so a misread
  // 'KORI' returns other labels' releases that never name the spine.
  const KORI_NOISE: ParsedSearch = {
    results: [
      result(16154490, {
        title: 'Evelyn Campos - Amor Loco Amor',
        catno: 'KORI-0001-2',
      }),
      result(20663365, {
        title: "L'Orchestre Empire Bakuba* - Dans Ces Origines Vol.2",
        catno: 'KORIAZ CD 02',
      }),
    ],
    total: 4,
  };
  const VISION = inputs({
    artist: 'VISION',
    title: 'JUST SHORT OF LIVING',
    catno: 'KORI',
    rawText: 'VISION JUST SHORT OF LIVING KORI',
  });

  it('catno results that name neither artist nor title fall through to artist_title', async () => {
    const { api, calls } = stubApi((p) =>
      p.catno
        ? KORI_NOISE
        : p.artist
          ? {
              results: [
                result(1520531, {
                  title: 'Vision (10) - Just Short Of Living',
                }),
              ],
              total: 1,
            }
          : none,
    );
    const out = await runCascade(VISION, api);
    expect(out.stage).toBe('artist_title');
    expect(out.results.map((r) => r.id)).toEqual([1520531]);
    expect(calls.map((c) => Object.keys(c)[0])).toEqual(['catno', 'artist']);
  });

  it('an exact catno of another artist does not win over artist and title', async () => {
    const { api } = stubApi((p) =>
      p.catno
        ? {
            results: [
              result(1, {
                title: 'Bohren & Der Club Of Gore - Black Earth',
                catno: 'IPC 48',
              }),
            ],
            total: 1,
          }
        : p.artist
          ? {
              results: [
                result(2, {
                  title: 'Kid606 - Kill Sound Before Sound Kills You',
                }),
              ],
              total: 1,
            }
          : none,
    );
    const out = await runCascade(
      inputs({
        artist: 'Kid606',
        title: 'Kill Sound Before Sound Kills You',
        catno: 'IPC-48',
      }),
      api,
    );
    expect(out.stage).toBe('artist_title');
    expect(out.results.map((r) => r.id)).toEqual([2]);
  });

  it('catno results naming the artist or title still win (punctuation and case ignored)', async () => {
    const { api, calls } = stubApi((p) =>
      p.catno
        ? {
            results: [
              result(3, {
                title: 'Massive Attack - Blue Lines',
                catno: 'V2 86228',
              }),
            ],
            total: 1,
          }
        : none,
    );
    const out = await runCascade(
      inputs({
        artist: 'massive attack',
        title: 'blue lines',
        catno: 'V2 0777 7 86228 2 6',
      }),
      api,
    );
    expect(out.stage).toBe('catno');
    expect(calls).toHaveLength(1);
  });

  it('uncorroborated catno results are kept when every later stage is empty', async () => {
    const { api, calls } = stubApi((p) => (p.catno ? KORI_NOISE : none));
    const out = await runCascade(VISION, api);
    expect(out.stage).toBe('catno');
    expect(out.results.map((r) => r.id)).toEqual([16154490, 20663365]);
    expect(out.total).toBe(4);
    expect(calls).toHaveLength(3);
  });

  it('a catno-only spine keeps the catno stage (nothing to compare against)', async () => {
    const { api, calls } = stubApi((p) => (p.catno ? KORI_NOISE : none));
    const out = await runCascade(inputs({ catno: 'KORI' }), api);
    expect(out.stage).toBe('catno');
    expect(calls).toHaveLength(1);
  });

  it('falls through to text when catno and artist_title return 0', async () => {
    const { api, calls } = stubApi((p) =>
      p.q ? { results: [result(7)], total: 1 } : none,
    );
    const out = await runCascade(
      inputs({ catno: 'TR-205', artist: 'Owen Ashby', title: 'North Light' }),
      api,
    );
    expect(out.stage).toBe('text');
    expect(calls.map((c) => Object.keys(c)[0])).toEqual([
      'catno',
      'artist',
      'q',
    ]);
  });

  it('with no stages returns stage null and makes no call', async () => {
    const { api, calls } = stubApi(() => {
      throw new Error('no request expected');
    });
    const out = await runCascade(inputs({}), api);
    expect(out).toEqual({ stage: null, results: [], total: 0 });
    expect(calls).toHaveLength(0);
  });

  it('every stage empty gives stage null after one call per stage', async () => {
    const { api, calls } = stubApi(() => none);
    const out = await runCascade(inputs({ catno: 'X', artist: 'Y' }), api);
    expect(out.stage).toBeNull();
    expect(calls).toHaveLength(3);
  });

  it('12 results keep the first 10; 10 keep 10; fewer keep all', async () => {
    for (const [n, want] of [
      [12, 10],
      [10, 10],
      [3, 3],
    ] as const) {
      const results = Array.from({ length: n }, (_, i) => result(i + 1));
      const { api } = stubApi(() => ({ results, total: 40 }));
      const out = await runCascade(inputs({ catno: 'X' }), api);
      expect(out.results.map((r) => r.id)).toEqual(
        results.slice(0, want).map((r) => r.id),
      );
      expect(out.total).toBe(40);
    }
    expect(PER_PAGE).toBe(10);
  });
});

describe('parseSearchResponse on the recorded shapes', () => {
  it('drops an invalid result and keeps the rest in order', () => {
    const parsed = parseSearchResponse(fixture('search-hit.json'));
    expect(parsed.results.map((r) => r.id)).toEqual([
      4100001, 4100002, 4100004,
    ]);
    expect(parsed.total).toBe(4);
  });

  it('an empty answer is zero results', () => {
    expect(parseSearchResponse(fixture('search-empty.json'))).toEqual({
      results: [],
      total: 0,
    });
  });

  it('a body without pagination or results throws', () => {
    expect(() => parseSearchResponse({ message: 'nope' })).toThrow();
  });

  it('a non-integer or non-positive id is dropped', () => {
    const parsed = parseSearchResponse({
      pagination: { items: 3 },
      results: [
        { id: 1.5, title: 'a' },
        { id: 0, title: 'b' },
        { id: 3, title: 'c' },
      ],
    });
    expect(parsed.results.map((r) => r.id)).toEqual([3]);
  });
});

describe('toCandidateFromSearch', () => {
  const [dgc, don, japan] = parseSearchResponse(
    fixture('search-hit.json'),
  ).results;

  it('dedupes labels and maps year, thumb and master_id', () => {
    const c = toCandidateFromSearch(dgc, 'catno', 0);
    expect(c.releaseId).toBe(4100001);
    expect(Number.isInteger(c.releaseId)).toBe(true);
    expect(c.labels).toEqual(['DGC']);
    expect(c.year).toBe(1991);
    expect(c.thumbUrl).toBeNull();
    expect(c.masterId).toBeNull();
    expect(c.catno).toBe('DGCD-24425');
    expect(c.country).toBe('US');
    expect(c.formats).toEqual([
      { name: 'CD', qty: '1', descriptions: ['Album'], text: null },
    ]);
    expect(c.stage).toBe('catno');
    expect(c.rank).toBe(0);
  });

  it('keeps the combined title verbatim and reads the artist before " - "', () => {
    const c = toCandidateFromSearch(don, 'text', 1);
    expect(c.title).toBe('Don Williams (2) - The Best Of Don Williams');
    expect(c.artist).toBe('Don Williams (2)');
    expect(c.year).toBeNull();
    expect(c.masterId).toBe(5200002);
    expect(c.thumbUrl).toBe('https://i.discogs.com/fake/4100002.jpeg');
    expect(c.formats[0].text).toBe('Club Edition');
  });

  it("year '0' and a missing master_id are null", () => {
    const c = toCandidateFromSearch(japan, 'catno', 2);
    expect(c.year).toBeNull();
    expect(c.masterId).toBeNull();
  });

  it('a capped title never splits a surrogate pair', () => {
    const title = `${'a'.repeat(499)}${EMOJI}tail`;
    const c = toCandidateFromSearch(
      parseSearchResponse({
        pagination: { items: 1 },
        results: [{ id: 9, title, country: `${'b'.repeat(199)}${EMOJI}x` }],
      }).results[0],
      'text',
      0,
    );
    expect(LONE_SURROGATE.test(c.title)).toBe(false);
    expect(c.title).toBe(`${'a'.repeat(499)}${EMOJI}`);
    expect(LONE_SURROGATE.test(c.country ?? '')).toBe(false);
    expect(c.country).toBe(`${'b'.repeat(199)}${EMOJI}`);
  });
});

describe('toYear', () => {
  it.each([
    ['1991', 1991],
    [' 1991 ', 1991],
    [1991, 1991],
    ['', null],
    ['0', null],
    [0, null],
    [null, null],
    [undefined, null],
    ['199l', null],
    ['1991-05', null],
    [1991.5, null],
  ] as const)('%j -> %j', (v, want) => {
    expect(toYear(v)).toBe(want);
  });
});

describe('toCandidateFromRelease', () => {
  const rel = ReleaseSchema.parse(fixture('release.json'));

  it('joins the artists into the combined title and maps the release keys', () => {
    const c = toCandidateFromRelease(rel);
    expect(c.releaseId).toBe(4100001);
    expect(c.artist).toBe('Fake Band & Guest Singer');
    expect(c.title).toBe('Fake Band & Guest Singer - Fake Album');
    expect(c.year).toBe(1991);
    expect(c.labels).toEqual(['DGC']);
    expect(c.catno).toBe('DGCD-24425');
    expect(c.masterId).toBeNull();
    expect(c.stage).toBe('release');
    // An empty thumb falls back to the first image's uri150.
    expect(c.thumbUrl).toBe('https://i.discogs.com/fake/4100001-150.jpeg');
  });

  it('a capped release title never splits a surrogate pair', () => {
    const c = toCandidateFromRelease({
      ...rel,
      artists: [{ name: 'A', anv: null, join: null }],
      title: `${'t'.repeat(495)}${EMOJI}tail`,
    });
    // 'A - ' is 4 code points: 4 + 495 + emoji = 500.
    expect(LONE_SURROGATE.test(c.title)).toBe(false);
    expect(c.title).toBe(`A - ${'t'.repeat(495)}${EMOJI}`);
  });
});

describe('normalizeCatno and rankCandidates', () => {
  it("'DGCD-24425' equals 'dgcd 24425'", () => {
    expect(normalizeCatno('DGCD-24425')).toBe(normalizeCatno('dgcd 24425'));
    expect(normalizeCatno('DGCD-24425')).toBe('DGCD24425');
  });

  it("full-width 'ＣＤ１２３' equals 'CD123'", () => {
    expect(normalizeCatno('ＣＤ１２３')).toBe('CD123');
  });

  it('keeps letters and digits of any script', () => {
    expect(normalizeCatno('ビクター-123')).toBe('ビクター123');
  });

  it('null, undefined and punctuation-only normalize to empty', () => {
    expect(normalizeCatno(null)).toBe('');
    expect(normalizeCatno(undefined)).toBe('');
    expect(normalizeCatno(' - / . ')).toBe('');
  });

  const cand = (releaseId: number, catno: string | null): Candidate => ({
    releaseId,
    rank: 99,
    title: `t${releaseId}`,
    artist: null,
    year: null,
    country: null,
    labels: [],
    catno,
    formats: [],
    thumbUrl: null,
    masterId: null,
    stage: 'catno',
    catnoMatch: false,
  });

  it('stable partition: exact matches first in Discogs order, then the rest', () => {
    const ranked = rankCandidates(
      [
        cand(1, 'OTHER 1'),
        cand(2, 'dgcd 24425'),
        cand(3, null),
        cand(4, 'DGCD24425'),
        cand(5, 'CDGCD 24425 *'),
      ],
      'DGCD-24425',
    );
    expect(ranked.map((c) => c.releaseId)).toEqual([2, 4, 1, 3, 5]);
    expect(ranked.map((c) => c.catnoMatch)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(ranked.map((c) => c.rank)).toEqual([0, 1, 2, 3, 4]);
  });

  it('a spine catno of only punctuation never pins', () => {
    const ranked = rankCandidates([cand(1, '-'), cand(2, '')], ' - ');
    expect(ranked.every((c) => !c.catnoMatch)).toBe(true);
    expect(ranked.map((c) => c.releaseId)).toEqual([1, 2]);
  });

  it('no spine catno keeps Discogs order and pins nothing', () => {
    const ranked = rankCandidates([cand(1, 'A'), cand(2, 'B')], null);
    expect(ranked.map((c) => [c.releaseId, c.catnoMatch])).toEqual([
      [1, false],
      [2, false],
    ]);
  });

  it('ranks the recorded hit: both DGCD-24425 spellings are pinned', () => {
    const results = parseSearchResponse(fixture('search-hit.json')).results;
    const ranked = rankCandidates(
      results.map((r, i) => toCandidateFromSearch(r, 'catno', i)),
      'DGCD-24425',
    );
    expect(ranked.map((c) => [c.releaseId, c.catnoMatch])).toEqual([
      [4100001, true],
      [4100004, true],
      [4100002, false],
    ]);
  });
});
