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
import { updateSpineField } from './fields';
import { dismissSpine, listReattachCandidates, reattachSpine } from './orphans';
import { getSpines } from './queries';

// D-16 orphaned spines (T-02-25, T-02-27): re-attach only onto an unedited
// spine the same photo's latest run newly found, dismiss only an orphan, and
// never lose stored edits.

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
});
