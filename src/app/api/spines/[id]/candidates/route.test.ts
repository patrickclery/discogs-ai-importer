import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTempDataDir } from '../../../../../../test/helpers/temp-data-dir';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

import type { CandidatesResponse } from '@/lib/discogs-types';
import { getDb } from '@/server/db/client';
import { searchInputs } from '@/server/discogs/inputs';
import { listCandidates } from '@/server/discogs/queries';
import type { Candidate } from '@/server/discogs/search';
import { createSearch, finishSearch } from '@/server/discogs/store';
import { newId } from '@/server/ids';
import { GET, POST } from './route';

// Show all (D-12, T-03-41): 404 NOT_FOUND for an unknown, superseded or
// dismissed spine; otherwise every candidate in listCandidates order.

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function get(id: string) {
  return GET(
    new Request(`http://127.0.0.1:3000/api/spines/${id}/candidates`),
    ctx(id),
  );
}

function seedSpine(id: string, state: string): void {
  getDb()
    .$client.prepare(
      `INSERT INTO spines (id, photo_id, state, created_at, updated_at)
       VALUES (@id, 'p1', @state, 1, 1)`,
    )
    .run({ id, state });
}

function seed(): void {
  const db = getDb().$client;
  db.prepare(
    `INSERT INTO photos (id, sha256, original_name, mime, bytes,
       original_path, created_at, updated_at)
     VALUES ('p1', 'abc', 'shelf.jpg', 'image/jpeg', 1, 'photos/x.jpg', 1, 1)`,
  ).run();
  seedSpine('active', 'active');
  seedSpine('orphaned', 'orphaned');
  seedSpine('superseded', 'superseded');
  seedSpine('dismissed', 'dismissed');
}

function addCandidates(spineId: string): void {
  const db = getDb().$client;
  const searchId = createSearch(db, {
    spineId,
    kind: 'manual',
    inputs: searchInputs({}),
    inputHash: null,
  });
  const rows: [number, number, 'auto' | 'manual', number, number][] = [
    // releaseId, rank, source, catnoMatch, createdAt
    [10, 0, 'auto', 0, 1],
    [11, 1, 'auto', 1, 1],
    [12, 2, 'auto', 0, 1],
    [13, 3, 'auto', 0, 1],
    [20, 0, 'manual', 0, 7],
  ];
  for (const [releaseId, rank, source, catnoMatch, createdAt] of rows) {
    db.prepare(
      `INSERT INTO discogs_candidates (id, spine_id, search_id, source,
         release_id, rank, title, labels_json, formats_json, thumb_url,
         catno_match, created_at)
       VALUES (@id, @spineId, @searchId, @source, @releaseId, @rank, @title,
         '[]', '[]', NULL, @catnoMatch, @createdAt)`,
    ).run({
      id: newId(),
      spineId,
      searchId,
      source,
      releaseId,
      rank,
      title: `A - T ${releaseId}`,
      catnoMatch,
      createdAt,
    });
  }
}

describe('GET /api/spines/{id}/candidates', () => {
  useTempDataDir();

  it('404 with the NOT_FOUND shape for an unknown spine', async () => {
    seed();
    const res = await get('no-such-spine');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: 'not_found',
      message: 'This spine no longer exists.',
    });
  });

  it('404 for a superseded or dismissed spine', async () => {
    seed();
    addCandidates('superseded');
    addCandidates('dismissed');
    for (const id of ['superseded', 'dismissed']) {
      const res = await get(id);
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: string }).error).toBe('not_found');
    }
  });

  it('200 with every candidate in listCandidates order', async () => {
    seed();
    addCandidates('active');
    const res = await get('active');
    expect(res.status).toBe(200);
    const body = (await res.json()) as CandidatesResponse;
    expect(body.candidates.map((c) => c.releaseId)).toEqual([
      20, 11, 10, 12, 13,
    ]);
    expect(body.candidates).toEqual(listCandidates(getDb().$client, 'active'));
  });

  it('200 with an empty list for an orphaned spine without candidates', async () => {
    seed();
    const res = await get('orphaned');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ candidates: [] });
  });
});

function result(releaseId: number): Candidate {
  return {
    releaseId,
    rank: 0,
    title: `Static Bloom - Paper Moons ${releaseId}`,
    artist: 'Static Bloom',
    year: 2004,
    country: 'UK',
    labels: ['Fake Label'],
    catno: 'SB-41',
    formats: [{ name: 'CD', qty: '1', descriptions: [], text: null }],
    thumbUrl: null,
    masterId: null,
    stage: 'text',
    catnoMatch: false,
  };
}

/** A dialog (or automatic) search of the spine, done with these results. */
function dialogSearch(
  spineId: string,
  kind: 'manual' | 'release' | 'auto',
  releaseIds: number[] | null,
): string {
  const db = getDb().$client;
  const id = createSearch(db, {
    spineId,
    kind,
    inputs: searchInputs({}),
    inputHash: kind === 'auto' ? 'h' : null,
    queryText: 'Static Bloom',
  });
  if (releaseIds) {
    finishSearch(db, id, {
      status: 'done',
      stage: 'text',
      resultCount: releaseIds.length,
      totalCount: releaseIds.length,
      resultsJson: JSON.stringify(releaseIds.map(result)),
    });
  }
  return id;
}

function post(id: string, body: unknown, contentType = 'application/json') {
  return POST(
    new Request(`http://127.0.0.1:3000/api/spines/${id}/candidates`, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: JSON.stringify(body),
    }),
    ctx(id),
  );
}

function candidateCount(spineId: string): number {
  return (
    getDb()
      .$client.prepare(
        'SELECT COUNT(*) AS n FROM discogs_candidates WHERE spine_id = ?',
      )
      .get(spineId) as { n: number }
  ).n;
}

describe('POST /api/spines/{id}/candidates (T-03-31, T-03-42)', () => {
  useTempDataDir();
  afterEach(() => {
    vi.useRealTimers();
  });

  async function errorOf(res: Response): Promise<string> {
    return ((await res.json()) as { error: string }).error;
  }

  it('415 for text/plain, and nothing is added', async () => {
    seed();
    const searchId = dialogSearch('active', 'manual', [1041]);
    const res = await post(
      'active',
      { searchId, releaseId: 1041 },
      'text/plain',
    );
    expect(res.status).toBe(415);
    expect(candidateCount('active')).toBe(0);
  });

  it('400 when the body carries candidate data beyond searchId and releaseId', async () => {
    seed();
    const searchId = dialogSearch('active', 'manual', [1041]);
    const res = await post('active', {
      searchId,
      releaseId: 1041,
      title: 'Injected',
    });
    expect(res.status).toBe(400);
    expect(candidateCount('active')).toBe(0);
  });

  it('404 search_not_found for a search of another spine', async () => {
    seed();
    const other = dialogSearch('orphaned', 'manual', [1041]);
    const res = await post('active', { searchId: other, releaseId: 1041 });
    expect(res.status).toBe(404);
    expect(await errorOf(res)).toBe('search_not_found');
    expect(candidateCount('active')).toBe(0);
  });

  it('404 search_not_found for an automatic search id and an unknown id', async () => {
    seed();
    const auto = dialogSearch('active', 'auto', [1041]);
    for (const searchId of [auto, 'no-such-search']) {
      const res = await post('active', { searchId, releaseId: 1041 });
      expect(res.status).toBe(404);
      expect(await errorOf(res)).toBe('search_not_found');
    }
    expect(candidateCount('active')).toBe(0);
  });

  it('409 not_done for a queued search', async () => {
    seed();
    const queued = dialogSearch('active', 'manual', null);
    const res = await post('active', { searchId: queued, releaseId: 1041 });
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toBe('not_done');
    expect(candidateCount('active')).toBe(0);
  });

  it('404 release_not_found for a releaseId missing from the stored results', async () => {
    seed();
    const searchId = dialogSearch('active', 'manual', [1041]);
    const res = await post('active', { searchId, releaseId: 9999 });
    expect(res.status).toBe(404);
    expect(await errorOf(res)).toBe('release_not_found');
    expect(candidateCount('active')).toBe(0);
  });

  it('404 not_found for a dismissed spine', async () => {
    seed();
    const searchId = dialogSearch('dismissed', 'manual', [1041]);
    const res = await post('dismissed', { searchId, releaseId: 1041 });
    expect(res.status).toBe(404);
    expect(await errorOf(res)).toBe('not_found');
  });

  it('201 copies the stored result; re-adding keeps one manual row with a newer created_at', async () => {
    seed();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);
    const searchId = dialogSearch('active', 'release', [1041]);
    const res = await post('active', { searchId, releaseId: 1041 });
    expect(res.status).toBe(201);
    const { candidate } = (await res.json()) as {
      candidate: { releaseId: number; source: string; title: string };
    };
    expect(candidate).toMatchObject({
      releaseId: 1041,
      source: 'manual',
      title: 'Static Bloom - Paper Moons 1041',
    });
    const createdAt = () =>
      (
        getDb()
          .$client.prepare(
            `SELECT created_at FROM discogs_candidates
             WHERE spine_id = 'active' AND source = 'manual'`,
          )
          .all() as { created_at: number }[]
      ).map((r) => r.created_at);
    expect(createdAt()).toEqual([1_000_000]);

    vi.setSystemTime(2_000_000);
    const again = dialogSearch('active', 'manual', [1041]);
    const res2 = await post('active', { searchId: again, releaseId: 1041 });
    expect(res2.status).toBe(201);
    expect(createdAt()).toEqual([2_000_000]);
    expect(listCandidates(getDb().$client, 'active')[0]).toMatchObject({
      releaseId: 1041,
      source: 'manual',
    });
  });
});
