import { describe, expect, it } from 'vitest';
import { REVIEW_STATUSES } from '@/lib/import-types';
import {
  bulkShelf,
  seedTopCandidate,
  useBulkSecrets,
} from '../../../test/helpers/bulk-seed';
import {
  foreignCandidate,
  orphanScenario,
} from '../../../test/helpers/scan-runs';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';
import { failBulkItem, resolveBulkItem, startBulkRun } from '../bulk/store';
import { getDb } from '../db/client';
import { newId } from '../ids';
import { setPreferredCountry } from '../settings';
import { getSpines, parseFallbackParam } from './queries';

// The /spines read model (REV-03, D-11, D-12): per-photo progress, counts
// that ignore the status and review filters, list order under every filter,
// the empty case and the polling flag. Photos and spines come from the
// stored-run helpers; imports rows and jobs are seeded with direct SQL.

function db() {
  return getDb().$client;
}

/** A jobs row for an add_to_collection job in `status`. */
function seedJob(status: string): string {
  const id = newId();
  const now = Date.now();
  db()
    .prepare(
      `INSERT INTO jobs (id, lane, type, payload, status, run_after,
         created_at, updated_at)
       VALUES (@id, 'discogs', 'add_to_collection', '{}', @status, @now,
         @now, @now)`,
    )
    .run({ id, status, now });
  return id;
}

/** An imports row for the spine, with its job when `jobStatus` is given. */
function seedImport(
  spineId: string,
  status: string,
  opts: { instanceId?: number; linked?: boolean; jobStatus?: string } = {},
): void {
  const now = Date.now();
  db()
    .prepare(
      `INSERT INTO imports (id, spine_id, release_id, folder_id, status,
         linked, instance_id, job_id, created_at, updated_at)
       VALUES (@id, @spineId, 4242, 1, @status, @linked, @instanceId, @jobId,
         @now, @now)`,
    )
    .run({
      id: newId(),
      spineId,
      status,
      linked: opts.linked ? 1 : 0,
      instanceId: opts.instanceId ?? null,
      jobId: opts.jobStatus ? seedJob(opts.jobStatus) : null,
      now,
    });
}

function markNotOnDiscogs(spineId: string): void {
  db()
    .prepare('UPDATE spines SET not_on_discogs = 1 WHERE id = ?')
    .run(spineId);
}

function dismiss(spineId: string): void {
  db()
    .prepare(`UPDATE spines SET state = 'dismissed' WHERE id = ?`)
    .run(spineId);
}

/** Active and orphaned spines in the database, per photo. */
function listedCount(photoId?: string): number {
  const row = db()
    .prepare(
      `SELECT COUNT(*) AS n FROM spines
       WHERE state IN ('active', 'orphaned')
         AND (@photoId IS NULL OR photo_id = @photoId)`,
    )
    .get({ photoId: photoId ?? null }) as { n: number };
  return row.n;
}

/**
 * The orphan scenario plus a second photo, with spine 0 imported, the
 * orphan linked to an existing copy, spine 1 matched (queued job), spine 2
 * failed, spine 3 marked not on Discogs and the second photo's one spine
 * pending.
 */
async function mixedShelf() {
  const scenario = await orphanScenario();
  const otherSpineId = await foreignCandidate();
  const [s0, s1, s2, s3] = scenario.spineIds;
  seedImport(s0, 'imported', { instanceId: 9001 });
  seedImport(scenario.orphanId, 'imported', { instanceId: 9002, linked: true });
  seedImport(s1, 'pending', { jobStatus: 'queued' });
  seedImport(s2, 'failed');
  markNotOnDiscogs(s3);
  const otherPhotoId = (
    db()
      .prepare('SELECT photo_id FROM spines WHERE id = ?')
      .get(otherSpineId) as {
      photo_id: string;
    }
  ).photo_id;
  return { ...scenario, otherSpineId, otherPhotoId };
}

describe('getSpines photoProgress', () => {
  useTempDataDir();

  it('counts every active and orphaned spine per photo, a linked import as imported', async () => {
    const { photoId, otherPhotoId } = await mixedShelf();
    const { photoProgress } = getSpines();
    expect(photoProgress[photoId]).toEqual({
      imported: 2,
      total: listedCount(photoId),
    });
    expect(photoProgress[otherPhotoId]).toEqual({ imported: 0, total: 1 });
  });

  it('ignores the status and review filters', async () => {
    const { photoId, otherPhotoId } = await mixedShelf();
    const unfiltered = getSpines().photoProgress;
    expect(
      getSpines({ status: 'pending', review: true }).photoProgress,
    ).toEqual(unfiltered);
    expect(getSpines({ status: 'imported' }).photoProgress).toEqual(unfiltered);
    expect(Object.keys(unfiltered).sort()).toEqual(
      [photoId, otherPhotoId].sort(),
    );
  });

  it('covers only the filtered photo under a photo filter', async () => {
    const { photoId } = await mixedShelf();
    expect(Object.keys(getSpines({ photoId }).photoProgress)).toEqual([
      photoId,
    ]);
  });
});

describe('getSpines counts', () => {
  useTempDataDir();

  it('ignore the status and review filters for the same photo filter', async () => {
    const { photoId } = await mixedShelf();
    const plain = getSpines();
    const filtered = getSpines({ status: 'imported', review: true });
    expect(filtered.counts.byStatus).toEqual(plain.counts.byStatus);
    expect(filtered.counts.all).toBe(plain.counts.all);
    expect(
      getSpines({ photoId, status: 'imported', review: true }).counts.byStatus,
    ).toEqual(getSpines({ photoId }).counts.byStatus);
  });

  it('the six status counts sum to counts.all', async () => {
    await mixedShelf();
    const { counts } = getSpines();
    const sum = REVIEW_STATUSES.reduce((n, s) => n + counts.byStatus[s], 0);
    expect(sum).toBe(counts.all);
    expect(counts.byStatus).toEqual({
      pending: counts.all - 5,
      matched: 1,
      imported: 2,
      not_found: 0,
      not_on_discogs: 1,
      failed: 1,
    });
  });

  it('never counts superseded or dismissed spines', async () => {
    const { photoId, supersededId, spineIds } = await mixedShelf();
    dismiss(spineIds[0]);
    const { counts, statusById, photoProgress } = getSpines();
    expect(counts.all).toBe(listedCount());
    expect(statusById[supersededId]).toBeUndefined();
    expect(statusById[spineIds[0]]).toBeUndefined();
    expect(counts.byStatus.imported).toBe(1);
    expect(photoProgress[photoId]).toEqual({
      imported: 1,
      total: listedCount(photoId),
    });
  });
});

describe('getSpines order, empty and polling', () => {
  useTempDataDir();

  it('keeps listed order under a status filter', async () => {
    const { spineIds, orphanId } = await orphanScenario();
    const otherSpineId = await foreignCandidate();
    seedImport(spineIds[1], 'imported', { instanceId: 9101 });
    const listed = getSpines().spines.map((s) => s.id);
    const pending = getSpines({ status: 'pending' }).spines.map((s) => s.id);
    expect(pending).toEqual(listed.filter((id) => id !== spineIds[1]));
    // Newest photo first, then active by detection index, then the orphan.
    const scanPhoto = pending.filter((id) => id !== otherSpineId);
    expect(scanPhoto[scanPhoto.length - 1]).toBe(orphanId);
    expect(scanPhoto.slice(0, 3)).toEqual([
      spineIds[0],
      spineIds[2],
      spineIds[3],
    ]);
    expect(pending.indexOf(otherSpineId)).toBe(
      listed.indexOf(otherSpineId) === 0 ? 0 : pending.length - 1,
    );
  });

  it('gives every count 0 and no statuses without photos', () => {
    for (const opts of [{}, { status: 'failed' as const, review: true }]) {
      const data = getSpines(opts);
      expect(data.photos).toEqual([]);
      expect(data.spines).toEqual([]);
      expect(data.counts.all).toBe(0);
      expect(data.counts.needsReview).toBe(0);
      expect(Object.values(data.counts.byStatus)).toEqual([0, 0, 0, 0, 0, 0]);
      expect(data.statusById).toEqual({});
      expect(data.photoProgress).toEqual({});
      expect(data.discogsActive).toBe(false);
    }
  });

  it('discogsActive is true while an import job is queued or running', async () => {
    const { spineIds } = await orphanScenario();
    seedImport(spineIds[0], 'pending', { jobStatus: 'queued' });
    expect(getSpines().discogsActive).toBe(true);
    db()
      .prepare(
        `UPDATE jobs SET status = 'running'
         WHERE id = (SELECT job_id FROM imports WHERE spine_id = ?)`,
      )
      .run(spineIds[0]);
    expect(getSpines().discogsActive).toBe(true);
    // A filter hiding the spine keeps polling alive.
    expect(getSpines({ status: 'failed' }).discogsActive).toBe(true);
  });

  it('discogsActive is false with only held or failed imports and no active search', async () => {
    const { spineIds } = await orphanScenario();
    seedImport(spineIds[0], 'already_in_collection', {
      jobStatus: 'succeeded',
    });
    seedImport(spineIds[1], 'failed', { jobStatus: 'failed' });
    seedImport(spineIds[2], 'imported', { instanceId: 9201 });
    expect(getSpines().discogsActive).toBe(false);
  });
});

/** A Canada bulk run over the spines, each with its own top match. */
function startRun(spineIds: string[]): void {
  const res = startBulkRun(db(), {
    items: spineIds.map((spineId, i) => ({
      spineId,
      candidateId: seedTopCandidate(spineId, { releaseId: 7000 + i })
        .candidateId,
    })),
    country: 'Canada',
    folderId: 1,
  });
  if (res.status !== 'ok') throw new Error('run did not start');
}

function itemIdOf(spineId: string): string {
  return (
    db()
      .prepare(
        'SELECT id FROM bulk_items WHERE spine_id = ? ORDER BY created_at DESC',
      )
      .get(spineId) as { id: string }
  ).id;
}

/** The spine's bulk item resolved to a release in `country`, imported. */
function bulkImported(spineId: string, country: string | null): void {
  const importId = newId();
  const now = Date.now();
  db()
    .prepare(
      `INSERT INTO imports (id, spine_id, release_id, folder_id, status,
         linked, instance_id, job_id, created_at, updated_at)
       VALUES (@importId, @spineId, 7100, 1, 'imported', 0, 31, NULL, @now,
         @now)`,
    )
    .run({ importId, spineId, now });
  resolveBulkItem(db(), itemIdOf(spineId), {
    importId,
    releaseId: 7100,
    country,
    outcome: country === 'US' ? 'fallback_no_version' : 'preferred',
  });
}

describe('parseFallbackParam (T-06-12)', () => {
  it("only the exact value '1' turns the filter on", () => {
    expect(parseFallbackParam('1')).toBe(true);
    for (const v of ['0', 'true', '', ' 1', null, undefined]) {
      expect(parseFallbackParam(v)).toBe(false);
    }
  });
});

describe('getSpines bulk lookups and the Fallback filter', () => {
  useTempDataDir();
  useBulkSecrets();

  it('a spine whose lookup runs reads matched; a failed lookup reads failed', async () => {
    const { spineIds } = await bulkShelf();
    const [s0, s1] = spineIds;
    seedImport(s0, 'failed');
    startRun([s0, s1]);
    const r = getSpines();
    expect(r.statusById[s0]).toBe('matched');
    expect(r.statusById[s1]).toBe('matched');
    failBulkItem(db(), itemIdOf(s1), { errorKind: 'unavailable', error: null });
    expect(getSpines().statusById[s1]).toBe('failed');
  });

  it('discogsActive is true with one finding item and no import', async () => {
    const { spineIds } = await bulkShelf();
    seedTopCandidate(spineIds[0]);
    expect(getSpines().discogsActive).toBe(false);
    startRun([spineIds[0]]);
    const r = getSpines();
    expect(r.spines.find((s) => s.id === spineIds[0])?.import).toBeNull();
    expect(r.discogsActive).toBe(true);
  });

  it('discogsActive stays true while the latest run runs, even for a spine the photo filter hides', async () => {
    const { spineIds } = await bulkShelf();
    const otherSpine = await foreignCandidate();
    const otherPhotoId = (
      db()
        .prepare('SELECT photo_id FROM spines WHERE id = ?')
        .get(otherSpine) as {
        photo_id: string;
      }
    ).photo_id;
    startRun([spineIds[0]]);
    expect(getSpines({ photoId: otherPhotoId }).discogsActive).toBe(true);
    failBulkItem(db(), itemIdOf(spineIds[0]), {
      errorKind: 'unavailable',
      error: null,
    });
    expect(getSpines({ photoId: otherPhotoId }).discogsActive).toBe(false);
  });

  it('?fallback=1 lists only fallback spines; USA & Canada is not one (D-19)', async () => {
    const { spineIds } = await bulkShelf();
    const [s0, s1, s2, s3] = spineIds;
    startRun([s0, s1, s2, s3]);
    bulkImported(s0, 'US');
    bulkImported(s1, 'USA & Canada');
    bulkImported(s2, 'Canada');
    bulkImported(s3, null);
    const r = getSpines({ fallback: true });
    expect(r.spines.map((s) => s.id)).toEqual([s0, s3]);
    expect(r.counts.fallback).toBe(2);
    expect(r.counts).toEqual(getSpines().counts);
  });

  it('fallback ANDs with status, review and photo; its count covers the photo filter only', async () => {
    const { photoId, spineIds } = await bulkShelf();
    const otherSpine = await foreignCandidate();
    const otherPhotoId = (
      db()
        .prepare('SELECT photo_id FROM spines WHERE id = ?')
        .get(otherSpine) as {
        photo_id: string;
      }
    ).photo_id;
    startRun([spineIds[0]]);
    bulkImported(spineIds[0], 'US');
    expect(
      getSpines({ fallback: true, status: 'imported' }).spines.map((s) => s.id),
    ).toEqual([spineIds[0]]);
    const pending = getSpines({ fallback: true, status: 'pending' });
    expect(pending.spines).toEqual([]);
    expect(pending.photos).toEqual([]);
    expect(pending.counts.fallback).toBe(1);
    expect(getSpines({ fallback: true, review: true }).counts.fallback).toBe(1);
    expect(
      getSpines({ fallback: true, photoId }).photos.map((p) => p.id),
    ).toEqual([photoId]);
    const other = getSpines({ fallback: true, photoId: otherPhotoId });
    expect(other.spines).toEqual([]);
    expect(other.counts.fallback).toBe(0);
  });

  it('a later manual import of a fallback spine leaves the Fallback filter', async () => {
    const { spineIds } = await bulkShelf();
    startRun([spineIds[0]]);
    bulkImported(spineIds[0], 'US');
    seedImport(spineIds[0], 'imported', { instanceId: 44 });
    db()
      .prepare(
        'UPDATE imports SET created_at = created_at + 1000 WHERE release_id = 4242',
      )
      .run();
    expect(getSpines({ fallback: true }).spines).toEqual([]);
    expect(getSpines().counts.fallback).toBe(0);
  });

  it('the response names the preferred country', async () => {
    await bulkShelf();
    expect(getSpines().discogs.preferredCountry).toBe('Canada');
    setPreferredCountry('germany');
    expect(getSpines().discogs.preferredCountry).toBe('Germany');
  });
});
