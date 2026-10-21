import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTempDataDir } from '../../../../../../../../test/helpers/temp-data-dir';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

import { getDb } from '@/server/db/client';
import { thumbKey } from '@/server/discogs/thumbs';
import { GET } from './route';

// GET /api/discogs/searches/{id}/thumb/{releaseId} (D-15, T-03-34). The
// cover URL comes from the search's stored results_json, never the request;
// fetch is a stub that must not be called on the refusal paths.

const COVER = 'https://i.discogs.com/abc/h:150/w:150/dialog.jpeg';

function result(releaseId: number, thumbUrl: string | null) {
  return {
    releaseId,
    rank: 0,
    title: 'Nova Lane - Blue Hour',
    artist: 'Nova Lane',
    year: 2001,
    country: 'UK',
    labels: [],
    catno: 'TR-200',
    formats: [],
    thumbUrl,
    masterId: null,
    stage: 'text',
    catnoMatch: false,
  };
}

function seedSearch(id: string, kind: string, results: unknown[]): void {
  const db = getDb().$client;
  const now = Date.now();
  db.prepare(
    `INSERT INTO photos (id, sha256, original_name, mime, bytes, original_path,
       created_at, updated_at)
     VALUES ('photo-1', 'abc', 'shelf.jpg', 'image/jpeg', 1, 'photos/x.jpg',
       @now, @now)
     ON CONFLICT DO NOTHING`,
  ).run({ now });
  db.prepare(
    `INSERT INTO spines (id, photo_id, state, created_at, updated_at)
     VALUES ('spine-1', 'photo-1', 'active', @now, @now)
     ON CONFLICT DO NOTHING`,
  ).run({ now });
  db.prepare(
    `INSERT INTO discogs_searches (id, spine_id, kind, inputs_json, status,
       results_json, created_at)
     VALUES (@id, 'spine-1', @kind, '{}', 'done', @json, @now)`,
  ).run({ id, kind, json: JSON.stringify(results), now });
}

function thumb(id: string, releaseId: string) {
  return GET(
    new Request(
      `http://127.0.0.1:3000/api/discogs/searches/${id}/thumb/${releaseId}`,
    ),
    { params: Promise.resolve({ id, releaseId }) },
  );
}

describe('GET /api/discogs/searches/{id}/thumb/{releaseId}', () => {
  const root = useTempDataDir();
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn(async () => new Response('nope', { status: 500 }));
    vi.stubGlobal('fetch', fetchSpy);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('307 to /api/files/discogs-thumbs/ for a cached cover of a stored result', async () => {
    seedSearch('s-manual', 'manual', [result(1001, COVER)]);
    const rel = `discogs-thumbs/${thumbKey(COVER)}.webp`;
    fs.mkdirSync(path.join(root(), 'discogs-thumbs'), { recursive: true });
    fs.writeFileSync(
      path.join(root(), rel),
      await sharp({
        create: { width: 8, height: 8, channels: 3, background: '#336' },
      })
        .webp()
        .toBuffer(),
    );
    const res = await thumb('s-manual', '1001');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(`/api/files/${rel}`);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown search', 'no-such', '1001'],
    ['a release not in the stored results', 's-manual', '2002'],
    ['a malformed release id', 's-manual', '1001abc'],
    ['an automatic search', 's-auto', '1001'],
    ['a result without a cover', 's-nothumb', '1001'],
    ['a stored URL off the image host', 's-evil', '1001'],
  ])('404 without a fetch for %s', async (_label, id, releaseId) => {
    seedSearch('s-manual', 'manual', [result(1001, COVER)]);
    seedSearch('s-auto', 'auto', [result(1001, COVER)]);
    seedSearch('s-nothumb', 'manual', [result(1001, null)]);
    seedSearch('s-evil', 'release', [
      result(1001, 'https://evil.example/c.jpg'),
    ]);
    const res = await thumb(id, releaseId);
    expect(res.status).toBe(404);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
