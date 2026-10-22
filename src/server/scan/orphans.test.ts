import { describe, expect, it } from 'vitest';
import {
  fieldOf,
  fieldRows,
  foreignCandidate,
  layout,
  ORPHAN_ARTIST,
  ORPHAN_INDEX,
  orphanScenario,
  spineRow,
  spineTables,
  V_TEXT,
} from '../../../test/helpers/scan-runs';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';
import { getDb } from '../db/client';
import { newId } from '../ids';
import { updateSpineField } from './fields';
import { dismissSpine, listReattachCandidates, reattachSpine } from './orphans';
import { getSpines } from './queries';

// D-16 orphaned spines (T-02-25, T-02-27): re-attach only onto an unedited
// spine the same photo's latest run newly found, dismiss only an orphan, and
// never lose stored edits.

/** An imports row for the spine, seeded with direct SQL. */
function seedImport(
  spineId: string,
  status: string,
  failed: { intentAt?: number | null; errorKind?: string | null } = {},
): void {
  const now = Date.now();
  getDb()
    .$client.prepare(
      `INSERT INTO imports (id, spine_id, release_id, folder_id, status,
         intent_at, error_kind, created_at, updated_at)
       VALUES (@id, @spineId, 4242, 1, @status, @intentAt, @errorKind,
         @now, @now)`,
    )
    .run({
      id: newId(),
      spineId,
      status,
      intentAt: failed.intentAt ?? null,
      errorKind: failed.errorKind ?? null,
      now,
    });
}

function markNotOnDiscogs(spineId: string): void {
  getDb()
    .$client.prepare('UPDATE spines SET not_on_discogs = 1 WHERE id = ?')
    .run(spineId);
}

describe('orphaned spines', () => {
  useTempDataDir();

  it('lists only the unedited spines the latest run newly created', async () => {
    const { orphanId, vId } = await orphanScenario();
    const result = listReattachCandidates(orphanId);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.value.map((s) => s.id)).toEqual([vId]);
    expect(
      result.value[0].fields.find((f) => f.field === 'raw_text')?.value,
    ).toBe(V_TEXT);
  });

  it('getSpines lists the orphan after the active spines with its run', async () => {
    const { photoId, orphanId } = await orphanScenario();
    const { spines } = getSpines({ photoId });
    const last = spines[spines.length - 1];
    expect(last).toMatchObject({
      id: orphanId,
      state: 'orphaned',
      orphanedRunNo: 2,
    });
    expect(spines.slice(0, -1).every((s) => s.state === 'active')).toBe(true);
  });

  it('getSpines review lists only the spines that need review, with both counts', async () => {
    const { photoId, orphanId } = await orphanScenario();
    const all = getSpines({ photoId });
    const flagged = getSpines({ photoId, review: true });
    expect(flagged.spines.map((s) => s.id)).toContain(orphanId);
    expect(flagged.counts).toEqual(all.counts);
    expect(flagged.counts.all).toBe(all.spines.length);
    expect(flagged.counts.needsReview).toBe(flagged.spines.length);
    expect(flagged.spines.length).toBeLessThan(all.spines.length);
    expect(flagged.photoOptions).toEqual(all.photoOptions);
  });

  it('re-attach moves the edits, follows the new read and supersedes the target', async () => {
    const { orphanId, vId, vDetectionId } = await orphanScenario();
    const oldArtistRead = layout.spines[ORPHAN_INDEX].artist;
    const result = reattachSpine(orphanId, vId);
    expect(result.status).toBe('ok');

    const orphan = spineRow(orphanId);
    expect(orphan.state).toBe('active');
    expect(orphan.current_detection_id).toBe(vDetectionId);
    expect(spineRow(vId).state).toBe('superseded');

    // Edited: the owner's value stays beside the target's read.
    expect(fieldOf(orphanId, 'artist')).toMatchObject({
      value: ORPHAN_ARTIST,
      ai_value: 'Marlow Reed',
      confidence: 0.82,
      edit_base_ai_value: oldArtistRead,
    });
    // Unedited: value, read and confidence follow the target.
    expect(fieldOf(orphanId, 'raw_text')).toMatchObject({
      value: V_TEXT,
      ai_value: V_TEXT,
      confidence: 0.91,
      edit_base_ai_value: null,
    });
    expect(fieldOf(orphanId, 'title')).toMatchObject({
      value: null,
      ai_value: null,
    });
    // Detection rows are not modified: V's detection still names V.
    const link = getDb()
      .$client.prepare('SELECT spine_id FROM spine_detections WHERE id = ?')
      .get(vDetectionId) as { spine_id: string };
    expect(link.spine_id).toBe(vId);
  });

  it('re-attach to a target of another photo is a conflict and changes nothing', async () => {
    const { orphanId } = await orphanScenario();
    const foreign = await foreignCandidate();
    const before = spineTables();
    expect(reattachSpine(orphanId, foreign)).toEqual({ status: 'conflict' });
    expect(spineTables()).toBe(before);
  });

  it('re-attach to an edited target is a conflict and changes nothing', async () => {
    const { orphanId, vId } = await orphanScenario();
    updateSpineField(vId, 'title', 'Owner title on V');
    const before = spineTables();
    expect(reattachSpine(orphanId, vId)).toEqual({ status: 'conflict' });
    expect(spineTables()).toBe(before);
    expect(listReattachCandidates(orphanId)).toEqual({
      status: 'ok',
      value: [],
    });
  });

  it('keeps the candidates while a re-scan is queued or after it fails (WR-01)', async () => {
    const { orphanId, vId } = await orphanScenario();
    const db = getDb().$client;
    const { photo_id: photoId } = db
      .prepare('SELECT photo_id FROM spines WHERE id = ?')
      .get(orphanId) as { photo_id: string };
    const now = Date.now();
    db.prepare(
      `INSERT INTO vision_runs (id, photo_id, run_no, status, prompt_version,
         schema_version, created_at, updated_at)
       VALUES ('run-next', ?, 99, 'queued', 1, 1, ?, ?)`,
    ).run(photoId, now, now);
    db.prepare("UPDATE photos SET latest_run_id = 'run-next' WHERE id = ?").run(
      photoId,
    );
    for (const status of ['queued', 'error']) {
      db.prepare("UPDATE vision_runs SET status = ? WHERE id = 'run-next'").run(
        status,
      );
      const result = listReattachCandidates(orphanId);
      expect(result.status, status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(
        result.value.map((s) => s.id),
        status,
      ).toContain(vId);
    }
  });

  it('re-attach to a target created by an older run is a conflict', async () => {
    const { orphanId, spineIds } = await orphanScenario();
    const before = spineTables();
    expect(reattachSpine(orphanId, spineIds[0])).toEqual({
      status: 'conflict',
    });
    expect(spineTables()).toBe(before);
  });

  it('re-attach from a source that is not orphaned is a conflict', async () => {
    const { spineIds, supersededId, vId } = await orphanScenario();
    const before = spineTables();
    expect(reattachSpine(spineIds[0], vId)).toEqual({ status: 'conflict' });
    expect(reattachSpine(supersededId, vId)).toEqual({ status: 'conflict' });
    expect(spineTables()).toBe(before);
  });

  it('re-attach from an unknown spine is not_found', async () => {
    const { vId } = await orphanScenario();
    expect(reattachSpine('no-such-spine', vId)).toEqual({
      status: 'not_found',
    });
    expect(listReattachCandidates('no-such-spine')).toEqual({
      status: 'not_found',
    });
  });

  it('dismiss sets an orphan to dismissed and keeps its field rows', async () => {
    const { photoId, orphanId } = await orphanScenario();
    const fields = fieldRows(orphanId);
    expect(dismissSpine(orphanId)).toBe('ok');
    expect(spineRow(orphanId).state).toBe('dismissed');
    expect(fieldRows(orphanId)).toEqual(fields);
    expect(fieldOf(orphanId, 'artist').value).toBe(ORPHAN_ARTIST);
    expect(getSpines({ photoId }).spines.map((s) => s.id)).not.toContain(
      orphanId,
    );
  });

  it('dismiss of an active, superseded or dismissed spine is a conflict', async () => {
    const { orphanId, spineIds, supersededId } = await orphanScenario();
    expect(dismissSpine(spineIds[0])).toBe('conflict');
    expect(dismissSpine(supersededId)).toBe('conflict');
    expect(dismissSpine(orphanId)).toBe('ok');
    const before = spineTables();
    expect(dismissSpine(orphanId)).toBe('conflict');
    expect(spineTables()).toBe(before);
    expect(spineRow(spineIds[0]).state).toBe('active');
    expect(spineRow(supersededId).state).toBe('superseded');
  });

  it('dismiss of an unknown spine is not_found', () => {
    expect(dismissSpine('no-such-spine')).toBe('not_found');
  });

  // RESEARCH Pitfall 5: a re-attach supersedes its target, so a target with a
  // non-failed import or the mark is never offered or accepted.
  it.each(['pending', 'importing', 'imported', 'already_in_collection'])(
    'a target with an import in status %s is not a candidate and re-attach onto it is a conflict',
    async (status) => {
      const { orphanId, vId } = await orphanScenario();
      seedImport(vId, status);
      expect(listReattachCandidates(orphanId)).toEqual({
        status: 'ok',
        value: [],
      });
      const before = spineTables();
      expect(reattachSpine(orphanId, vId)).toEqual({ status: 'conflict' });
      expect(spineTables()).toBe(before);
      expect(spineRow(vId).state).toBe('active');
    },
  );

  it('a target marked not on Discogs is not a candidate and re-attach onto it is a conflict', async () => {
    const { orphanId, vId } = await orphanScenario();
    markNotOnDiscogs(vId);
    expect(listReattachCandidates(orphanId)).toEqual({
      status: 'ok',
      value: [],
    });
    const before = spineTables();
    expect(reattachSpine(orphanId, vId)).toEqual({ status: 'conflict' });
    expect(spineTables()).toBe(before);
  });

  it('a target whose only import failed is still a candidate (A-04-16)', async () => {
    const { orphanId, vId } = await orphanScenario();
    seedImport(vId, 'failed');
    const result = listReattachCandidates(orphanId);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.value.map((s) => s.id)).toEqual([vId]);
  });

  it.each(['pending', 'importing', 'imported', 'already_in_collection'])(
    'dismiss of an orphan with an import in status %s is has_import and keeps it orphaned',
    async (status) => {
      const { orphanId } = await orphanScenario();
      seedImport(orphanId, status);
      const before = spineTables();
      expect(dismissSpine(orphanId)).toBe('has_import');
      expect(spineTables()).toBe(before);
      expect(spineRow(orphanId).state).toBe('orphaned');
    },
  );

  it('dismiss of an orphan whose only import failed dismisses it', async () => {
    const { orphanId } = await orphanScenario();
    seedImport(orphanId, 'failed');
    expect(dismissSpine(orphanId)).toBe('ok');
    expect(spineRow(orphanId).state).toBe('dismissed');
  });

  it.each(['unavailable', 'interrupted', 'auth', 'other', 'removed'])(
    'a failed import with an intent and %s may be on Discogs: not a re-attach target, and dismiss is has_import (WR-01)',
    async (errorKind) => {
      const { orphanId, vId } = await orphanScenario();
      seedImport(vId, 'failed', { intentAt: 1_000, errorKind });
      expect(listReattachCandidates(orphanId)).toEqual({
        status: 'ok',
        value: [],
      });
      expect(reattachSpine(orphanId, vId)).toEqual({ status: 'conflict' });
      seedImport(orphanId, 'failed', { intentAt: 1_000, errorKind });
      expect(dismissSpine(orphanId)).toBe('has_import');
      expect(spineRow(orphanId).state).toBe('orphaned');
    },
  );

  it.each(['not_found', 'rejected'])(
    'a failed import with an intent Discogs refused (%s) does not block dismiss (A-04-16)',
    async (errorKind) => {
      const { orphanId } = await orphanScenario();
      seedImport(orphanId, 'failed', { intentAt: 1_000, errorKind });
      expect(dismissSpine(orphanId)).toBe('ok');
    },
  );

  it('dismiss of a marked orphan without an import dismisses it', async () => {
    const { orphanId } = await orphanScenario();
    markNotOnDiscogs(orphanId);
    expect(dismissSpine(orphanId)).toBe('ok');
    expect(spineRow(orphanId).state).toBe('dismissed');
  });

  it('dismiss of an active spine with an import is still a conflict', async () => {
    const { spineIds } = await orphanScenario();
    seedImport(spineIds[0], 'imported');
    expect(dismissSpine(spineIds[0])).toBe('conflict');
  });
});
