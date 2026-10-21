import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTempDataDir } from '../../../../../../test/helpers/temp-data-dir';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

import { getDb } from '@/server/db/client';
import { thumbKey } from '@/server/discogs/thumbs';
import { GET as FILES } from '../../../files/[...path]/route';
import { GET } from './route';

// GET /api/discogs/thumb/{candidateId} (D-13, T-03-24) and the
// discogs-thumbs root of /api/files (T-03-27). The cover URL comes from the
// database; fetch is a stub that must not be called on these paths.

const COVER = 'https://i.discogs.com/abc/h:150/w:150/cover.jpeg';

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function thumb(id: string) {
  return GET(
    new Request(`http://127.0.0.1:3000/api/discogs/thumb/${id}`),
    ctx(id),
  );
}

function files(...segments: string[]) {
  return FILES(new Request('http://127.0.0.1:3000/api/files/x'), {
    params: Promise.resolve({ path: segments }),
  });
}

function seedCandidate(id: string, thumbUrl: string | null): void {
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
       created_at)
     VALUES ('search-1', 'spine-1', 'auto', '{}', 'done', @now)
     ON CONFLICT DO NOTHING`,
  ).run({ now });
  db.prepare(
    `INSERT INTO discogs_candidates (id, spine_id, search_id, source,
       release_id, rank, title, thumb_url, created_at)
     VALUES (@id, 'spine-1', 'search-1', 'auto', @releaseId, 0,
       'Nova Lane - Blue Hour', @thumbUrl, @now)`,
  ).run({ id, releaseId: Math.floor(Math.random() * 1e9), thumbUrl, now });
}

describe('GET /api/discogs/thumb/{id}', () => {
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

  async function writeCached(url: string): Promise<string> {
    const rel = `discogs-thumbs/${thumbKey(url)}.webp`;
    const webp = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#336' },
    })
      .webp()
      .toBuffer();
    fs.mkdirSync(path.join(root(), 'discogs-thumbs'), { recursive: true });
    fs.writeFileSync(path.join(root(), rel), webp);
    return rel;
  }

  it('404 with nosniff for an unknown candidate id', async () => {
    const res = await thumb('no-such-candidate');
    expect(res.status).toBe(404);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('404 without a fetch for a candidate with no thumb URL', async () => {
    seedCandidate('cand-null', null);
    const res = await thumb('cand-null');
    expect(res.status).toBe(404);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('404 without a fetch for a stored URL off the image host', async () => {
    seedCandidate('cand-evil', 'https://evil.example/cover.jpeg');
    expect((await thumb('cand-evil')).status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('404 when the download fails, so the row shows its placeholder', async () => {
    seedCandidate('cand-fail', COVER);
    const res = await thumb('cand-fail');
    expect(res.status).toBe(404);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('307 to /api/files/discogs-thumbs/{key}.webp for a cached cover, no fetch', async () => {
    seedCandidate('cand-ok', COVER);
    const rel = await writeCached(COVER);
    const res = await thumb('cand-ok');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(`/api/files/${rel}`);
    expect(res.headers.get('cache-control')).toBe('private, max-age=86400');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('/api/files serves the cached cover as image/webp', async () => {
    const rel = await writeCached(COVER);
    const res = await files(...rel.split('/'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const body = Buffer.from(await res.arrayBuffer());
    expect((await sharp(body).metadata()).format).toBe('webp');
  });

  it.each([
    [['discogs-thumbs', '..', 'app.db']],
    [['discogs-thumbs', 'x.png']],
    [['discogs-thumbs', '..', '..', 'etc', 'passwd']],
    [['photos', 'x.webp']],
  ])('/api/files refuses %j with 404', async (segments) => {
    fs.mkdirSync(path.join(root(), 'discogs-thumbs'), { recursive: true });
    fs.writeFileSync(path.join(root(), 'discogs-thumbs', 'x.png'), 'png');
    fs.mkdirSync(path.join(root(), 'photos'), { recursive: true });
    fs.writeFileSync(path.join(root(), 'photos', 'x.webp'), 'webp');
    const res = await files(...segments);
    expect(res.status).toBe(404);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
