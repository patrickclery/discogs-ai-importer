import { describe, expect, it, vi } from 'vitest';
import { useTempDataDir } from '../../../../../../test/helpers/temp-data-dir';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

import type { DialogSearchDto } from '@/lib/discogs-types';
import { getDb } from '@/server/db/client';
import { GET } from './route';

// GET /api/discogs/searches/{id} (D-15, DISC-06): only manual and release
// searches are served; an unknown, automatic or again id is a 404. Results
// come from the stored results_json, at most 25, flagged alreadyListed when
// the release is one of the spine's candidates.

function result(releaseId: number, thumbUrl: string | null = null) {
  return {
    releaseId,
    rank: 0,
    title: `Nova Lane - Blue Hour ${releaseId}`,
    artist: 'Nova Lane',
    year: 2001,
    country: 'UK',
    labels: ['Fake Label'],
    catno: 'TR-200',
    formats: [],
    thumbUrl,
    masterId: null,
    stage: 'text',
    catnoMatch: false,
  };
}

function seed(): void {
  const db = getDb().$client;
  const now = Date.now();
  db.prepare(
    `INSERT INTO photos (id, sha256, original_name, mime, bytes, original_path,
       created_at, updated_at)
     VALUES ('photo-1', 'abc', 'shelf.jpg', 'image/jpeg', 1, 'photos/x.jpg',
       @now, @now)`,
  ).run({ now });
  db.prepare(
    `INSERT INTO spines (id, photo_id, state, created_at, updated_at)
     VALUES ('spine-1', 'photo-1', 'active', @now, @now)`,
  ).run({ now });
}

function search(
  id: string,
  kind: string,
  status: string,
  extra: {
    results?: unknown[];
    total?: number | null;
    query?: string | null;
    error?: string | null;
    errorKind?: string | null;
    jobStatus?: string;
  } = {},
): void {
  const db = getDb().$client;
  const now = Date.now();
  let jobId: string | null = null;
  if (extra.jobStatus) {
    jobId = `job-${id}`;
    db.prepare(
      `INSERT INTO jobs (id, lane, type, payload, status, attempts,
         max_attempts, run_after, created_at, updated_at)
       VALUES (@jobId, 'discogs', 'search_spine', '{}', @st, 0, 3, 0,
         @now, @now)`,
    ).run({ jobId, st: extra.jobStatus, now });
  }
  db.prepare(
    `INSERT INTO discogs_searches (id, spine_id, kind, inputs_json, status,
       results_json, total_count, query_text, error, error_kind, job_id,
       created_at)
     VALUES (@id, 'spine-1', @kind, '{}', @status, @json, @total, @query,
       @error, @errorKind, @jobId, @now)`,
  ).run({
    id,
    kind,
    status,
    json: extra.results ? JSON.stringify(extra.results) : null,
    total: extra.total ?? null,
    query: extra.query ?? null,
    error: extra.error ?? null,
    errorKind: extra.errorKind ?? null,
    jobId,
    now,
  });
}

async function get(id: string) {
  const res = await GET(
    new Request(`http://127.0.0.1:3000/api/discogs/searches/${id}`),
    { params: Promise.resolve({ id }) },
  );
  return { status: res.status, body: (await res.json()) as DialogSearchDto };
}

describe('GET /api/discogs/searches/{id}', () => {
  useTempDataDir();

  it.each([
    ['an unknown id', 'no-such'],
    ['an automatic search', 's-auto'],
    ['an again search', 's-again'],
  ])('404 for %s', async (_label, id) => {
    seed();
    search('s-auto', 'auto', 'done', { results: [result(1)] });
    search('s-again', 'again', 'done', { results: [result(1)] });
    const { status, body } = await get(id);
    expect(status).toBe(404);
    expect(body).toEqual({
      error: 'not_found',
      message: 'This search no longer exists.',
    });
  });

  it('a done manual search returns its stored results, capped at 25, with alreadyListed', async () => {
    seed();
    const results = Array.from({ length: 30 }, (_, i) =>
      result(1000 + i, i === 0 ? 'https://i.discogs.com/a.jpg' : null),
    );
    search('s-manual', 'manual', 'done', {
      results,
      total: 412,
      query: 'Best Of',
    });
    getDb()
      .$client.prepare(
        `INSERT INTO discogs_candidates (id, spine_id, search_id, source,
           release_id, rank, title, labels_json, formats_json, catno_match,
           created_at)
         VALUES ('cand-1', 'spine-1', 's-manual', 'manual', 1001, 0, 'x',
           '[]', '[]', 0, ?)`,
      )
      .run(Date.now());
    const { status, body } = await get('s-manual');
    expect(status).toBe(200);
    expect(body).toMatchObject({
      id: 's-manual',
      kind: 'manual',
      state: 'done',
      query: 'Best Of',
      totalCount: 412,
      failure: null,
    });
    expect(body.results).toHaveLength(25);
    expect(body.results[0]).toMatchObject({
      releaseId: 1000,
      hasThumb: true,
      alreadyListed: false,
    });
    expect(body.results[1]).toMatchObject({
      releaseId: 1001,
      hasThumb: false,
      alreadyListed: true,
    });
    // Never the raw cover URL.
    expect(JSON.stringify(body)).not.toContain('i.discogs.com');
  });

  it('a release search maps queued/running jobs and failures', async () => {
    seed();
    search('s-q', 'release', 'queued', { jobStatus: 'queued' });
    search('s-run', 'release', 'queued', { jobStatus: 'running' });
    search('s-auth', 'manual', 'auth_failed');
    search('s-down', 'manual', 'queued', {
      jobStatus: 'failed',
      errorKind: 'unavailable',
      error: 'HTTP 502',
    });
    expect((await get('s-q')).body).toMatchObject({
      state: 'queued',
      results: [],
      failure: null,
    });
    expect((await get('s-run')).body.state).toBe('searching');
    expect((await get('s-auth')).body).toMatchObject({
      state: 'failed',
      failure: 'Discogs rejected the connection',
    });
    expect((await get('s-down')).body).toMatchObject({
      state: 'failed',
      failure: "Discogs didn't respond",
    });
  });
});
