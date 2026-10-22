import 'server-only';
import type Database from 'better-sqlite3';
import type { CandidateFormat } from '@/lib/discogs-types';
import type { ImportCandidateSnapshot, ImportStatus } from '@/lib/import-types';
import { getCollectionFolderId } from '../discogs/folders';
import { newId } from '../ids';
import { enqueue, releaseDedupeKey } from '../jobs/queue';

// Imports (D-01, D-03, D-07, D-08). createImport is the only path that
// creates an import and the only place add_to_collection is enqueued: the
// confirm route (POST /api/spines/{id}/import) is its only caller (IMP-01).
// The release id always comes from the spine's own candidate row, never from
// the request (T-04-02). Raw SQL with @named parameters; better-sqlite3 is
// built with DQS=0, so string literals are single-quoted.

export const ADD_TO_COLLECTION_JOB_TYPE = 'add_to_collection';

export type CreateImportResult =
  | { status: 'ok'; importId: string; jobId: string }
  | { status: 'not_found' }
  | { status: 'not_importable' }
  | { status: 'not_on_discogs' }
  | { status: 'already_confirmed' }
  | { status: 'no_candidate' };

export type ImportDbRow = {
  id: string;
  spine_id: string;
  candidate_id: string | null;
  release_id: number;
  folder_id: number;
  status: ImportStatus;
  allow_duplicate: number;
  adopted: number;
  linked: number;
  instance_id: number | null;
  intent_at: number | null;
  snapshot_json: string | null;
  existing_json: string | null;
  candidate_json: string | null;
  post_count: number;
  error_kind: string | null;
  error: string | null;
  job_id: string | null;
  created_at: number;
  updated_at: number;
  imported_at: number | null;
};

type CandidateRow = {
  release_id: number;
  title: string;
  year: number | null;
  country: string | null;
  labels_json: string;
  catno: string | null;
  formats_json: string;
};

function jsonArray(json: string): unknown[] {
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function snapshotOf(c: CandidateRow): ImportCandidateSnapshot {
  const formats: CandidateFormat[] = [];
  for (const f of jsonArray(c.formats_json)) {
    if (!f || typeof f !== 'object') continue;
    const o = f as Record<string, unknown>;
    if (typeof o.name !== 'string') continue;
    formats.push({
      name: o.name,
      qty: typeof o.qty === 'string' ? o.qty : null,
      descriptions: Array.isArray(o.descriptions)
        ? o.descriptions.filter((d): d is string => typeof d === 'string')
        : [],
      text: typeof o.text === 'string' ? o.text : null,
    });
  }
  return {
    title: c.title,
    year: c.year,
    country: c.country,
    labels: jsonArray(c.labels_json).filter(
      (x): x is string => typeof x === 'string',
    ),
    catno: c.catno,
    formats,
  };
}

function isUniqueViolation(err: unknown, index: string): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  if (e?.code !== 'SQLITE_CONSTRAINT_UNIQUE') return false;
  // SQLite names the columns of a violated index, not the index itself.
  return typeof e.message === 'string' && e.message.includes(index);
}

export function getImport(
  db: Database.Database,
  id: string,
): ImportDbRow | undefined {
  return db.prepare('SELECT * FROM imports WHERE id = @id').get({ id }) as
    | ImportDbRow
    | undefined;
}

/**
 * Confirms one candidate of one spine (D-01): checks, in order, that the
 * spine exists, is active or orphaned, is not marked not on Discogs, has no
 * non-failed import, and lists that candidate; then writes the pending
 * import and its add_to_collection job. One IMMEDIATE transaction, so two
 * confirms sent at once cannot both pass; the partial unique index
 * imports_spine_open_idx is the race-proof backstop (D-08, Pitfall 8).
 */
export function createImport(
  db: Database.Database,
  input: { spineId: string; candidateId: string },
): CreateImportResult {
  const tx = db.transaction((): CreateImportResult => {
    const spine = db
      .prepare('SELECT state, not_on_discogs FROM spines WHERE id = @spineId')
      .get({ spineId: input.spineId }) as
      | { state: string; not_on_discogs: number }
      | undefined;
    if (!spine) return { status: 'not_found' };
    if (spine.state !== 'active' && spine.state !== 'orphaned') {
      return { status: 'not_importable' };
    }
    if (spine.not_on_discogs === 1) return { status: 'not_on_discogs' };
    const open = db
      .prepare(
        `SELECT 1 FROM imports WHERE spine_id = @spineId AND status <> 'failed'`,
      )
      .get({ spineId: input.spineId });
    if (open) return { status: 'already_confirmed' };
    const candidate = db
      .prepare(
        `SELECT release_id, title, year, country, labels_json, catno, formats_json
         FROM discogs_candidates WHERE id = @candidateId AND spine_id = @spineId`,
      )
      .get({ candidateId: input.candidateId, spineId: input.spineId }) as
      | CandidateRow
      | undefined;
    if (!candidate) return { status: 'no_candidate' };

    const now = Date.now();
    const importId = newId();
    db.prepare(
      `INSERT INTO imports (id, spine_id, candidate_id, release_id, folder_id,
         status, candidate_json, created_at, updated_at)
       VALUES (@id, @spineId, @candidateId, @releaseId, @folderId,
         'pending', @candidateJson, @now, @now)`,
    ).run({
      id: importId,
      spineId: input.spineId,
      candidateId: input.candidateId,
      releaseId: candidate.release_id,
      folderId: getCollectionFolderId(),
      candidateJson: JSON.stringify(snapshotOf(candidate)),
      now,
    });
    const job = enqueueImport(db, importId);
    return { status: 'ok', importId, jobId: job.id };
  });
  try {
    return tx.immediate();
  } catch (err) {
    if (isUniqueViolation(err, 'imports.spine_id')) {
      return { status: 'already_confirmed' };
    }
    throw err;
  }
}

/**
 * Queues the import's add_to_collection job under the dedupe key
 * import:{spineId}:{releaseId}. A job with that key that is queued or
 * running is reused; a finished one gives up its key first, so a retry or
 * "Add another copy" is never a silent no-op (RESEARCH Pitfall 3). Sets
 * imports.job_id. Call inside an IMMEDIATE transaction; on its own it opens
 * one (nested, it becomes a savepoint).
 */
export function enqueueImport(
  db: Database.Database,
  importId: string,
): { id: string; created: boolean } {
  const tx = db.transaction(() => {
    const row = db
      .prepare('SELECT spine_id, release_id FROM imports WHERE id = @importId')
      .get({ importId }) as
      | { spine_id: string; release_id: number }
      | undefined;
    if (!row) throw new Error(`enqueueImport: import ${importId} not found`);
    const dedupeKey = `import:${row.spine_id}:${row.release_id}`;
    const holder = db
      .prepare('SELECT id, status FROM jobs WHERE dedupe_key = @dedupeKey')
      .get({ dedupeKey }) as { id: string; status: string } | undefined;
    let job: { id: string; created: boolean };
    if (holder && (holder.status === 'queued' || holder.status === 'running')) {
      job = { id: holder.id, created: false };
    } else {
      if (holder) releaseDedupeKey(holder.id);
      job = enqueue({
        lane: 'discogs',
        type: ADD_TO_COLLECTION_JOB_TYPE,
        payload: { importId },
        dedupeKey,
      });
    }
    db.prepare(
      'UPDATE imports SET job_id = @jobId, updated_at = @now WHERE id = @importId',
    ).run({ jobId: job.id, now: Date.now(), importId });
    return job;
  });
  return tx.immediate();
}
