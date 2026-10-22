import { describe, expect, it, vi } from 'vitest';
import { orphanScenario } from '../../../../../../test/helpers/scan-runs';
import { useTempDataDir } from '../../../../../../test/helpers/temp-data-dir';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

import { getDb } from '@/server/db/client';
import { createSearch } from '@/server/discogs/store';
import { newId } from '@/server/ids';
import { POST } from './route';

// POST /api/spines/{id}/not-on-discogs (REV-05, D-14, T-04-34, T-04-35):
// JSON only with a strict body; mark and unmark change only the flag; a mark
// is refused on an imported spine and while an import is open.

function db() {
  return getDb().$client;
}

function mark(id: string, body: unknown, contentType = 'application/json') {
  return POST(
    new Request(`http://127.0.0.1:3001/api/spines/${id}/not-on-discogs`, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

function flagOf(spineId: string): number {
  return (
    db()
      .prepare('SELECT not_on_discogs AS f FROM spines WHERE id = ?')
      .get(spineId) as { f: number }
  ).f;
}

/** A finished search of the spine with one stored candidate. */
function seedCandidate(spineId: string): void {
  const searchId = createSearch(db(), {
    spineId,
    kind: 'manual',
    inputs: { artist: null, title: null, catno: null, rawText: 'x' },
    inputHash: null,
  });
  db()
    .prepare(
      `INSERT INTO discogs_candidates (id, spine_id, search_id, source,
         release_id, rank, title, labels_json, formats_json, thumb_url,
         catno_match, created_at)
       VALUES (@id, @spineId, @searchId, 'manual', 1031, 0, 'A - T',
         '[]', '[]', NULL, 0, @now)`,
    )
    .run({ id: newId(), spineId, searchId, now: Date.now() });
}

/** An import row of the spine in `status`, optionally with a copy number. */
function seedImport(
  spineId: string,
  status: string,
  instanceId: number | null = null,
): void {
  const now = Date.now();
  db()
    .prepare(
      `INSERT INTO imports (id, spine_id, release_id, folder_id, status,
         instance_id, created_at, updated_at)
       VALUES (@id, @spineId, 1031, 1, @status, @instanceId, @now, @now)`,
    )
    .run({ id: newId(), spineId, status, instanceId, now });
}

/** Everything a mark must leave untouched for the spine. */
function untouched(spineId: string): string {
  return JSON.stringify([
    db()
      .prepare(
        `SELECT id, photo_id, current_detection_id, created_run_id, state
         FROM spines WHERE id = ?`,
      )
      .get(spineId),
    db()
      .prepare('SELECT * FROM spine_fields WHERE spine_id = ? ORDER BY field')
      .all(spineId),
    db().prepare('SELECT * FROM spine_detections ORDER BY id').all(),
    db()
      .prepare('SELECT * FROM discogs_searches WHERE spine_id = ? ORDER BY id')
      .all(spineId),
    db()
      .prepare(
        'SELECT * FROM discogs_candidates WHERE spine_id = ? ORDER BY id',
      )
      .all(spineId),
    db().prepare('SELECT * FROM imports ORDER BY id').all(),
    db().prepare('SELECT * FROM jobs ORDER BY id').all(),
  ]);
}

describe('POST /api/spines/{id}/not-on-discogs', () => {
  useTempDataDir();

  it('415 for text/plain and 400 for a bad body, and nothing changes', async () => {
    const { spineIds } = await orphanScenario();
    const id = spineIds[0];
    expect((await mark(id, { flag: true }, 'text/plain')).status).toBe(415);
    const extra = await mark(id, { flag: true, x: 1 });
    expect(extra.status).toBe(400);
    expect(((await extra.json()) as { error: string }).error).toBe(
      'invalid_body',
    );
    expect((await mark(id, { flag: 'yes' })).status).toBe(400);
    expect((await mark(id, {})).status).toBe(400);
    expect(flagOf(id)).toBe(0);
  });

  it('marks and unmarks, changing only the flag', async () => {
    const { spineIds } = await orphanScenario();
    const id = spineIds[0];
    seedCandidate(id);
    const before = untouched(id);

    const on = await mark(id, { flag: true });
    expect(on.status).toBe(200);
    expect(await on.json()).toEqual({ id, notOnDiscogs: true });
    expect(flagOf(id)).toBe(1);
    expect(untouched(id)).toBe(before);

    const off = await mark(id, { flag: false });
    expect(off.status).toBe(200);
    expect(await off.json()).toEqual({ id, notOnDiscogs: false });
    expect(flagOf(id)).toBe(0);
    expect(untouched(id)).toBe(before);
  });

  it('marks an orphaned spine', async () => {
    const { orphanId } = await orphanScenario();
    expect((await mark(orphanId, { flag: true })).status).toBe(200);
    expect(flagOf(orphanId)).toBe(1);
  });

  it('409 imported for a spine already in the collection', async () => {
    const { spineIds } = await orphanScenario();
    const id = spineIds[0];
    seedImport(id, 'imported', 777);
    const before = untouched(id);
    const res = await mark(id, { flag: true });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'imported',
      message:
        "This spine is already in your collection, so it can't be marked.",
    });
    expect(flagOf(id)).toBe(0);
    expect(untouched(id)).toBe(before);
  });

  it('409 import_open while an import is pending, importing or held', async () => {
    const { spineIds } = await orphanScenario();
    const statuses = ['pending', 'importing', 'already_in_collection'];
    for (const [i, status] of statuses.entries()) {
      const id = spineIds[i];
      seedImport(id, status);
      const res = await mark(id, { flag: true });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: 'import_open',
        message: 'This spine has a match being added. Change the match first.',
      });
      expect(flagOf(id)).toBe(0);
    }
  });

  it('marks a spine whose latest import failed', async () => {
    const { spineIds } = await orphanScenario();
    const id = spineIds[0];
    seedImport(id, 'failed');
    expect((await mark(id, { flag: true })).status).toBe(200);
    expect(flagOf(id)).toBe(1);
  });

  it('404 for an unknown spine', async () => {
    await orphanScenario();
    const res = await mark('nope', { flag: true });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('not_found');
  });

  it('409 not_markable for a superseded spine', async () => {
    const { supersededId } = await orphanScenario();
    const res = await mark(supersededId, { flag: true });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe(
      'not_markable',
    );
    expect(flagOf(supersededId)).toBe(0);
  });
});
