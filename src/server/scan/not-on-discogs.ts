import 'server-only';
import type Database from 'better-sqlite3';

// "Not on Discogs" (REV-05, D-14): the owner's reversible mark for a disc
// Discogs does not list. It changes only spines.not_on_discogs (and
// updated_at): the crop, fields, searches, candidates and imports all stay,
// so Unmark returns the card to its search-derived state (A-04-20). A marked
// spine is never imported (createImport refuses it) and never auto-searched
// (AUTO_SEARCH_ELIGIBLE_SQL). Raw SQL with @named parameters.

export type SetNotOnDiscogsResult =
  | { status: 'ok'; notOnDiscogs: boolean }
  | { status: 'not_found' }
  | { status: 'not_markable' }
  | { status: 'imported' }
  | { status: 'import_open' };

/**
 * Sets or clears the mark in one IMMEDIATE transaction (T-04-34). Checks, in
 * order: the spine exists, is active or orphaned (not_markable otherwise);
 * then, for a mark only, that its latest import has no Discogs copy
 * (imported, D-14) and is not pending, importing or held already in the
 * collection (import_open, A-04-19: the open job would still add it).
 * Unmarking an active or orphaned spine is always allowed.
 */
export function setNotOnDiscogs(
  db: Database.Database,
  spineId: string,
  flag: boolean,
): SetNotOnDiscogsResult {
  const tx = db.transaction((): SetNotOnDiscogsResult => {
    const spine = db
      .prepare('SELECT state, not_on_discogs FROM spines WHERE id = @spineId')
      .get({ spineId }) as
      | { state: string; not_on_discogs: number }
      | undefined;
    if (!spine) return { status: 'not_found' };
    if (spine.state !== 'active' && spine.state !== 'orphaned') {
      return { status: 'not_markable' };
    }
    // A repeat (a double click, the toast's Undo after an Unmark) is a
    // no-op: it answers ok and writes nothing.
    if ((spine.not_on_discogs === 1) === flag) {
      return { status: 'ok', notOnDiscogs: flag };
    }
    if (flag) {
      const latest = db
        .prepare(
          `SELECT status, instance_id FROM imports
           WHERE spine_id = @spineId
           ORDER BY created_at DESC, id DESC
           LIMIT 1`,
        )
        .get({ spineId }) as
        | { status: string; instance_id: number | null }
        | undefined;
      if (latest) {
        if (latest.instance_id !== null || latest.status === 'imported') {
          return { status: 'imported' };
        }
        if (latest.status !== 'failed') return { status: 'import_open' };
      }
    }
    db.prepare(
      `UPDATE spines SET not_on_discogs = @flag, updated_at = @now
       WHERE id = @spineId`,
    ).run({ spineId, flag: flag ? 1 : 0, now: Date.now() });
    return { status: 'ok', notOnDiscogs: flag };
  });
  return tx.immediate();
}
