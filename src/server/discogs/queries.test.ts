import { describe, expect, it } from 'vitest';
import { orphanScenario } from '../../../test/helpers/scan-runs';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';
import { getDb } from '../db/client';
import { newId } from '../ids';
import { updateSpineField } from '../scan/fields';
import { inputHash, loadSpineInputs, searchInputs } from './inputs';
import {
  discogsForSpines,
  ENDED_WITHOUT_RESULT,
  type LatestSearchRow,
  listCandidates,
  searchStateOf,
} from './queries';
import { createSearch, finishSearch, setSearchJob } from './store';

// The Discogs half of the /spines read model (D-10, D-11, Plan 03-08).

function row(
  status: LatestSearchRow['status'],
  extra: Partial<LatestSearchRow> = {},
): LatestSearchRow {
  return { status, error_kind: null, error: null, job_status: null, ...extra };
}

describe('searchStateOf (D-11)', () => {
  it('no search, not connected and skipped read as not searched', () => {
    expect(searchStateOf(null, 0).state).toBe('not_searched');
    expect(searchStateOf(row('not_connected'), 0).state).toBe('not_searched');
    expect(searchStateOf(row('skipped'), 0).state).toBe('not_searched');
  });

  it('a queued search follows its job', () => {
    expect(searchStateOf(row('queued', { job_status: 'queued' }), 0)).toEqual({
      state: 'queued',
      failure: null,
    });
    expect(
      searchStateOf(row('queued', { job_status: 'running' }), 2).state,
    ).toBe('searching');
    expect(
      searchStateOf(
        row('queued', { job_status: 'failed', error_kind: 'unavailable' }),
        0,
      ),
    ).toEqual({
      state: 'failed',
      failure: { kind: 'unavailable', reason: null },
    });
    expect(
      searchStateOf(row('queued', { job_status: 'succeeded' }), 0),
    ).toEqual({
      state: 'failed',
      failure: { kind: 'other', reason: ENDED_WITHOUT_RESULT },
    });
  });

  it('terminal statuses map to done, no matches and failed', () => {
    expect(searchStateOf(row('done'), 3).state).toBe('done');
    expect(searchStateOf(row('no_match'), 0).state).toBe('no_match');
    expect(searchStateOf(row('no_match'), 1).state).toBe('done');
    expect(searchStateOf(null, 1).state).toBe('done');
    expect(searchStateOf(row('auth_failed'), 0)).toEqual({
      state: 'failed',
      failure: { kind: 'auth', reason: null },
    });
    expect(
      searchStateOf(
        row('failed', { error_kind: 'rejected', error: 'HTTP 422' }),
        1,
      ),
    ).toEqual({
      state: 'failed',
      failure: { kind: 'other', reason: 'HTTP 422' },
    });
  });

  it('cuts a long stored reason to 160 code points', () => {
    const long = '😀'.repeat(300);
    const { failure } = searchStateOf(
      row('failed', { error_kind: 'Error', error: long }),
      0,
    );
    expect(Array.from(failure?.reason ?? '')).toHaveLength(160);
  });
});

describe('discogsForSpines and listCandidates (D-10)', () => {
  useTempDataDir();

  function seed(): void {
    const db = getDb().$client;
    const now = Date.now();
    db.prepare(
      `INSERT INTO photos (id, sha256, original_name, mime, bytes,
         original_path, created_at, updated_at)
       VALUES ('p1', 'abc', 'shelf.jpg', 'image/jpeg', 1, 'photos/x.jpg',
         @now, @now)`,
    ).run({ now });
    for (const id of ['s1', 's2']) {
      db.prepare(
        `INSERT INTO spines (id, photo_id, state, created_at, updated_at)
         VALUES (@id, 'p1', 'active', @now, @now)`,
      ).run({ id, now });
    }
  }

  function addCandidate(
    searchId: string,
    c: {
      releaseId: number;
      rank: number;
      source?: 'auto' | 'manual';
      catnoMatch?: boolean;
      createdAt?: number;
      country?: string | null;
    },
  ): void {
    getDb()
      .$client.prepare(
        `INSERT INTO discogs_candidates (id, spine_id, search_id, source,
           release_id, rank, title, country, labels_json, formats_json,
           thumb_url, catno_match, created_at)
         VALUES (@id, 's1', @searchId, @source, @releaseId, @rank, @title,
           @country, '["L"]',
           '[{"name":"CD","qty":"2","descriptions":["Album"]}]',
           NULL, @catnoMatch, @createdAt)`,
      )
      .run({
        id: newId(),
        searchId,
        source: c.source ?? 'auto',
        releaseId: c.releaseId,
        rank: c.rank,
        title: `Artist (2) - Title ${c.releaseId}`,
        catnoMatch: c.catnoMatch ? 1 : 0,
        createdAt: c.createdAt ?? 1,
        country: c.country ?? null,
      });
  }

  it('puts the preferred country first, then the fallback country, after catno matches (G-06-side-3)', () => {
    seed();
    const db = getDb().$client;
    const auto = createSearch(db, {
      spineId: 's1',
      kind: 'auto',
      inputs: searchInputs({ artist: 'A' }),
      inputHash: 'h',
    });
    finishSearch(db, auto, { status: 'done', resultCount: 4 });
    addCandidate(auto, { releaseId: 1, rank: 0, country: 'Australia' });
    addCandidate(auto, { releaseId: 2, rank: 1, country: 'US' });
    addCandidate(auto, { releaseId: 3, rank: 2, country: 'Canada' });
    addCandidate(auto, {
      releaseId: 4,
      rank: 3,
      country: 'Germany',
      catnoMatch: true,
    });
    expect(listCandidates(db, 's1').map((c) => c.releaseId)).toEqual([
      4, 3, 2, 1,
    ]);

    db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES
         ('preferred_country', '"US"', 1), ('fallback_country', '"Australia"', 1)`,
    ).run();
    expect(listCandidates(db, 's1').map((c) => c.releaseId)).toEqual([
      4, 2, 1, 3,
    ]);
    expect(
      discogsForSpines(db, [{ id: 's1' }]).get('s1')?.topCandidates[0]
        ?.releaseId,
    ).toBe(4);
  });

  it('orders manual newest first, then catno matches, then rank; dedupes', () => {
    seed();
    const db = getDb().$client;
    const auto = createSearch(db, {
      spineId: 's1',
      kind: 'auto',
      inputs: searchInputs({ artist: 'A' }),
      inputHash: 'h',
    });
    finishSearch(db, auto, { status: 'done', resultCount: 4 });
    addCandidate(auto, { releaseId: 10, rank: 0 });
    addCandidate(auto, { releaseId: 11, rank: 1 });
    addCandidate(auto, { releaseId: 12, rank: 2, catnoMatch: true });
    addCandidate(auto, { releaseId: 13, rank: 3 });
    const manual = createSearch(db, {
      spineId: 's1',
      kind: 'manual',
      inputs: searchInputs({}),
      inputHash: null,
    });
    addCandidate(manual, {
      releaseId: 11,
      rank: 0,
      source: 'manual',
      createdAt: 5,
    });
    addCandidate(manual, {
      releaseId: 20,
      rank: 0,
      source: 'manual',
      createdAt: 9,
    });

    const all = listCandidates(db, 's1');
    expect(all.map((c) => [c.releaseId, c.source])).toEqual([
      [20, 'manual'],
      [11, 'manual'],
      [12, 'auto'],
      [10, 'auto'],
      [13, 'auto'],
    ]);
    expect(all[0]).toMatchObject({
      title: 'Artist (2) - Title 20',
      labels: ['L'],
      formats: [{ name: 'CD', qty: '2', descriptions: ['Album'], text: null }],
      hasThumb: false,
    });

    const summaries = discogsForSpines(db, [{ id: 's1' }, { id: 's2' }]);
    const s1 = summaries.get('s1');
    expect(s1?.state).toBe('done');
    expect(s1?.candidateCount).toBe(5);
    expect(s1?.topCandidates.map((c) => c.releaseId)).toEqual([20, 11, 12]);
    expect(summaries.get('s2')).toEqual({
      state: 'not_searched',
      candidateCount: 0,
      topCandidates: [],
      failure: null,
      fieldsChanged: false,
    });
  });

  it('a release both found and added manually lists once, as manual', () => {
    seed();
    const db = getDb().$client;
    const auto = createSearch(db, {
      spineId: 's1',
      kind: 'auto',
      inputs: searchInputs({ artist: 'A' }),
      inputHash: 'h',
    });
    finishSearch(db, auto, { status: 'done', resultCount: 3 });
    addCandidate(auto, { releaseId: 30, rank: 0 });
    addCandidate(auto, { releaseId: 31, rank: 1, catnoMatch: true });
    addCandidate(auto, { releaseId: 32, rank: 2 });
    const manual = createSearch(db, {
      spineId: 's1',
      kind: 'manual',
      inputs: searchInputs({}),
      inputHash: null,
    });
    addCandidate(manual, {
      releaseId: 32,
      rank: 0,
      source: 'manual',
      createdAt: 3,
    });

    expect(
      listCandidates(db, 's1').map((c) => [c.releaseId, c.source]),
    ).toEqual([
      [32, 'manual'],
      [31, 'auto'],
      [30, 'auto'],
    ]);
    const s1 = discogsForSpines(db, [{ id: 's1' }]).get('s1');
    expect(s1?.candidateCount).toBe(3);
    expect(s1?.topCandidates.map((c) => c.releaseId)).toEqual([32, 31, 30]);
    expect(listCandidates(db, 's2')).toEqual([]);
  });

  it('reads the latest auto or again search and its job', () => {
    seed();
    const db = getDb().$client;
    const first = createSearch(db, {
      spineId: 's2',
      kind: 'auto',
      inputs: searchInputs({ artist: 'A' }),
      inputHash: 'h',
    });
    finishSearch(db, first, { status: 'no_match' });
    const again = createSearch(db, {
      spineId: 's2',
      kind: 'again',
      inputs: searchInputs({ artist: 'A' }),
      inputHash: 'h',
    });
    db.prepare(
      'UPDATE discogs_searches SET created_at = created_at + 1 WHERE id = @id',
    ).run({ id: again });
    const jobId = newId();
    db.prepare(
      `INSERT INTO jobs (id, type, lane, status, payload, attempts,
         max_attempts, run_after, created_at, updated_at)
       VALUES (@id, 'search_spine', 'discogs', 'running', '{}', 1, 5, 0, 0, 0)`,
    ).run({ id: jobId });
    setSearchJob(db, again, jobId);
    expect(discogsForSpines(db, [{ id: 's2' }]).get('s2')?.state).toBe(
      'searching',
    );
  });
});

describe('fieldsChanged (D-14)', () => {
  useTempDataDir();

  /** A finished search of the spine's current inputs. */
  function searchNow(
    spineId: string,
    kind: 'auto' | 'again',
    status: 'done' | 'no_match' | 'not_connected' = 'done',
  ): void {
    const db = getDb().$client;
    const inputs = loadSpineInputs(db, spineId);
    const id = createSearch(db, {
      spineId,
      kind,
      inputs,
      inputHash: inputHash(inputs),
    });
    finishSearch(db, id, { status });
  }

  function changed(spineId: string): boolean | undefined {
    return discogsForSpines(getDb().$client, [{ id: spineId }]).get(spineId)
      ?.fieldsChanged;
  }

  it('a never-searched spine has fieldsChanged false, even after an edit', async () => {
    const { spineIds } = await orphanScenario();
    expect(changed(spineIds[0])).toBe(false);
    expect(updateSpineField(spineIds[0], 'title', 'Other').ok).toBe(true);
    expect(changed(spineIds[0])).toBe(false);
  });

  it('an edit that normalizes differently flips it to true', async () => {
    const { spineIds } = await orphanScenario();
    searchNow(spineIds[0], 'auto');
    expect(changed(spineIds[0])).toBe(false);
    expect(updateSpineField(spineIds[0], 'title', 'A New Title').ok).toBe(true);
    expect(changed(spineIds[0])).toBe(true);
  });

  it('an edit that only adds whitespace keeps it false', async () => {
    const { spineIds } = await orphanScenario();
    updateSpineField(spineIds[1], 'title', 'Same Title');
    searchNow(spineIds[1], 'auto', 'no_match');
    updateSpineField(spineIds[1], 'title', '  Same   Title ');
    expect(changed(spineIds[1])).toBe(false);
  });

  it('a newer again search with the current values clears it', async () => {
    const { spineIds } = await orphanScenario();
    searchNow(spineIds[2], 'auto');
    updateSpineField(spineIds[2], 'catalog_number', 'XYZ-9');
    expect(changed(spineIds[2])).toBe(true);
    searchNow(spineIds[2], 'again');
    expect(changed(spineIds[2])).toBe(false);
  });

  // Nyquist gap audit (WR-01): fieldsChanged must use the same baseline as
  // the enqueue (the latest auto/again search not in not_connected,
  // auth_failed or skipped).
  it('WR-01: a not_connected latest search over an older done one still compares against the done one', async () => {
    const { spineIds } = await orphanScenario();
    const id = spineIds[0];
    searchNow(id, 'auto');
    updateSpineField(id, 'title', 'Changed After Search');
    searchNow(id, 'auto', 'not_connected');
    // The candidates on screen came from the done search's inputs.
    expect(changed(id)).toBe(true);
  });

  it('WR-01: an auth_failed latest search is no baseline, like in the enqueue', async () => {
    const { spineIds } = await orphanScenario();
    const id = spineIds[1];
    searchNow(id, 'auto');
    updateSpineField(id, 'title', 'Changed After Search');
    const db = getDb().$client;
    const inputs = loadSpineInputs(db, id);
    const again = createSearch(db, {
      spineId: id,
      kind: 'again',
      inputs,
      inputHash: inputHash(inputs),
    });
    finishSearch(db, again, { status: 'auth_failed' });
    expect(changed(id)).toBe(true);
  });

  it('a latest search that never reached Discogs is no baseline', async () => {
    const { spineIds } = await orphanScenario();
    searchNow(spineIds[0], 'auto', 'not_connected');
    updateSpineField(spineIds[0], 'artist', 'Someone Else');
    expect(changed(spineIds[0])).toBe(false);
  });
});

describe('pressing candidates stay hidden (Plan 06-02, RESEARCH Pitfall 8)', () => {
  useTempDataDir();

  it('a pressing row never shows in discogsForSpines or listCandidates', async () => {
    const { spineIds } = await orphanScenario();
    const id = spineIds[0];
    const db = getDb().$client;
    const searchId = createSearch(db, {
      spineId: id,
      kind: 'auto',
      inputs: { artist: null, title: null, catno: null, rawText: 'x' },
      inputHash: 'h',
    });
    finishSearch(db, searchId, { status: 'done', resultCount: 1 });
    const insert = db.prepare(
      `INSERT INTO discogs_candidates (id, spine_id, search_id, source,
         release_id, rank, title, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    );
    insert.run(newId(), id, searchId, 'auto', 5001, 'Nirvana - Nevermind', 1);
    insert.run(
      newId(),
      id,
      searchId,
      'pressing',
      12009956,
      'Nirvana - Nevermind',
      2,
    );
    const summary = discogsForSpines(db, [{ id }]).get(id);
    expect(summary?.candidateCount).toBe(1);
    expect(summary?.topCandidates.map((c) => c.releaseId).join(',')).toBe(
      '5001',
    );
    expect(
      listCandidates(db, id)
        .map((c) => c.releaseId)
        .join(','),
    ).toBe('5001');
  });
});
