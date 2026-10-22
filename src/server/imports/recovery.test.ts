import { describe, expect, it } from 'vitest';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';
import { getDb } from '../db/client';
import { markInterruptedImports } from './recovery';

// markInterruptedImports (RESEARCH Pitfall 4, T-04-11): when the worker
// gives up on an add_to_collection job (its final attempt failed, or
// recovery failed it after a crash on the final attempt), the import it was
// running must not stay pending or importing. One UPDATE, no network call.

const INTERRUPTED =
  'The import was interrupted when the app stopped. Retry checks your collection first, so it never adds a second copy.';

let seq = 0;

function seedSpine(): string {
  const db = getDb().$client;
  const now = Date.now();
  const id = `spine-${++seq}`;
  db.prepare(
    `INSERT OR IGNORE INTO photos (id, sha256, original_name, mime, bytes,
       original_path, created_at, updated_at)
     VALUES ('photo-1', 'abc', 'shelf.jpg', 'image/jpeg', 1, 'photos/x.jpg', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO spines (id, photo_id, state, created_at, updated_at)
     VALUES (?, 'photo-1', 'active', ?, ?)`,
  ).run(id, now, now);
  return id;
}

function seedJob(status: string): string {
  const id = `job-${++seq}`;
  const now = Date.now();
  getDb()
    .$client.prepare(
      `INSERT INTO jobs (id, lane, type, payload, status, attempts,
         max_attempts, run_after, created_at, updated_at)
       VALUES (?, 'discogs', 'add_to_collection', '{}', ?, 3, 3, ?, ?, ?)`,
    )
    .run(id, status, now, now, now);
  return id;
}

function seedImport(opts: {
  status: string;
  jobId: string | null;
  errorKind?: string | null;
  error?: string | null;
  instanceId?: number | null;
}): string {
  const id = `imp-${++seq}`;
  const now = Date.now() - 60_000;
  getDb()
    .$client.prepare(
      `INSERT INTO imports (id, spine_id, release_id, folder_id, status,
         instance_id, error_kind, error, job_id, created_at, updated_at)
       VALUES (@id, @spineId, 1031, 1, @status, @instanceId, @errorKind,
         @error, @jobId, @now, @now)`,
    )
    .run({
      id,
      spineId: seedSpine(),
      status: opts.status,
      instanceId: opts.instanceId ?? null,
      errorKind: opts.errorKind ?? null,
      error: opts.error ?? null,
      jobId: opts.jobId,
      now,
    });
  return id;
}

type Row = {
  status: string;
  error_kind: string | null;
  error: string | null;
  updated_at: number;
};

function row(id: string): Row {
  return getDb()
    .$client.prepare(
      'SELECT status, error_kind, error, updated_at FROM imports WHERE id = ?',
    )
    .get(id) as Row;
}

describe('markInterruptedImports', () => {
  useTempDataDir();

  it.each([
    ['pending', 'failed'],
    ['importing', 'failed'],
    ['pending', 'cancelled'],
    ['importing', 'cancelled'],
  ])(
    'a %s import whose job is %s becomes failed with interrupted',
    (status, jobStatus) => {
      const id = seedImport({ status, jobId: seedJob(jobStatus) });
      const before = row(id).updated_at;
      expect(markInterruptedImports()).toEqual({ failed: 1 });
      const after = row(id);
      expect(after).toMatchObject({
        status: 'failed',
        error_kind: 'interrupted',
        error: INTERRUPTED,
      });
      expect(after.updated_at).toBeGreaterThan(before);
    },
  );

  it('keeps an error kind and reason an earlier attempt recorded', () => {
    const id = seedImport({
      status: 'importing',
      jobId: seedJob('failed'),
      errorKind: 'unavailable',
      error:
        'Discogs POST /users/:u/collection/folders/1/releases/1031 answered 502',
    });
    markInterruptedImports();
    expect(row(id)).toMatchObject({
      status: 'failed',
      error_kind: 'unavailable',
      error:
        'Discogs POST /users/:u/collection/folders/1/releases/1031 answered 502',
    });
  });

  it.each(['queued', 'running', 'succeeded'])(
    'leaves an import whose job is %s untouched',
    (jobStatus) => {
      const id = seedImport({ status: 'importing', jobId: seedJob(jobStatus) });
      const before = row(id);
      expect(markInterruptedImports()).toEqual({ failed: 0 });
      expect(row(id)).toEqual(before);
    },
  );

  it.each(['imported', 'already_in_collection', 'failed'])(
    'leaves a %s import untouched even when its job failed',
    (status) => {
      const id = seedImport({
        status,
        jobId: seedJob('failed'),
        instanceId: status === 'imported' ? 7001 : null,
      });
      const before = row(id);
      expect(markInterruptedImports()).toEqual({ failed: 0 });
      expect(row(id)).toEqual(before);
    },
  );

  it('a second run changes nothing', () => {
    const a = seedImport({ status: 'importing', jobId: seedJob('failed') });
    const b = seedImport({ status: 'pending', jobId: seedJob('queued') });
    expect(markInterruptedImports()).toEqual({ failed: 1 });
    const first = [row(a), row(b)];
    expect(markInterruptedImports()).toEqual({ failed: 0 });
    expect([row(a), row(b)]).toEqual(first);
  });
});
