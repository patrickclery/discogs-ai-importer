import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bulkShelf,
  connectDiscogs,
  jobCtx,
  seedTopCandidate,
  useBulkSecrets,
} from '../../../../../test/helpers/bulk-seed';
import { useTempDataDir } from '../../../../../test/helpers/temp-data-dir';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

import { RESOLVE_PRESSING_JOB_TYPE, startBulkRun } from '@/server/bulk/store';
import { getDb } from '@/server/db/client';
import { markAuthInvalid } from '@/server/discogs/auth';
import { createImport } from '@/server/imports/store';
import { runResolvePressing } from '@/server/jobs/handlers/resolve-pressing';
import { claimNext, complete } from '@/server/jobs/queue';
import { POST } from './route';

// POST /api/spines/bulk-import (D-07, D-08, BULK-05, T-06-15..17): the
// owner's picks are re-checked on the server, one run starts, and the
// queued resolve jobs carry it to imports. The route itself never calls
// Discogs.

type Pick = { spineId: string; candidateId: string };

function db() {
  return getDb().$client;
}

function start(body: unknown, contentType = 'application/json') {
  return POST(
    new Request('http://127.0.0.1:3001/api/spines/bulk-import', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

async function errorOf(
  res: Response,
): Promise<{ error: string; message: string }> {
  return (await res.json()) as { error: string; message: string };
}

function count(table: string, where = '1 = 1'): number {
  return (
    db().prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get() as {
      n: number;
    }
  ).n;
}

/** Spines with a Canadian top match (no versions lookup needed). */
async function shelfWithPicks(n: number): Promise<{
  spineIds: string[];
  picks: Pick[];
}> {
  const { spineIds } = await bulkShelf();
  connectDiscogs();
  const picks = spineIds.slice(0, n).map((spineId, i) => ({
    spineId,
    candidateId: seedTopCandidate(spineId, {
      releaseId: 6000 + i,
      country: 'Canada',
    }).candidateId,
  }));
  return { spineIds, picks };
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe('POST /api/spines/bulk-import', () => {
  useTempDataDir();
  useBulkSecrets();

  it('starts one run for two eligible picks, and its jobs end in two pending imports', async () => {
    const { picks } = await shelfWithPicks(2);
    const res = await start({ items: picks });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      runId: string;
      started: number;
      skipped: number;
    };
    expect(body).toEqual({ runId: expect.any(String), started: 2, skipped: 0 });
    expect(
      db().prepare('SELECT id, total, country FROM bulk_runs').all(),
    ).toEqual([{ id: body.runId, total: 2, country: 'Canada' }]);
    expect(count('jobs', `type = '${RESOLVE_PRESSING_JOB_TYPE}'`)).toBe(2);
    expect(count('imports')).toBe(0);

    // Run the queued lookups the way the worker would.
    const later = Date.now() + 60_000;
    let ran = 0;
    for (let guard = 0; guard < 10 && ran < 2; guard++) {
      const job = claimNext('discogs', later);
      if (!job) break;
      if (job.type !== RESOLVE_PRESSING_JOB_TYPE) continue;
      await runResolvePressing(JSON.parse(job.payload), jobCtx(job));
      complete(job.id);
      ran++;
    }
    expect(ran).toBe(2);
    expect(count('imports', `status = 'pending'`)).toBe(2);
    expect(
      (
        db()
          .prepare('SELECT spine_id FROM imports ORDER BY spine_id')
          .all() as {
          spine_id: string;
        }[]
      ).map((r) => r.spine_id),
    ).toEqual(picks.map((p) => p.spineId).sort());
  });

  it('415 for a non-JSON content type and 400 for bodies the schema refuses; nothing is written', async () => {
    const { picks } = await shelfWithPicks(1);
    expect((await start({ items: picks }, 'text/plain')).status).toBe(415);
    const notJson = await start('{nope');
    expect(notJson.status).toBe(400);
    expect((await errorOf(notJson)).error).toBe('invalid_body');
    const bad = [
      { items: [{ ...picks[0], releaseId: 1 }] },
      { items: [] },
      { items: Array.from({ length: 2001 }, () => picks[0]) },
      { items: picks, country: 'US' },
      { items: [{ spineId: 'x'.repeat(41), candidateId: 'c' }] },
    ];
    for (const body of bad) {
      const res = await start(body);
      expect(res.status).toBe(400);
      expect((await errorOf(res)).error).toBe('invalid_body');
    }
    expect(count('bulk_runs')).toBe(0);
    expect(count('bulk_items')).toBe(0);
  });

  it('409 not_connected while signed out, and asks for a reconnect when the sign-in was refused', async () => {
    const { spineIds } = await bulkShelf();
    const { candidateId } = seedTopCandidate(spineIds[0]);
    const items = [{ spineId: spineIds[0], candidateId }];
    const out = await start({ items });
    expect(out.status).toBe(409);
    expect(await errorOf(out)).toEqual({
      error: 'not_connected',
      message: 'Connect Discogs in Settings first',
    });
    connectDiscogs();
    markAuthInvalid();
    const refused = await start({ items });
    expect(refused.status).toBe(409);
    expect(await errorOf(refused)).toEqual({
      error: 'not_connected',
      message: 'Reconnect Discogs in Settings first',
    });
    expect(count('bulk_runs')).toBe(0);
  });

  it('409 bulk_running while a lookup from an earlier run is still queued', async () => {
    const { picks } = await shelfWithPicks(2);
    const first = startBulkRun(db(), {
      items: [picks[0]],
      country: 'Canada',
      folderId: 1,
    });
    expect(first.status).toBe('ok');
    const res = await start({ items: [picks[1]] });
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toEqual({
      error: 'bulk_running',
      message: 'Wait for the current bulk import to finish',
    });
    expect(count('bulk_runs')).toBe(1);
    expect(count('bulk_items')).toBe(1);
  });

  it('skips picks that changed: a stale top match, an imported, an orphaned and an unknown spine, and a repeat', async () => {
    const { spineIds, picks } = await shelfWithPicks(5);
    // [1]: a newer search put another candidate on top.
    seedTopCandidate(spineIds[1], { releaseId: 7001, country: 'Canada' });
    // [2]: already imported.
    const imp = createImport(db(), picks[2]);
    if (imp.status !== 'ok') throw new Error(imp.status);
    db()
      .prepare(`UPDATE imports SET status = 'imported' WHERE id = ?`)
      .run(imp.importId);
    db().prepare(`UPDATE jobs SET status = 'done' WHERE id = ?`).run(imp.jobId);
    // [3]: orphaned by a re-scan.
    db()
      .prepare(`UPDATE spines SET state = 'orphaned' WHERE id = ?`)
      .run(spineIds[3]);
    const res = await start({
      items: [
        picks[0],
        picks[1],
        picks[2],
        picks[3],
        { spineId: 'no-such-spine', candidateId: picks[4].candidateId },
        picks[4],
        picks[4],
      ],
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      runId: expect.any(String),
      started: 2,
      skipped: 5,
    });
    expect(
      (
        db().prepare('SELECT spine_id FROM bulk_items').all() as {
          spine_id: string;
        }[]
      )
        .map((r) => r.spine_id)
        .sort(),
    ).toEqual([spineIds[0], spineIds[4]].sort());
  });

  it('409 nothing_to_import when every pick is skipped, and no run row is written', async () => {
    const { spineIds, picks } = await shelfWithPicks(1);
    seedTopCandidate(spineIds[0], { releaseId: 7001, country: 'Canada' });
    const res = await start({
      items: [picks[0], { spineId: 'gone', candidateId: 'gone' }],
    });
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toEqual({
      error: 'nothing_to_import',
      message: 'None of the picked spines can be imported now',
    });
    expect(count('bulk_runs')).toBe(0);
    expect(count('bulk_items')).toBe(0);
    expect(count('jobs', `type = '${RESOLVE_PRESSING_JOB_TYPE}'`)).toBe(0);
  });

  it('accepts a spine whose import failed (D-20) and a low-confidence spine (D-16)', async () => {
    const { spineIds, picks } = await shelfWithPicks(2);
    const imp = createImport(db(), picks[0]);
    if (imp.status !== 'ok') throw new Error(imp.status);
    db()
      .prepare(`UPDATE jobs SET status = 'failed' WHERE id = ?`)
      .run(imp.jobId);
    db()
      .prepare(
        `UPDATE imports SET status = 'failed', error_kind = 'unavailable',
           error = 'Discogs answered 502' WHERE id = ?`,
      )
      .run(imp.importId);
    db()
      .prepare(`UPDATE spine_fields SET confidence = 0.05 WHERE spine_id = ?`)
      .run(spineIds[1]);
    const res = await start({ items: picks });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ started: 2, skipped: 0 });
  });
});
