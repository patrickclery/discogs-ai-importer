import 'server-only';
import {
  DENSITY_FLAGS,
  type DensityFlag,
  type PhotoDto,
  type PhotoStatus,
} from '@/lib/scan-types';
import { getDb } from '../db/client';
import { VISION_MODELS } from '../settings';

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
