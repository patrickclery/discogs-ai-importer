import 'server-only';
import type Database from 'better-sqlite3';
import { getDb } from '../db/client';
import { enqueue } from '../jobs/queue';
import { getDiscogsAuth, isAuthInvalid } from './auth';
import { inputHash, loadSpineInputs, type SearchInputs } from './inputs';
import { createSearch, setSearchJob } from './store';

// Automatic search enqueue points (D-08, RESEARCH Pattern 5). The dedupe key
// search:auto:{spineId}:{inputHash} means one spine is never auto-searched
// twice for the same inputs; two spines with identical fields still get one
// search each, because the key carries the spine id. Explicit actions (Search
// again, manual search) use search:{searchId} keys instead (Pitfall 1).

export const SEARCH_JOB_TYPE = 'search_spine';

/**
 * Connected and not known to be rejected. Never throws: it runs inside
 * persistRunResult, and an unreadable secrets file must not fail a scan.
 */
export function discogsReady(): boolean {
  try {
    return getDiscogsAuth() !== null && !isAuthInvalid();
  } catch {
    return false;
  }
}

/**
 * The hash of the spine's newest auto or again search that reached Discogs,
 * or could have. A not_connected, auth_failed or skipped search never ran
 * against Discogs and released its dedupe key (Plan 03-05, CR-01), so it is
 * no baseline (A-03-27): the backfill can search that spine again with the
 * same fields.
 */
function baselineHash(
  db: Database.Database,
  spineId: string,
): string | null | undefined {
  const row = db
    .prepare(
      `SELECT input_hash FROM discogs_searches
       WHERE spine_id = @spineId AND kind IN ('auto', 'again')
         AND status NOT IN ('not_connected', 'auth_failed', 'skipped')
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
    .get({ spineId }) as { input_hash: string | null } | undefined;
  return row?.input_hash;
}

/**
 * Creates an auto search row and its search_spine job, unless the spine's
 * latest auto or again search (ignoring ones that ended not_connected,
 * auth_failed or skipped) already used the same inputs. Returns whether a job was
 * created. Joins the caller's transaction when there is one.
 */
export function enqueueAutoSearch(
  db: Database.Database,
  spineId: string,
): boolean {
  const tx = db.transaction((): boolean => {
    const inputs = loadSpineInputs(db, spineId);
    const hash = inputHash(inputs);
    if (baselineHash(db, spineId) === hash) return false;
    const searchId = createSearch(db, {
      spineId,
      kind: 'auto',
      inputs,
      inputHash: hash,
    });
    const job = enqueue({
      lane: 'discogs',
      type: SEARCH_JOB_TYPE,
      payload: { searchId },
      dedupeKey: `search:auto:${spineId}:${hash}`,
    });
    if (!job.created) {
      // A-03-11: these inputs were auto-searched before; keep no extra row.
      db.prepare('DELETE FROM discogs_searches WHERE id = @searchId').run({
        searchId,
      });
      return false;
    }
    setSearchJob(db, searchId, job.id);
    return true;
  });
  return tx();
}

/**
 * One auto search per active spine of the photo whose current detection is
 * a CD (Open Question 4: unsure spines are left to the manual action).
 * Does nothing while Discogs is not connected. Returns the jobs created.
 */
export function enqueueAutoSearchesForPhoto(
  db: Database.Database,
  photoId: string,
): number {
  if (!discogsReady()) return 0;
  const spines = db
    .prepare(
      `SELECT s.id FROM spines s
       JOIN spine_detections d ON d.id = s.current_detection_id
       WHERE s.photo_id = @photoId AND s.state = 'active'
         AND d.media_kind = 'cd'
       ORDER BY d.idx, d.position, s.id`,
    )
    .all({ photoId }) as { id: string }[];
  let created = 0;
  for (const s of spines) {
    if (enqueueAutoSearch(db, s.id)) created += 1;
  }
  return created;
}

/**
 * The connect backfill and its safety net (D-08, RESEARCH Pattern 5): an
 * auto search for every active CD spine with no auto or again search yet, or
 * whose latest one ended not_connected or skipped (and auth_failed when
 * includeAuthFailed). Only finishing a connect passes includeAuthFailed; the
 * lease-tick maintenance hook never does, so a revoked sign-in cannot loop
 * (T-03-17). A latest search that failed after its retries is never picked:
 * Retry is the owner's action (D-06). Idempotent: a second call finds every
 * spine already queued or searched. Returns the jobs created.
 */
export function enqueueMissingSearches(
  opts: { includeAuthFailed: boolean },
  db: Database.Database = getDb().$client,
): number {
  if (!discogsReady()) return 0;
  const select = db.prepare(
    `SELECT s.id FROM spines s
     JOIN spine_detections d ON d.id = s.current_detection_id
     LEFT JOIN discogs_searches ls ON ls.id = (
       SELECT x.id FROM discogs_searches x
       WHERE x.spine_id = s.id AND x.kind IN ('auto', 'again')
       ORDER BY x.created_at DESC, x.id DESC
       LIMIT 1)
     WHERE s.state = 'active' AND d.media_kind = 'cd'
       AND (ls.id IS NULL OR ls.status IN ('not_connected', 'skipped')
         OR (@includeAuthFailed = 1 AND ls.status = 'auth_failed'))
     ORDER BY s.photo_id, d.idx, d.position, s.id`,
  );
  const params = { includeAuthFailed: opts.includeAuthFailed ? 1 : 0 };
  // The cheap read runs every lease tick; the write lock only when needed.
  if (select.all(params).length === 0) return 0;
  const tx = db.transaction((): number => {
    let created = 0;
    for (const s of select.all(params) as { id: string }[]) {
      if (enqueueAutoSearch(db, s.id)) created += 1;
    }
    return created;
  });
  return tx.immediate();
}

/** The fetch_release job: one GET /releases/{id} for a pasted release. */
export const FETCH_RELEASE_JOB_TYPE = 'fetch_release';

/** Search kinds the owner starts explicitly. */
export type ExplicitSearchKind = 'again' | 'manual' | 'release';

export type ExplicitSearchInput =
  | { spineId: string; kind: 'again' }
  /** Free text from the Search Discogs dialog (already trimmed). */
  | { spineId: string; kind: 'manual'; queryText: string }
  /** A pasted release link or number; queryText is the pasted value. */
  | { spineId: string; kind: 'release'; releaseId: number; queryText?: string };

export type ExplicitSearchResult =
  | { status: 'ok'; searchId: string }
  | { status: 'not_found' }
  | { status: 'not_searchable' }
  | { status: 'busy' };

const NO_INPUTS: SearchInputs = {
  artist: null,
  title: null,
  catno: null,
  rawText: null,
};

/**
 * The owner's explicit searches, each a new search row and a job keyed
 * search:{searchId}, so it always runs, even when its inputs equal an
 * earlier search's (RESEARCH Pitfall 1). Refuses an unknown spine and a
 * superseded or dismissed one.
 *
 * - again (Search again, Retry search; D-14, D-06): the spine's current
 *   inputs on the search_spine job. Refused while the latest auto or again
 *   search is still queued or running (T-03-30).
 * - manual (D-15): the typed text on the search_spine job. Its inputs carry
 *   only rawText, so it searches that text alone.
 * - release (D-15): one GET /releases/{id} on the fetch_release job.
 * Manual and release searches are never blocked by a queued automatic one,
 * and work for orphaned spines of any media kind. Checks and writes share
 * one IMMEDIATE transaction, so two clicks cannot both pass the busy check.
 */
export function enqueueExplicitSearch(
  db: Database.Database,
  input: ExplicitSearchInput,
): ExplicitSearchResult {
  const tx = db.transaction((): ExplicitSearchResult => {
    const spine = db
      .prepare('SELECT state FROM spines WHERE id = @spineId')
      .get({ spineId: input.spineId }) as { state: string } | undefined;
    if (!spine) return { status: 'not_found' };
    if (spine.state !== 'active' && spine.state !== 'orphaned') {
      return { status: 'not_searchable' };
    }
    let searchId: string;
    let type = SEARCH_JOB_TYPE;
    switch (input.kind) {
      case 'again': {
        const busy = db
          .prepare(
            `SELECT 1 FROM discogs_searches s
             LEFT JOIN jobs j ON j.id = s.job_id
             WHERE s.id = (
               SELECT x.id FROM discogs_searches x
               WHERE x.spine_id = @spineId AND x.kind IN ('auto', 'again')
               ORDER BY x.created_at DESC, x.id DESC
               LIMIT 1)
               AND s.status = 'queued'
               AND (j.id IS NULL OR j.status IN ('queued', 'running'))`,
          )
          .get({ spineId: input.spineId });
        if (busy) return { status: 'busy' };
        const inputs = loadSpineInputs(db, input.spineId);
        searchId = createSearch(db, {
          spineId: input.spineId,
          kind: 'again',
          inputs,
          inputHash: inputHash(inputs),
        });
        break;
      }
      case 'manual':
        searchId = createSearch(db, {
          spineId: input.spineId,
          kind: 'manual',
          inputs: { ...NO_INPUTS, rawText: input.queryText },
          inputHash: null,
          queryText: input.queryText,
        });
        break;
      case 'release':
        searchId = createSearch(db, {
          spineId: input.spineId,
          kind: 'release',
          inputs: NO_INPUTS,
          inputHash: null,
          queryText: input.queryText ?? null,
          releaseId: input.releaseId,
        });
        type = FETCH_RELEASE_JOB_TYPE;
        break;
    }
    const job = enqueue({
      lane: 'discogs',
      type,
      payload: { searchId },
      dedupeKey: `search:${searchId}`,
    });
    setSearchJob(db, searchId, job.id);
    return { status: 'ok', searchId };
  });
  return tx.immediate();
}
