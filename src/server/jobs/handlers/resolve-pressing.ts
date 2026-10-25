import 'server-only';
import { z } from 'zod';
import type { CandidateFormat } from '@/lib/discogs-types';
import {
  choosePressing,
  needsLookup,
  type PressingChoice,
  type TopMatchLite,
} from '@/lib/pressing';
import {
  getBulkItem,
  getBulkRun,
  resolveBulkItem,
  skipBulkItem,
} from '../../bulk/store';
import { getDb } from '../../db/client';
import type { DiscogsFetchDeps } from '../../discogs/client';
import { createImport } from '../../imports/store';
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

export async function runResolvePressing(
  payload: unknown,
  ctx: JobContext,
  _deps: ResolvePressingDeps = {},
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

  let choice: PressingChoice;
  if (needsLookup(top, run.country)) {
    throw new Error('resolve_pressing: versions lookup not implemented');
  } else {
    choice = choosePressing({ top, preferred: run.country });
  }
  if (!ctx.isCurrent()) return;

  const tx = db.transaction(() => {
    if (getBulkItem(db, itemId)?.status !== 'queued') return;
    const res = createImport(db, {
      spineId,
      candidateId: candidate.id,
      runAfter: ctx.job.runAfter,
    });
    if (res.status === 'ok') {
      resolveBulkItem(db, itemId, {
        importId: res.importId,
        releaseId: top.releaseId,
        country: top.country,
        outcome: choice.outcome,
      });
    }
  });
  tx.immediate();
}
