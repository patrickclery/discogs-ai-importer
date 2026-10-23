// Demo read model: pure builders over (state, now) that mirror the real
// listPhotos / getSpines / status responses (src/server/scan/queries.ts,
// src/app/api/status/route.ts). Every rule that decides what a card shows
// comes from the pure src/lib functions the real read model uses.
import type { SearchState } from '@/lib/discogs-types';
import type { ReviewStatus } from '@/lib/import-types';
import { emptyByStatus, reviewStatusOf } from '@/lib/review-status';
import type {
  PhotoDto,
  PhotoOption,
  PhotoStatus,
  PhotosResponse,
  SpineDto,
  SpineFieldDto,
  SpinesResponse,
} from '@/lib/scan-types';
import { needsReview } from '@/lib/spine-review';
import type {
  StatusJobStatus,
  StatusLane,
  StatusResponse,
} from '@/lib/status-types';
import {
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_DENSITY_MAX_SPINES,
  SPINE_FIELDS,
} from '@/lib/vision-contract';
import type { DemoPhoto, DemoPhotoRun, DemoSpine, DemoState } from './store';

const TRUNCATED_RATIO = 0.8;

// The real labels live in src/server/settings.ts (server-only); keep in step.
const MODEL_LABELS: Record<string, string> = {
  'claude-opus-5-5': 'Claude Opus 5.5',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5',
};

/** A committed demo asset under the basePath (RESEARCH Pitfall 7). */
export function demoAssetUrl(file: string | null): string | null {
  if (!file) return null;
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/demo-assets/${file}`;
}

function latestRun(photo: DemoPhoto): DemoPhotoRun | null {
  return photo.runs.length > 0 ? photo.runs[photo.runs.length - 1] : null;
}

/** A run's status at `now`, from its timestamps. */
export function runStatusAt(
  run: DemoPhotoRun | null,
  now: number,
): PhotoStatus {
  if (!run || now < run.preparingAt) return 'queued';
  if (now < run.callingAt) return 'preparing';
  if (now < run.parsingAt) return 'calling';
  if (now < run.doneAt) return 'parsing';
  return run.outcome;
}

function isVisible(s: DemoSpine, now: number): boolean {
  return s.visibleAt <= now;
}

function toPhotoDto(state: DemoState, photo: DemoPhoto, now: number): PhotoDto {
  const run = latestRun(photo);
  const status = runStatusAt(run, now);
  const finished = run !== null && now >= run.doneAt;
  const spineCount = state.spines.filter(
    (s) => s.photoId === photo.id && s.state === 'active' && isVisible(s, now),
  ).length;
  const detectedCount = status === 'done' ? spineCount : null;
  return {
    id: photo.id,
    filename: photo.filename,
    createdAt: photo.createdAt,
    status,
    runNo: run?.runNo ?? 1,
    model: photo.model,
    modelLabel: MODEL_LABELS[photo.model] ?? photo.model,
    spawnedAt: run !== null && now >= run.callingAt ? run.callingAt : null,
    finishedAt: finished && run ? run.doneAt : null,
    errorReason: status === 'error' ? (run?.errorReason ?? null) : null,
    spineCount,
    spineCountEstimate: photo.spineCountEstimate,
    detectedCount,
    truncated:
      status === 'done' &&
      detectedCount !== null &&
      photo.spineCountEstimate !== null &&
      detectedCount < TRUNCATED_RATIO * photo.spineCountEstimate,
    densityFlags: [...photo.densityFlags],
    thumbUrl: demoAssetUrl(photo.thumbFile),
    visionUrl: demoAssetUrl(photo.visionFile),
    hasEarlierScan: photo.runs.some(
      (r) =>
        run !== null &&
        r.runNo < run.runNo &&
        r.outcome === 'done' &&
        now >= r.doneAt,
    ),
  };
}

/** Every photo, newest first (listPhotos order: created_at DESC, id DESC). */
function sortedPhotos(state: DemoState): DemoPhoto[] {
  return [...state.photos].sort(
    (a, b) =>
      b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
  );
}

export function buildPhotosResponse(
  state: DemoState,
  now: number,
): PhotosResponse {
  return { photos: sortedPhotos(state).map((p) => toPhotoDto(state, p, now)) };
}

function toSpineDto(state: DemoState, s: DemoSpine, now: number): SpineDto {
  const byField = new Map(s.fields.map((f) => [f.field, f]));
  const fields: SpineFieldDto[] = SPINE_FIELDS.map((field) => {
    const f = byField.get(field);
    return f
      ? { ...f }
      : {
          field,
          aiValue: null,
          value: null,
          confidence: 0,
          editBaseAiValue: null,
        };
  });
  let orphanedRunNo: number | null = null;
  if (s.state === 'orphaned') {
    const photo = state.photos.find((p) => p.id === s.photoId);
    const runs = (photo?.runs ?? [])
      .filter(
        (r) =>
          r.outcome === 'done' && now >= r.doneAt && r.runNo > s.createdRunNo,
      )
      .map((r) => r.runNo);
    orphanedRunNo = runs.length > 0 ? Math.min(...runs) : null;
  }
  const url = demoAssetUrl(s.crop?.file ?? null);
  return {
    id: s.id,
    photoId: s.photoId,
    index: s.index,
    state: s.state,
    legibility: s.legibility,
    crop:
      url && s.crop
        ? { url, width: s.crop.width, height: s.crop.height }
        : null,
    fields,
    createdRunId: `${s.photoId}-run-${s.createdRunNo}`,
    orphanedRunNo,
    mediaKind: s.mediaKind,
    // Filled by the Discogs and import read model (plan 05-03).
    discogs: null,
    import: null,
    notOnDiscogs: s.notOnDiscogs,
    reviewStatus: null,
  };
}

/**
 * Listed spines (listSpines order): photos newest first; within a photo the
 * active spines in index order, then the orphaned ones. Only spines whose
 * visibleAt has passed are listed.
 */
function listedSpines(
  state: DemoState,
  now: number,
  photoId: string | undefined,
): SpineDto[] {
  const photoRank = new Map(sortedPhotos(state).map((p, i) => [p.id, i]));
  return state.spines
    .filter(
      (s) =>
        (s.state === 'active' || s.state === 'orphaned') &&
        isVisible(s, now) &&
        photoRank.has(s.photoId) &&
        (photoId === undefined || s.photoId === photoId),
    )
    .sort(
      (a, b) =>
        (photoRank.get(a.photoId) ?? 0) - (photoRank.get(b.photoId) ?? 0) ||
        (a.state === 'active' ? 0 : 1) - (b.state === 'active' ? 0 : 1) ||
        a.index - b.index ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .map((s) => toSpineDto(state, s, now));
}

const ACTIVE_SEARCH_STATES: readonly SearchState[] = ['queued', 'searching'];

/** Mirrors getSpines() in src/server/scan/queries.ts. */
export function buildSpinesResponse(
  state: DemoState,
  now: number,
  opts: { photoId?: string; review?: boolean; status?: ReviewStatus } = {},
): SpinesResponse {
  const all = buildPhotosResponse(state, now).photos;
  const photoOptions: PhotoOption[] = all.map(({ id, filename, status }) => ({
    id,
    filename,
    status,
  }));
  const scoped = opts.photoId ? all.filter((p) => p.id === opts.photoId) : all;
  const listed =
    scoped.length === 0 ? [] : listedSpines(state, now, opts.photoId);
  const byStatus = emptyByStatus();
  const statusById: Record<string, ReviewStatus> = {};
  const photoProgress: Record<string, { imported: number; total: number }> = {};
  let discogsActive = false;
  for (const s of listed) {
    const status = reviewStatusOf({
      importPhase: s.import?.phase ?? null,
      importInstanceId: s.import?.instanceId ?? null,
      notOnDiscogs: s.notOnDiscogs,
      searchState: s.discogs?.state ?? null,
      candidateCount: s.discogs?.candidateCount ?? 0,
    });
    s.reviewStatus = status;
    byStatus[status] += 1;
    statusById[s.id] = status;
    const progress = photoProgress[s.photoId] ?? { imported: 0, total: 0 };
    progress.total += 1;
    if (status === 'imported') progress.imported += 1;
    photoProgress[s.photoId] = progress;
    if (
      s.import?.phase === 'waiting' ||
      s.import?.phase === 'importing' ||
      (s.discogs !== null && ACTIVE_SEARCH_STATES.includes(s.discogs.state))
    ) {
      discogsActive = true;
    }
  }
  const confidenceThreshold = DEFAULT_CONFIDENCE_THRESHOLD;
  const flagged = new Set(
    listed.filter((s) => needsReview(s, confidenceThreshold)).map((s) => s.id),
  );
  const spines = listed.filter(
    (s) =>
      (opts.status === undefined || s.reviewStatus === opts.status) &&
      (!opts.review || flagged.has(s.id)),
  );
  const filtered = opts.review || opts.status !== undefined;
  const withSpines = new Set(spines.map((s) => s.photoId));
  const photos = filtered ? scoped.filter((p) => withSpines.has(p.id)) : scoped;
  const { account } = state;
  const folder = account.folders.find((f) => f.id === account.folderId);
  return {
    photos,
    spines,
    photoOptions,
    counts: { all: listed.length, needsReview: flagged.size, byStatus },
    statusById,
    photoProgress,
    confidenceThreshold,
    densityMaxSpines: DEFAULT_DENSITY_MAX_SPINES,
    discogsActive,
    discogs: {
      connected: account.connected && !account.needsReconnect,
      needsReconnect: account.connected && account.needsReconnect,
      pausedUntil: null,
      folder: {
        id: account.folderId,
        name: folder?.name ?? 'Uncategorized',
      },
    },
  };
}

function laneCounts(): Record<StatusJobStatus, number> {
  return { queued: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0 };
}

/** Mirrors GET /api/status: a running simulated worker, scan lane counts. */
export function buildStatusResponse(
  state: DemoState,
  now: number,
): StatusResponse {
  const jobs: Record<StatusLane, Record<StatusJobStatus, number>> = {
    anthropic: laneCounts(),
    discogs: laneCounts(),
  };
  for (const photo of state.photos) {
    for (const run of photo.runs) {
      const status = runStatusAt(run, now);
      if (status === 'queued') jobs.anthropic.queued += 1;
      else if (status === 'done') jobs.anthropic.succeeded += 1;
      else if (status === 'error') jobs.anthropic.failed += 1;
      else jobs.anthropic.running += 1;
    }
  }
  return {
    worker: { bootId: 'demo', startedAt: state.initAt, starts: 1, pid: 0 },
    jobs,
    lease: null,
    discogs: {
      connected: state.account.connected && !state.account.needsReconnect,
      backlog: 0,
      pausedUntil: null,
      failedSpines: 0,
      imports: { left: 0, failed: 0 },
    },
  };
}
