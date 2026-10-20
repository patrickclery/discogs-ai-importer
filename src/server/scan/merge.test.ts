import { describe, expect, it } from 'vitest';
import {
  LAYOUTS,
  makeSyntheticShelf,
  structuredOutputFor,
} from '../../../test/fixtures/vision/synthetic-shelf.mjs';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';
import { getDb } from '../db/client';
import { newId } from '../ids';
import type { CliEnvelope, VisionResult } from '../vision/schema';
import { updateSpineField } from './fields';
import { ingestUpload } from './ingest';
import { type PreparedDetection, persistRunResult } from './store';

// D-13..D-16 merge rules through persistRunResult: run 1 is stored, the
// owner edits, then later runs are merged into the same stable spines.

const layout = LAYOUTS.tracerShelf;
const ENVELOPE = { is_error: false } as CliEnvelope;

type Output = ReturnType<typeof structuredOutputFor>;
type SpineOut = Output['spines'][number];

function detectionsFor(out: Output): PreparedDetection[] {
  return out.spines.map((s, position) => ({
    id: newId(),
    idx: s.index,
    position,
    mediaKind: s.media_kind as PreparedDetection['mediaKind'],
    box: { x1: s.bbox[0], y1: s.bbox[1], x2: s.bbox[2], y2: s.bbox[3] },
    read: s as unknown as PreparedDetection['read'],
    crop: null,
  }));
}

/** A run in parsing with the tracer's vision size, ready to persist. */
function parsingRun(photoId: string, runNo: number): string {
  const db = getDb().$client;
  const existing = db
    .prepare('SELECT id FROM vision_runs WHERE photo_id = ? AND run_no = ?')
    .get(photoId, runNo) as { id: string } | undefined;
  const runId = existing?.id ?? newId();
  const now = Date.now();
  if (!existing) {
    db.prepare(
      `INSERT INTO vision_runs (id, photo_id, run_no, status, prompt_version,
         schema_version, created_at, updated_at)
       VALUES (?, ?, ?, 'queued', 1, 1, ?, ?)`,
    ).run(runId, photoId, runNo, now, now);
  }
  db.prepare(
    `UPDATE vision_runs SET status = 'parsing', vision_w = ?, vision_h = ?
     WHERE id = ?`,
  ).run(layout.width, layout.height, runId);
  db.prepare('UPDATE photos SET latest_run_id = ? WHERE id = ?').run(
    runId,
    photoId,
  );
  return runId;
}

function persist(runId: string, out: Output): PreparedDetection[] {
  const detections = detectionsFor(out);
  persistRunResult({
    runId,
    detections,
    result: out as unknown as VisionResult,
    envelope: ENVELOPE,
  });
  return detections;
}

type SpineDb = {
  id: string;
  state: string;
  current_detection_id: string;
  created_run_id: string;
};
type FieldDb = {
  ai_value: string | null;
  value: string | null;
  confidence: number;
  edit_base_ai_value: string | null;
};

function spineByDetection(detectionId: string): SpineDb {
  return getDb()
    .$client.prepare(
      `SELECT s.* FROM spines s JOIN spine_detections d ON d.spine_id = s.id
       WHERE d.id = ?`,
    )
    .get(detectionId) as SpineDb;
}

function spine(id: string): SpineDb {
  return getDb()
    .$client.prepare('SELECT * FROM spines WHERE id = ?')
    .get(id) as SpineDb;
}

function fieldOf(spineId: string, field: string): FieldDb {
  return getDb()
    .$client.prepare(
      'SELECT * FROM spine_fields WHERE spine_id = ? AND field = ?',
    )
    .get(spineId, field) as FieldDb;
}

/** Run 2's answer: every box shifted, some spines dropped or re-read. */
function rescanOutput(
  edit: (s: SpineOut) => SpineOut | null,
  extra: SpineOut[] = [],
): Output {
  const base = structuredOutputFor(layout);
  const spines = base.spines
    .map((s) => ({
      ...s,
      bbox: s.bbox.map((v) => v + 6),
    }))
    .map(edit)
    .filter((s): s is SpineOut => s !== null);
  const all = [...spines, ...extra].map((s, index) => ({ ...s, index }));
  return { ...base, spine_count_estimate: all.length, spines: all };
}

describe('mergeRunIntoSpines via persistRunResult (run_no > 1)', () => {
  useTempDataDir();

  async function firstRun() {
    const { jpeg } = await makeSyntheticShelf(layout);
    const { photoId } = await ingestUpload({
      bytes: new Uint8Array(jpeg),
      kind: 'jpeg',
      filename: 'shelf.jpg',
    });
    const run1 = parsingRun(photoId, 1);
    const detections = persist(run1, structuredOutputFor(layout));
    const spineIds = detections.map((d) => spineByDetection(d.id).id);
    return { photoId, run1, detections, spineIds };
  }

  it('an unedited field takes the new read as value and ai_value', async () => {
    const { photoId, spineIds } = await firstRun();
    const run2 = parsingRun(photoId, 2);
    persist(
      run2,
      rescanOutput((s) =>
        s.index === 3
          ? { ...s, title: { value: 'Low Orbit II', confidence: 0.7 } }
          : s,
      ),
    );
    const s = spine(spineIds[3]);
    expect(s.state).toBe('active');
    const title = fieldOf(s.id, 'title');
    expect(title).toMatchObject({
      value: 'Low Orbit II',
      ai_value: 'Low Orbit II',
      confidence: 0.7,
      edit_base_ai_value: null,
    });
    // Every spine found again keeps its id (D-13).
    for (const id of spineIds) expect(spine(id).state).toBe('active');
  });

  it("an edited field keeps the owner's value and takes the new ai_value", async () => {
    const { photoId, spineIds } = await firstRun();
    const original = layout.spines[1].title;
    updateSpineField(spineIds[1], 'title', 'Owner title');
    const run2 = parsingRun(photoId, 2);
    const detections = persist(
      run2,
      rescanOutput((s) =>
        s.index === 1
          ? { ...s, title: { value: 'Glass Rivers (Live)', confidence: 0.6 } }
          : s,
      ),
    );
    const s = spine(spineIds[1]);
    expect(s.current_detection_id).toBe(detections[1].id);
    expect(fieldOf(s.id, 'title')).toMatchObject({
      value: 'Owner title',
      ai_value: 'Glass Rivers (Live)',
      confidence: 0.6,
      edit_base_ai_value: original,
    });
  });

  it('an edit that now equals the new read clears its edit base', async () => {
    const { photoId, spineIds } = await firstRun();
    updateSpineField(spineIds[1], 'title', 'Glass Rivers (Live)');
    persist(
      parsingRun(photoId, 2),
      rescanOutput((s) =>
        s.index === 1
          ? { ...s, title: { value: 'Glass Rivers (Live)', confidence: 0.9 } }
          : s,
      ),
    );
    expect(fieldOf(spineIds[1], 'title')).toMatchObject({
      value: 'Glass Rivers (Live)',
      ai_value: 'Glass Rivers (Live)',
      edit_base_ai_value: null,
    });
  });

  it('an unmatched old spine is orphaned with edits and superseded without', async () => {
    const { photoId, run1, detections, spineIds } = await firstRun();
    updateSpineField(spineIds[4], 'artist', 'Owner artist');
    persist(
      parsingRun(photoId, 2),
      rescanOutput((s) => (s.index === 4 || s.index === 5 ? null : s)),
    );
    const orphan = spine(spineIds[4]);
    expect(orphan.state).toBe('orphaned');
    // Old crop and detection kept.
    expect(orphan.current_detection_id).toBe(detections[4].id);
    expect(fieldOf(orphan.id, 'artist').value).toBe('Owner artist');
    const gone = spine(spineIds[5]);
    expect(gone.state).toBe('superseded');
    expect(gone.current_detection_id).toBe(detections[5].id);
    // D-13: run 1's detections still point at their spines.
    const run1Rows = getDb()
      .$client.prepare(
        'SELECT COUNT(*) AS n FROM spine_detections WHERE run_id = ? AND spine_id IS NOT NULL',
      )
      .get(run1) as { n: number };
    expect(run1Rows.n).toBe(layout.spines.length);
  });

  it('an unmatched new detection becomes an active spine created by the run', async () => {
    const { photoId, spineIds } = await firstRun();
    const base = structuredOutputFor(layout).spines[0];
    const fresh: SpineOut = {
      ...base,
      bbox: [40, 520, 700, 600],
      raw_text: { value: 'Marlow Reed - Salt and Ember', confidence: 0.9 },
      artist: { value: 'Marlow Reed', confidence: 0.9 },
    };
    const run2 = parsingRun(photoId, 2);
    const detections = persist(
      run2,
      rescanOutput((s) => s, [fresh]),
    );
    const created = spineByDetection(detections[detections.length - 1].id);
    expect(spineIds).not.toContain(created.id);
    expect(created.state).toBe('active');
    expect(created.created_run_id).toBe(run2);
    expect(fieldOf(created.id, 'artist')).toMatchObject({
      value: 'Marlow Reed',
      ai_value: 'Marlow Reed',
    });
    const run = getDb()
      .$client.prepare('SELECT status, cd_count FROM vision_runs WHERE id = ?')
      .get(run2) as { status: string; cd_count: number };
    expect(run).toEqual({ status: 'done', cd_count: layout.spines.length + 1 });
  });

  it('an orphaned spine found again returns to active with its edits', async () => {
    const { photoId, spineIds } = await firstRun();
    updateSpineField(spineIds[4], 'artist', 'Owner artist');
    persist(
      parsingRun(photoId, 2),
      rescanOutput((s) => (s.index === 4 ? null : s)),
    );
    expect(spine(spineIds[4]).state).toBe('orphaned');

    const run3 = parsingRun(photoId, 3);
    const detections = persist(
      run3,
      rescanOutput((s) => s),
    );
    const back = spine(spineIds[4]);
    expect(back.state).toBe('active');
    expect(back.current_detection_id).toBe(detections[4].id);
    expect(fieldOf(back.id, 'artist')).toMatchObject({
      value: 'Owner artist',
      ai_value: layout.spines[4].artist,
    });
    const active = getDb()
      .$client.prepare(
        "SELECT COUNT(*) AS n FROM spines WHERE photo_id = ? AND state = 'active'",
      )
      .get(photoId) as { n: number };
    expect(active.n).toBe(layout.spines.length);
  });
});
