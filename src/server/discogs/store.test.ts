import { describe, expect, it } from 'vitest';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';
import { getDb } from '../db/client';
import { newId } from '../ids';
import { searchInputs } from './inputs';
import { listCandidates } from './queries';
import type { Candidate } from './search';
import {
  addManualCandidate,
  createSearch,
  finishSearch,
  getSearch,
  latestAutoSearch,
  replaceAutoCandidates,
} from './store';

// discogs_searches and discogs_candidates writes (D-10, D-16).

const SPINE = 'spine-1';

function seedSpine(): void {
  const db = getDb().$client;
  const now = Date.now();
  db.prepare(
    `INSERT INTO photos (id, sha256, original_name, mime, bytes, original_path,
       created_at, updated_at)
     VALUES ('photo-1', 'abc', 'shelf.jpg', 'image/jpeg', 1, 'photos/x.jpg', @now, @now)`,
  ).run({ now });
  db.prepare(
    `INSERT INTO spines (id, photo_id, state, created_at, updated_at)
     VALUES (@id, 'photo-1', 'active', @now, @now)`,
  ).run({ id: SPINE, now });
}

function search(kind: 'auto' | 'again' | 'manual' = 'auto'): string {
  return createSearch(getDb().$client, {
    spineId: SPINE,
    kind,
    inputs: searchInputs({ artist: 'A' }),
    inputHash: kind === 'manual' ? null : 'h',
  });
}

function cand(releaseId: number, rank: number): Candidate {
  return {
    releaseId,
    rank,
    title: `Artist - Title ${releaseId}`,
    artist: 'Artist',
    year: 1999,
    country: 'UK',
    labels: ['L'],
    catno: `C-${releaseId}`,
    formats: [{ name: 'CD', qty: '1', descriptions: [], text: null }],
    thumbUrl: null,
    masterId: null,
    stage: 'catno',
    catnoMatch: rank === 0,
  };
}

type CandRow = {
  release_id: number;
  source: string;
  search_id: string;
  rank: number;
  catno_match: number;
  stage: string | null;
};

function candidates(): CandRow[] {
  return getDb()
    .$client.prepare(
      `SELECT release_id, source, search_id, rank, catno_match, stage
       FROM discogs_candidates WHERE spine_id = @spineId
       ORDER BY source, rank`,
    )
    .all({ spineId: SPINE }) as CandRow[];
}

function insertManual(searchId: string, releaseId: number): void {
  getDb()
    .$client.prepare(
      `INSERT INTO discogs_candidates (id, spine_id, search_id, source,
         release_id, rank, title, created_at)
       VALUES (@id, @spineId, @searchId, 'manual', @releaseId, 0, 'Manual pick', @now)`,
    )
    .run({ id: newId(), spineId: SPINE, searchId, releaseId, now: Date.now() });
}

describe('discogs store', () => {
  useTempDataDir();

  it('replaceAutoCandidates replaces the old auto rows and keeps a manual row', () => {
    seedSpine();
    const db = getDb().$client;
    const first = search();
    replaceAutoCandidates(db, {
      spineId: SPINE,
      searchId: first,
      stage: 'catno',
      candidates: [cand(1, 0), cand(2, 1)],
    });
    const manual = search('manual');
    insertManual(manual, 2);

    const second = search();
    replaceAutoCandidates(db, {
      spineId: SPINE,
      searchId: second,
      stage: 'text',
      candidates: [cand(3, 0), cand(2, 1)],
    });
    expect(candidates()).toEqual([
      {
        release_id: 3,
        source: 'auto',
        search_id: second,
        rank: 0,
        catno_match: 1,
        stage: 'text',
      },
      {
        release_id: 2,
        source: 'auto',
        search_id: second,
        rank: 1,
        catno_match: 0,
        stage: 'text',
      },
      {
        release_id: 2,
        source: 'manual',
        search_id: manual,
        rank: 0,
        catno_match: 0,
        stage: null,
      },
    ]);
  });

  it('an empty candidate list clears the auto rows only', () => {
    seedSpine();
    const db = getDb().$client;
    const first = search();
    replaceAutoCandidates(db, {
      spineId: SPINE,
      searchId: first,
      stage: 'catno',
      candidates: [cand(1, 0)],
    });
    insertManual(search('manual'), 9);
    replaceAutoCandidates(db, {
      spineId: SPINE,
      searchId: search(),
      stage: null,
      candidates: [],
    });
    expect(candidates().map((c) => [c.source, c.release_id])).toEqual([
      ['manual', 9],
    ]);
  });

  it('stores labels and formats as JSON and catno_match as 0/1', () => {
    seedSpine();
    const db = getDb().$client;
    replaceAutoCandidates(db, {
      spineId: SPINE,
      searchId: search(),
      stage: 'catno',
      candidates: [cand(1, 0)],
    });
    const row = db
      .prepare('SELECT labels_json, formats_json, year FROM discogs_candidates')
      .get() as { labels_json: string; formats_json: string; year: number };
    expect(JSON.parse(row.labels_json)).toEqual(['L']);
    expect(JSON.parse(row.formats_json)[0].name).toBe('CD');
    expect(row.year).toBe(1999);
  });

  it('finishSearch moves a queued search once; a replay changes nothing', () => {
    seedSpine();
    const db = getDb().$client;
    const id = search();
    expect(finishSearch(db, id, { status: 'done', resultCount: 2 })).toBe(true);
    expect(finishSearch(db, id, { status: 'failed', error: 'late' })).toBe(
      false,
    );
    const row = getSearch(db, id);
    expect(row?.status).toBe('done');
    expect(row?.result_count).toBe(2);
    expect(row?.finished_at).not.toBeNull();
  });

  it('latestAutoSearch reads only auto and again searches, newest first', () => {
    seedSpine();
    const db = getDb().$client;
    const auto = search('auto');
    db.prepare(
      'UPDATE discogs_searches SET created_at = created_at - 10 WHERE id = @auto',
    ).run({ auto });
    const again = search('again');
    search('manual');
    expect(latestAutoSearch(db, SPINE)?.id).toBe(again);
  });

  it('a later automatic search after a manual add keeps the manual row, listed first (D-16, UI E7/E8)', () => {
    seedSpine();
    const db = getDb().$client;
    const first = search('auto');
    finishSearch(db, first, { status: 'done' });
    replaceAutoCandidates(db, {
      spineId: SPINE,
      searchId: first,
      stage: 'catno',
      candidates: [cand(10, 0), cand(11, 1)],
    });
    const manual = search('manual');
    finishSearch(db, manual, {
      status: 'done',
      resultsJson: JSON.stringify([{ ...cand(77, 0), stage: 'text' }]),
    });
    expect(
      addManualCandidate(db, {
        spineId: SPINE,
        searchId: manual,
        releaseId: 77,
      }).status,
    ).toBe('ok');

    const again = search('again');
    finishSearch(db, again, { status: 'done' });
    replaceAutoCandidates(db, {
      spineId: SPINE,
      searchId: again,
      stage: 'catno',
      candidates: [cand(12, 0), cand(77, 1)],
    });
    expect(candidates().map((c) => `${c.source}:${c.release_id}`)).toEqual([
      'auto:12',
      'auto:77',
      'manual:77',
    ]);
    const listed = listCandidates(db, SPINE);
    expect(listed[0]).toMatchObject({ releaseId: 77, source: 'manual' });
    expect(listed.map((c) => c.releaseId)).toEqual([77, 12]);
  });
});
