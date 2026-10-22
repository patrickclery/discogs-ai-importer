import { afterEach, describe, expect, it, vi } from 'vitest';
import { orphanScenario } from '../../../test/helpers/scan-runs';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';
import { getDb } from '../db/client';
import { newId } from '../ids';
import { setNotOnDiscogs } from './not-on-discogs';

// setNotOnDiscogs (REV-05, D-14, A-04-20): the mark changes only the flag,
// is reversible, and a repeat is a no-op that writes nothing.

function db() {
  return getDb().$client;
}

function spine(id: string) {
  return db().prepare('SELECT * FROM spines WHERE id = ?').get(id) as {
    not_on_discogs: number;
    updated_at: number;
    [k: string]: unknown;
  };
}

/** The spine row without the mark's own columns, and every related table. */
function reviewInputs(id: string): string {
  const { not_on_discogs: _f, updated_at: _u, ...rest } = spine(id);
  return JSON.stringify([
    rest,
    db()
      .prepare('SELECT * FROM spine_fields WHERE spine_id = ? ORDER BY field')
      .all(id),
    db().prepare('SELECT * FROM spine_detections ORDER BY id').all(),
    db().prepare('SELECT * FROM discogs_searches ORDER BY id').all(),
    db().prepare('SELECT * FROM discogs_candidates ORDER BY id').all(),
    db().prepare('SELECT * FROM imports ORDER BY id').all(),
    db().prepare('SELECT * FROM jobs ORDER BY id').all(),
  ]);
}

function seedImport(spineId: string, status: string): void {
  const now = Date.now();
  db()
    .prepare(
      `INSERT INTO imports (id, spine_id, release_id, folder_id, status,
         created_at, updated_at)
       VALUES (@id, @spineId, 1031, 1, @status, @now, @now)`,
    )
    .run({ id: newId(), spineId, status, now });
}

/** Moves the clock on so a write would show in updated_at. */
function tick(): void {
  vi.setSystemTime(Date.now() + 60_000);
}

describe('setNotOnDiscogs', () => {
  useTempDataDir();
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mark then unmark restores the review status inputs', async () => {
    const { spineIds } = await orphanScenario();
    const id = spineIds[0];
    const before = reviewInputs(id);
    expect(setNotOnDiscogs(db(), id, true)).toEqual({
      status: 'ok',
      notOnDiscogs: true,
    });
    expect(spine(id).not_on_discogs).toBe(1);
    expect(reviewInputs(id)).toBe(before);
    expect(setNotOnDiscogs(db(), id, false)).toEqual({
      status: 'ok',
      notOnDiscogs: false,
    });
    expect(spine(id).not_on_discogs).toBe(0);
    expect(reviewInputs(id)).toBe(before);
  });

  it('marking twice is ok and the repeat writes nothing', async () => {
    const { spineIds } = await orphanScenario();
    const id = spineIds[0];
    vi.useFakeTimers({ toFake: ['Date'] });
    expect(setNotOnDiscogs(db(), id, true).status).toBe('ok');
    const marked = JSON.stringify(spine(id));
    tick();
    expect(setNotOnDiscogs(db(), id, true)).toEqual({
      status: 'ok',
      notOnDiscogs: true,
    });
    expect(JSON.stringify(spine(id))).toBe(marked);
  });

  it('unmarking an unmarked spine is ok and writes nothing', async () => {
    const { spineIds } = await orphanScenario();
    const id = spineIds[0];
    vi.useFakeTimers({ toFake: ['Date'] });
    const row = JSON.stringify(spine(id));
    tick();
    expect(setNotOnDiscogs(db(), id, false)).toEqual({
      status: 'ok',
      notOnDiscogs: false,
    });
    expect(JSON.stringify(spine(id))).toBe(row);
  });

  it('an orphaned spine can be marked', async () => {
    const { orphanId } = await orphanScenario();
    expect(setNotOnDiscogs(db(), orphanId, true).status).toBe('ok');
    expect(spine(orphanId).not_on_discogs).toBe(1);
  });

  it('a dismissed spine is not_markable, both ways', async () => {
    const { orphanId } = await orphanScenario();
    db()
      .prepare(`UPDATE spines SET state = 'dismissed' WHERE id = ?`)
      .run(orphanId);
    expect(setNotOnDiscogs(db(), orphanId, true)).toEqual({
      status: 'not_markable',
    });
    expect(setNotOnDiscogs(db(), orphanId, false)).toEqual({
      status: 'not_markable',
    });
    expect(spine(orphanId).not_on_discogs).toBe(0);
  });

  it('a spine whose import failed can be marked', async () => {
    const { spineIds } = await orphanScenario();
    const id = spineIds[0];
    seedImport(id, 'failed');
    expect(setNotOnDiscogs(db(), id, true).status).toBe('ok');
    expect(spine(id).not_on_discogs).toBe(1);
  });
});
