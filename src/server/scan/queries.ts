import 'server-only';
import {
  DENSITY_FLAGS,
  type DensityFlag,
  type PhotoDto,
  type PhotoStatus,
  type SpineDto,
  type SpineFieldDto,
  type SpineState,
  type SpinesResponse,
} from '@/lib/scan-types';
import { needsReview } from '@/lib/spine-review';
import {
  LEGIBILITY_LEVELS,
  type Legibility,
  SPINE_FIELDS,
  type SpineField,
} from '@/lib/vision-contract';
import { getDb } from '../db/client';
import {
  getConfidenceThreshold,
  getDensityThresholds,
  VISION_MODELS,
} from '../settings';

// Read models for the scan UI. Raw SQL with single-quoted literals (DQS=0).

type PhotoListRow = {
  id: string;
  original_name: string;
  thumb_path: string | null;
  created_at: number;
  status: PhotoStatus | null;
  run_no: number | null;
  model: string | null;
  spawned_at: number | null;
  finished_at: number | null;
  error_reason: string | null;
  spine_count_estimate: number | null;
  detected_count: number | null;
  density_flags: string | null;
  spine_count: number;
  vision_path: string | null;
  has_earlier_scan: number;
};

const TRUNCATED_RATIO = 0.8;

export function fileUrl(rel: string | null): string | null {
  return rel ? `/api/files/${rel}` : null;
}

function parseDensityFlags(json: string | null): DensityFlag[] {
  if (!json) return [];
  try {
    const raw: unknown = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    return raw.filter((f): f is DensityFlag =>
      (DENSITY_FLAGS as readonly unknown[]).includes(f),
    );
  } catch {
    return [];
  }
}

function modelLabel(model: string | null): string | null {
  if (!model) return null;
  return VISION_MODELS.find((m) => m.id === model)?.label ?? model;
}

function toPhotoDto(r: PhotoListRow): PhotoDto {
  const status = r.status ?? 'queued';
  return {
    id: r.id,
    filename: r.original_name,
    createdAt: r.created_at,
    status,
    runNo: r.run_no ?? 1,
    model: r.model,
    modelLabel: modelLabel(r.model),
    spawnedAt: r.spawned_at,
    finishedAt: r.finished_at,
    errorReason: r.error_reason,
    spineCount: r.spine_count,
    spineCountEstimate: r.spine_count_estimate,
    detectedCount: r.detected_count,
    truncated:
      status === 'done' &&
      r.detected_count !== null &&
      r.spine_count_estimate !== null &&
      r.detected_count < TRUNCATED_RATIO * r.spine_count_estimate,
    densityFlags: parseDensityFlags(r.density_flags),
    thumbUrl: fileUrl(r.thumb_path),
    visionUrl: fileUrl(r.vision_path),
    hasEarlierScan: r.has_earlier_scan === 1,
  };
}

const PHOTO_SELECT = `
  SELECT p.id, p.original_name, p.thumb_path, p.created_at,
    r.status, r.run_no, r.model, r.spawned_at, r.finished_at, r.error_reason,
    r.spine_count_estimate, r.detected_count, r.density_flags,
    (SELECT COUNT(*) FROM spines s
      WHERE s.photo_id = p.id AND s.state = 'active') AS spine_count,
    (SELECT v.vision_path FROM vision_runs v
      WHERE v.photo_id = p.id AND v.vision_path IS NOT NULL
      ORDER BY v.run_no DESC LIMIT 1) AS vision_path,
    EXISTS (SELECT 1 FROM vision_runs e
      WHERE e.photo_id = p.id AND e.status = 'done'
        AND e.run_no < COALESCE(r.run_no, 0)) AS has_earlier_scan
  FROM photos p
  LEFT JOIN vision_runs r ON r.id = p.latest_run_id`;

/** Every photo, newest first, with its latest run's status (INGEST-01). */
export function listPhotos(): PhotoDto[] {
  const rows = getDb()
    .$client.prepare(`${PHOTO_SELECT} ORDER BY p.created_at DESC, p.id DESC`)
    .all() as PhotoListRow[];
  return rows.map(toPhotoDto);
}

export function getPhoto(id: string): PhotoDto | null {
  const row = getDb()
    .$client.prepare(`${PHOTO_SELECT} WHERE p.id = ?`)
    .get(id) as PhotoListRow | undefined;
  return row ? toPhotoDto(row) : null;
}

type SpineListRow = {
  id: string;
  photo_id: string;
  state: SpineState;
  created_run_id: string | null;
  idx: number | null;
  legibility: string | null;
  crop_path: string | null;
  crop_w: number | null;
  crop_h: number | null;
  orphaned_run_no: number | null;
};

type SpineFieldListRow = {
  spine_id: string;
  field: SpineField;
  ai_value: string | null;
  value: string | null;
  confidence: number;
  edit_base_ai_value: string | null;
};

function toLegibility(v: string | null): Legibility | null {
  return (LEGIBILITY_LEVELS as readonly (string | null)[]).includes(v)
    ? (v as Legibility)
    : null;
}

/**
 * Spine DTOs for the spines matching `where` (a SQL condition over `s`, the
 * spines row, with named parameters), in `orderBy` order. Shared by the
 * /spines list and the orphan routes so every spine is shaped the same.
 * `orphaned_run_no` is the first finished run after the one that last found
 * the spine: the re-scan that orphaned it (D-16).
 */
export function loadSpineDtos(
  where: string,
  params: Record<string, unknown> = {},
  orderBy = 'p.created_at DESC, p.id DESC, d.idx, d.position, s.id',
): SpineDto[] {
  const db = getDb().$client;
  const rows = db
    .prepare(
      `SELECT s.id, s.photo_id, s.state, s.created_run_id,
         d.idx, d.legibility, d.crop_path, d.crop_w, d.crop_h,
         CASE WHEN s.state = 'orphaned' THEN (
           SELECT MIN(o.run_no) FROM vision_runs o
           WHERE o.photo_id = s.photo_id AND o.status = 'done'
             AND o.run_no > COALESCE(dr.run_no, 0)
         ) END AS orphaned_run_no
       FROM spines s
       JOIN photos p ON p.id = s.photo_id
       LEFT JOIN spine_detections d ON d.id = s.current_detection_id
       LEFT JOIN vision_runs dr ON dr.id = d.run_id
       WHERE ${where}
       ORDER BY ${orderBy}`,
    )
    .all(params) as SpineListRow[];
  if (rows.length === 0) return [];

  const fieldRows = db
    .prepare(
      `SELECT f.spine_id, f.field, f.ai_value, f.value, f.confidence,
         f.edit_base_ai_value
       FROM spine_fields f
       JOIN spines s ON s.id = f.spine_id
       WHERE ${where}`,
    )
    .all(params) as SpineFieldListRow[];
  const fieldsBySpine = new Map<string, Map<SpineField, SpineFieldDto>>();
  for (const f of fieldRows) {
    let m = fieldsBySpine.get(f.spine_id);
    if (!m) {
      m = new Map();
      fieldsBySpine.set(f.spine_id, m);
    }
    m.set(f.field, {
      field: f.field,
      aiValue: f.ai_value,
      value: f.value,
      confidence: f.confidence,
      editBaseAiValue: f.edit_base_ai_value,
    });
  }

  return rows.map((r) => {
    const m = fieldsBySpine.get(r.id);
    const url = fileUrl(r.crop_path);
    return {
      id: r.id,
      photoId: r.photo_id,
      index: r.idx ?? 0,
      state: r.state,
      legibility: toLegibility(r.legibility),
      crop:
        url && r.crop_w && r.crop_h
          ? { url, width: r.crop_w, height: r.crop_h }
          : null,
      fields: SPINE_FIELDS.map(
        (field) =>
          m?.get(field) ?? {
            field,
            aiValue: null,
            value: null,
            confidence: 0,
            editBaseAiValue: null,
          },
      ),
      createdRunId: r.created_run_id,
      orphanedRunNo: r.orphaned_run_no,
    };
  });
}

/** One spine in any state, or null. */
export function getSpineDto(id: string): SpineDto | null {
  return loadSpineDtos('s.id = @id', { id })[0] ?? null;
}

/**
 * Listed spines, grouped by photo (newest first). Within a photo the active
 * spines come first in Claude's index order (ties broken by array position,
 * VIS-01, VIS-02), then the orphaned ones (D-16). Superseded and dismissed
 * spines are never listed.
 */
export function listSpines(opts: { photoId?: string } = {}): SpineDto[] {
  const photoFilter = opts.photoId ? ' AND s.photo_id = @photoId' : '';
  return loadSpineDtos(
    `s.state IN ('active', 'orphaned')${photoFilter}`,
    opts.photoId ? { photoId: opts.photoId } : {},
    `p.created_at DESC, p.id DESC,
     CASE s.state WHEN 'active' THEN 0 ELSE 1 END, d.idx, d.position, s.id`,
  );
}

/** True only for the exact `?review=1` value (T-02-28). */
export function parseReviewParam(v: string | null | undefined): boolean {
  return v === '1';
}

/**
 * The /spines read model (REV-01, D-07): photos newest first (only `photoId`
 * when given; an unknown id yields no photos), their active spines in
 * detection order then their orphaned spines (D-16), and the counts the
 * filter bar shows. With `review`, only spines that need review are listed
 * (orphaned, or a non-empty unedited field below the threshold) and photos
 * without such spines are omitted. `counts` cover the photo filter and ignore
 * the review filter, so both toggle counts stay visible.
 */
export function getSpines(
  opts: { photoId?: string; review?: boolean } = {},
): SpinesResponse {
  const all = listPhotos();
  const photoOptions = all.map(({ id, filename, status }) => ({
    id,
    filename,
    status,
  }));
  const scoped = opts.photoId ? all.filter((p) => p.id === opts.photoId) : all;
  const listed =
    scoped.length === 0 ? [] : listSpines({ photoId: opts.photoId });
  const confidenceThreshold = getConfidenceThreshold();
  const flagged = listed.filter((s) => needsReview(s, confidenceThreshold));
  const spines = opts.review ? flagged : listed;
  const withSpines = new Set(spines.map((s) => s.photoId));
  const photos = opts.review
    ? scoped.filter((p) => withSpines.has(p.id))
    : scoped;
  return {
    photos,
    spines,
    photoOptions,
    counts: { all: listed.length, needsReview: flagged.length },
    confidenceThreshold,
    densityMaxSpines: getDensityThresholds().maxSpines,
  };
}
