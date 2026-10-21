import 'server-only';
import type Database from 'better-sqlite3';
import { enqueue } from '../jobs/queue';
import { getDiscogsAuth, isAuthInvalid } from './auth';
import { inputHash, loadSpineInputs } from './inputs';
import { createSearch, latestAutoSearch, setSearchJob } from './store';

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
 * Creates an auto search row and its search_spine job, unless the spine's
 * latest auto or again search already used the same inputs. Returns whether
 * a job was created. Joins the caller's transaction when there is one.
 */
export function enqueueAutoSearch(
  db: Database.Database,
  spineId: string,
): boolean {
  const tx = db.transaction((): boolean => {
    const inputs = loadSpineInputs(db, spineId);
    const hash = inputHash(inputs);
    if (latestAutoSearch(db, spineId)?.input_hash === hash) return false;
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
