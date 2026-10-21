import { describe, expect, it, vi } from 'vitest';
import { useTempDataDir } from '../../../../../../test/helpers/temp-data-dir';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

import type { CandidatesResponse } from '@/lib/discogs-types';
import { getDb } from '@/server/db/client';
import { searchInputs } from '@/server/discogs/inputs';
import { listCandidates } from '@/server/discogs/queries';
import { createSearch } from '@/server/discogs/store';
import { newId } from '@/server/ids';
import { GET } from './route';

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
