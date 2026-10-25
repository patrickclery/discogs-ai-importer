import 'server-only';
import { z } from 'zod';
import type { CandidateFormat } from '@/lib/discogs-types';
import {
  choosePressing,
  needsLookup,
  type TopMatchLite,
  type VersionLite,
} from '@/lib/pressing';
import {
  getBulkItem,
  getBulkRun,
  resolveBulkItem,
  skipBulkItem,
} from '../../bulk/store';
import { getDb } from '../../db/client';
import { type DiscogsFetchDeps, discogsFetch } from '../../discogs/client';
import { upsertPressingCandidate } from '../../discogs/store';
import {
  masterVersionsPath,
  parseVersions,
  pressingCandidateValues,
  versionsQuery,
} from '../../discogs/versions';
import {
  type CreateImportResult,
  createImport,
  mustRetryFirst,
  retryImport,
} from '../../imports/store';
import type { JobContext } from '../types';

// One bulk item (D-08), on the discogs lane: the spine's top match becomes
// the release to import, either as is (already in the preferred country,
// D-02, or with no master, D-04) or as its pressing from one
// GET /masters/{id}/versions (D-01), then createImport writes the import
// and its add_to_collection job, whose run_after is this job's, so each
// spine's add runs right after its own lookup. Release ids come only from
// the spine's candidate row or the parsed versions answer (T-06-04).

export const ResolvePressingPayload = z.object({
  itemId: z.string().min(1),
});
export type ResolvePressingPayload = z.infer<typeof ResolvePressingPayload>;

export type ResolvePressingDeps = { fetch?: DiscogsFetchDeps };

type CandidateDbRow = {
  id: string;
  spine_id: string;
  search_id: string;
  release_id: number;
  title: string;
  artist: string | null;
  year: number | null;
  country: string | null;
  labels_json: string;
  formats_json: string;
  master_id: number | null;
};

/** Thrown when this run no longer owns the job (WR-04). */
class NotCurrentError extends Error {
  constructor() {
    super('resolve_pressing: the job is no longer current');
    this.name = 'NotCurrentError';
  }
}

/** Rolls back a refused createImport's savepoint, pressing row included. */
class RefusedImport extends Error {
  readonly result: CreateImportResult;
  constructor(result: CreateImportResult) {
    super(`resolve_pressing: createImport answered ${result.status}`);
    this.name = 'RefusedImport';
    this.result = result;
  }
}

function jsonArray(json: string): unknown[] {
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function formatsOf(json: string): CandidateFormat[] {
  const out: CandidateFormat[] = [];
  for (const f of jsonArray(json)) {
    if (!f || typeof f !== 'object') continue;
    const o = f as Record<string, unknown>;
    if (typeof o.name !== 'string') continue;
    out.push({
      name: o.name,
      qty: typeof o.qty === 'string' ? o.qty : null,
      descriptions: Array.isArray(o.descriptions)
        ? o.descriptions.filter((d): d is string => typeof d === 'string')
        : [],
      text: typeof o.text === 'string' ? o.text : null,
    });
  }
  return out;
}

function topOf(c: CandidateDbRow): TopMatchLite {
  return {
    releaseId: c.release_id,
    title: c.title,
    country: c.country,
    labels: jsonArray(c.labels_json).filter(
      (x): x is string => typeof x === 'string',
    ),
    masterId: c.master_id,
    year: c.year,
    formats: formatsOf(c.formats_json),
  };
}

/** The country of an import's candidate snapshot, or null. */
function snapshotCountry(json: string | null): string | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as { country?: unknown } | null;
    return typeof v?.country === 'string' ? v.country : null;
  } catch {
    return null;
  }
}

/**
 * D-20 (Phase 4 D-07): the spine's failed import that may have landed goes
 * back to pending on the same row through retryImport, whose add job
 * reconciles before any POST; the item imports that row's release. False
 * when there is no such import. Call inside an IMMEDIATE transaction.
 */
function retryEarlier(
  db: ReturnType<typeof getDb>['$client'],
  itemId: string,
  spineId: string,
  runAfter: number,
): boolean {
  const row = mustRetryFirst(db, spineId);
  if (!row) return false;
  retryImport(db, row, { runAfter });
  resolveBulkItem(db, itemId, {
    importId: row.id,
    releaseId: row.release_id,
    country: snapshotCountry(row.candidate_json),
    outcome: 'retried_earlier',
  });
  return true;
}

export async function runResolvePressing(
  payload: unknown,
  ctx: JobContext,
  deps: ResolvePressingDeps = {},
): Promise<void> {
  const { itemId } = ResolvePressingPayload.parse(payload);
  const db = getDb().$client;
  const item = getBulkItem(db, itemId);
  if (!item) throw new Error(`resolve_pressing: item ${itemId} not found`);
  if (item.status !== 'queued') return;
  const run = getBulkRun(db, item.run_id);
  if (!run) throw new Error(`resolve_pressing: run ${item.run_id} not found`);
  const spineId = item.spine_id;

  const spine = db
    .prepare('SELECT state FROM spines WHERE id = @spineId')
    .get({ spineId }) as { state: string } | undefined;
  if (spine?.state !== 'active') {
    skipBulkItem(db, itemId, { reason: 'changed' });
    return;
  }
  const candidate = db
    .prepare(
      `SELECT id, spine_id, search_id, release_id, title, artist, year,
         country, labels_json, formats_json, master_id
       FROM discogs_candidates WHERE id = @candidateId AND spine_id = @spineId`,
    )
    .get({ candidateId: item.candidate_id, spineId }) as
    | CandidateDbRow
    | undefined;
  if (!candidate) {
    skipBulkItem(db, itemId, { reason: 'changed' });
    return;
  }
  const top = topOf(candidate);

  // D-20: a failed add that may have reached Discogs is retried through
  // reconcile on its own row, never replaced and never looked up again.
  if (mustRetryFirst(db, spineId)) {
    if (!ctx.isCurrent()) return;
    const tx = db.transaction(() => {
      if (getBulkItem(db, itemId)?.status !== 'queued') return;
      if (!retryEarlier(db, itemId, spineId, ctx.job.runAfter)) {
        skipBulkItem(db, itemId, { reason: 'changed' });
      }
    });
    tx.immediate();
    return;
  }

  let versions: VersionLite[] | 'unusable' | undefined;
  const masterId = top.masterId;
  if (needsLookup(top, run.country) && masterId !== null) {
    if (!ctx.isCurrent()) throw new NotCurrentError();
    const res = await discogsFetch(
      {
        path: masterVersionsPath(masterId),
        query: versionsQuery(run.country),
        auth: 'oauth',
        signal: ctx.signal,
      },
      deps.fetch,
    );
    if (!ctx.isCurrent()) return;
    versions = parseVersions(res.json);
  }
  const choice = choosePressing({ top, preferred: run.country, versions });
  if (!ctx.isCurrent()) return;

  const runAfter = ctx.job.runAfter;
  const tx = db.transaction(() => {
    if (getBulkItem(db, itemId)?.status !== 'queued') return;
    const release =
      choice.use === 'version'
        ? { id: choice.version.id, country: choice.version.country }
        : { id: top.releaseId, country: top.country };
    // A refused import writes nothing, the pressing row included (D-09).
    const attempt = db.transaction((): CreateImportResult => {
      const candidateId =
        choice.use === 'version'
          ? upsertPressingCandidate(db, {
              spineId,
              searchId: candidate.search_id,
              values: pressingCandidateValues(choice.version, {
                artist: candidate.artist,
                title: candidate.title,
                masterId: top.masterId,
              }),
            })
          : candidate.id;
      const res = createImport(db, { spineId, candidateId, runAfter });
      if (res.status !== 'ok') throw new RefusedImport(res);
      return res;
    });
    let res: CreateImportResult;
    try {
      res = attempt();
    } catch (err) {
      if (!(err instanceof RefusedImport)) throw err;
      res = err.result;
    }
    switch (res.status) {
      case 'ok':
        resolveBulkItem(db, itemId, {
          importId: res.importId,
          releaseId: release.id,
          country: release.country,
          outcome: choice.outcome,
        });
        return;
      case 'duplicate':
        skipBulkItem(db, itemId, {
          reason: 'duplicate',
          dupSpineId: res.spineId,
        });
        return;
      case 'retry_first':
        // A failed add appeared since the check above (a race).
        if (!retryEarlier(db, itemId, spineId, runAfter)) {
          skipBulkItem(db, itemId, { reason: 'changed' });
        }
        return;
      default:
        // already_confirmed, not_importable, not_on_discogs, no_candidate,
        // not_found: the spine changed since it was picked.
        skipBulkItem(db, itemId, { reason: 'changed' });
    }
  });
  tx.immediate();
}
