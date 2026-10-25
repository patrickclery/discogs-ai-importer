import { describe, expect, it } from 'vitest';
import {
  bulkShelf,
  seedTopCandidate,
  useBulkSecrets,
} from '../../../test/helpers/bulk-seed';
import { foreignCandidate } from '../../../test/helpers/scan-runs';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';
import { getDb } from '../db/client';
import { newId } from '../ids';
import { getSpines } from '../scan/queries';
import { latestBulkRun } from './queries';
import {
  type BulkItemDbRow,
  failBulkItem,
  resolveBulkItem,
  skipBulkItem,
  startBulkRun,
} from './store';

// The bulk half of the /spines read model (D-06, D-15, BULK-04, BULK-10):
// each spine's current bulk item and the latest run's summary. Runs start
// through startBulkRun; outcomes are written with the store's helpers or
// direct SQL, never through a live lookup.

function db() {
  return getDb().$client;
}

/** A scanned shelf with two spines that have a top match, run started. */
async function startedShelf() {
  const shelf = await bulkShelf();
  const [s0, s1] = shelf.spineIds;
  const a = seedTopCandidate(s0);
  const b = seedTopCandidate(s1, { releaseId: 5002 });
  const res = startBulkRun(db(), {
    items: [
      { spineId: s0, candidateId: a.candidateId },
      { spineId: s1, candidateId: b.candidateId },
    ],
    country: 'Canada',
    folderId: 1,
  });
  if (res.status !== 'ok') throw new Error('run did not start');
  return { ...shelf, s0, s1, runId: res.runId };
}

function itemOf(spineId: string): BulkItemDbRow {
  const row = db()
    .prepare(
      'SELECT * FROM bulk_items WHERE spine_id = ? ORDER BY created_at DESC',
    )
    .get(spineId) as BulkItemDbRow | undefined;
  if (!row) throw new Error(`no item for ${spineId}`);
  return row;
}

/** An imports row for the spine; returns its id. */
function seedImport(
  spineId: string,
  status: string,
  opts: { createdAt?: number; instanceId?: number } = {},
): string {
  const id = newId();
  const at = opts.createdAt ?? Date.now();
  db()
    .prepare(
      `INSERT INTO imports (id, spine_id, release_id, folder_id, status,
         linked, instance_id, job_id, created_at, updated_at)
       VALUES (@id, @spineId, 5001, 1, @status, 0, @instanceId, NULL, @at,
         @at)`,
    )
    .run({ id, spineId, status, instanceId: opts.instanceId ?? null, at });
  return id;
}

function spineOf(spineId: string) {
  const s = getSpines().spines.find((x) => x.id === spineId);
  if (!s) throw new Error(`spine ${spineId} not listed`);
  return s;
}

describe('getSpines bulk run summary', () => {
  useTempDataDir();
  useBulkSecrets();

  it('response.bulk is null before any run and running right after startBulkRun', async () => {
    const shelf = await bulkShelf();
    seedTopCandidate(shelf.spineIds[0]);
    expect(getSpines().bulk).toBeNull();
    expect(latestBulkRun(db())).toBeNull();
  });

  it('two started picks read total 2, done 0, running, country Canada', async () => {
    const { runId } = await startedShelf();
    expect(getSpines().bulk).toMatchObject({
      id: runId,
      country: 'Canada',
      folderName: 'Uncategorized',
      total: 2,
      done: 0,
      running: true,
    });
  });

  it('a resolved item whose import is imported counts added and done', async () => {
    const { s0 } = await startedShelf();
    const importId = seedImport(s0, 'imported', { instanceId: 77 });
    resolveBulkItem(db(), itemOf(s0).id, {
      importId,
      releaseId: 5001,
      country: 'Canada',
      outcome: 'preferred',
    });
    expect(getSpines().bulk).toMatchObject({
      total: 2,
      done: 1,
      added: 1,
      fallbacks: 0,
      running: true,
    });
  });

  it('a skipped duplicate counts duplicates and a failed item counts failed', async () => {
    const { s0, s1 } = await startedShelf();
    skipBulkItem(db(), itemOf(s0).id, { reason: 'duplicate', dupSpineId: s1 });
    failBulkItem(db(), itemOf(s1).id, {
      errorKind: 'unavailable',
      error: null,
    });
    expect(getSpines().bulk).toMatchObject({
      total: 2,
      done: 2,
      duplicates: 1,
      failed: 1,
      running: false,
    });
  });

  it('a resolved item whose import row is gone counts changed', async () => {
    const { s0 } = await startedShelf();
    resolveBulkItem(db(), itemOf(s0).id, {
      importId: 'gone',
      releaseId: 5001,
      country: 'US',
      outcome: 'fallback_no_version',
    });
    expect(getSpines().bulk).toMatchObject({ done: 1, changed: 1 });
  });

  it('a queued item whose job failed counts failed and done', async () => {
    const { s0 } = await startedShelf();
    db()
      .prepare(`UPDATE jobs SET status = 'failed' WHERE id = ?`)
      .run(itemOf(s0).job_id);
    expect(getSpines().bulk).toMatchObject({ done: 1, failed: 1 });
  });
});

describe('getSpines spine.bulk', () => {
  useTempDataDir();
  useBulkSecrets();

  it('each picked spine reads finding and is not selectable', async () => {
    const { s0, s1, runId } = await startedShelf();
    for (const id of [s0, s1]) {
      const b = spineOf(id).bulk;
      expect(b).toMatchObject({ eligible: false, reason: 'finding' });
      expect(b?.item).toMatchObject({
        runId,
        phase: 'finding',
        preferredCountry: 'Canada',
        failure: null,
        skip: null,
      });
    }
  });

  it('a spine with a top match and no run is selectable with no item', async () => {
    const shelf = await bulkShelf();
    seedTopCandidate(shelf.spineIds[0]);
    expect(spineOf(shelf.spineIds[0]).bulk).toEqual({
      eligible: true,
      reason: null,
      item: null,
    });
  });

  it('a resolved item carries its release, country and import', async () => {
    const { s0 } = await startedShelf();
    const importId = seedImport(s0, 'imported', { instanceId: 77 });
    resolveBulkItem(db(), itemOf(s0).id, {
      importId,
      releaseId: 5009,
      country: 'Canada',
      outcome: 'preferred',
    });
    expect(spineOf(s0).bulk?.item).toMatchObject({
      phase: 'resolved',
      releaseId: 5009,
      country: 'Canada',
      importId,
      outcome: 'preferred',
    });
  });

  it('a queued item whose job failed or was cancelled reads failed, interrupted', async () => {
    const { s0, s1 } = await startedShelf();
    db()
      .prepare(`UPDATE jobs SET status = 'failed' WHERE id = ?`)
      .run(itemOf(s0).job_id);
    db()
      .prepare(`UPDATE jobs SET status = 'cancelled' WHERE id = ?`)
      .run(itemOf(s1).job_id);
    for (const id of [s0, s1]) {
      expect(spineOf(id).bulk?.item).toMatchObject({
        phase: 'failed',
        failure: { kind: 'interrupted', reason: null },
      });
    }
  });

  it('a dead-job item keeps a recorded error kind', async () => {
    const { s0 } = await startedShelf();
    db()
      .prepare(
        `UPDATE bulk_items SET error_kind = 'unavailable', error = 'down'
         WHERE spine_id = ?`,
      )
      .run(s0);
    db()
      .prepare(`UPDATE jobs SET status = 'failed' WHERE id = ?`)
      .run(itemOf(s0).job_id);
    expect(spineOf(s0).bulk?.item?.failure).toEqual({
      kind: 'unavailable',
      reason: null,
    });
  });

  it('kind other carries its reason cut to 160 code points; other kinds none', async () => {
    const { s0, s1 } = await startedShelf();
    failBulkItem(db(), itemOf(s0).id, { errorKind: 'other', error: 'x' });
    db()
      .prepare('UPDATE bulk_items SET error = ? WHERE spine_id = ?')
      .run('é'.repeat(200), s0);
    failBulkItem(db(), itemOf(s1).id, {
      errorKind: 'rejected',
      error: 'HTTP 422',
    });
    const reason = spineOf(s0).bulk?.item?.failure?.reason ?? '';
    expect(spineOf(s0).bulk?.item?.failure?.kind).toBe('other');
    expect([...reason].length).toBe(160);
    expect(spineOf(s1).bulk?.item?.failure).toEqual({
      kind: 'rejected',
      reason: null,
    });
  });

  it('an unknown stored error kind reads as other', async () => {
    const { s0 } = await startedShelf();
    failBulkItem(db(), itemOf(s0).id, { errorKind: 'other', error: 'boom' });
    db()
      .prepare(`UPDATE bulk_items SET error_kind = 'weird' WHERE spine_id = ?`)
      .run(s0);
    expect(spineOf(s0).bulk?.item?.failure).toEqual({
      kind: 'other',
      reason: 'boom',
    });
  });

  it('an item older than a newer manual import is not current', async () => {
    const { s0 } = await startedShelf();
    const item = itemOf(s0);
    failBulkItem(db(), item.id, { errorKind: 'unavailable', error: null });
    seedImport(s0, 'imported', {
      createdAt: item.created_at + 10,
      instanceId: 5,
    });
    expect(spineOf(s0).bulk).toEqual({
      eligible: false,
      reason: 'imported',
      item: null,
    });
  });

  it('a skipped duplicate names the holder on the same photo', async () => {
    const { s0, s1 } = await startedShelf();
    skipBulkItem(db(), itemOf(s0).id, { reason: 'duplicate', dupSpineId: s1 });
    const holder = spineOf(s1);
    expect(spineOf(s0).bulk).toMatchObject({
      eligible: false,
      reason: 'skipped_duplicate',
      item: {
        phase: 'skipped',
        skip: {
          reason: 'duplicate',
          photo: 'shelf.jpg',
          spineNumber: holder.index + 1,
          samePhoto: true,
        },
      },
    });
  });

  it('a holder on another photo is not samePhoto; a missing holder names nothing', async () => {
    const { s0, s1 } = await startedShelf();
    const other = await foreignCandidate();
    skipBulkItem(db(), itemOf(s0).id, {
      reason: 'duplicate',
      dupSpineId: other,
    });
    skipBulkItem(db(), itemOf(s1).id, {
      reason: 'duplicate',
      dupSpineId: 'no-such-spine',
    });
    expect(spineOf(s0).bulk?.item?.skip).toMatchObject({
      photo: 'other.jpg',
      samePhoto: false,
    });
    expect(spineOf(s1).bulk?.item?.skip).toEqual({
      reason: 'duplicate',
      photo: null,
      spineNumber: null,
      samePhoto: false,
    });
  });
});
