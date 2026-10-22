import { describe, expect, it } from 'vitest';
import { REVIEW_STATUSES } from '@/lib/import-types';
import {
  foreignCandidate,
  orphanScenario,
} from '../../../test/helpers/scan-runs';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';
import { getDb } from '../db/client';
import { newId } from '../ids';
import { getSpines } from './queries';

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
