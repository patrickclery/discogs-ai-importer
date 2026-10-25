// Demo read model: pure builders over (state, now) that mirror the real
// listPhotos / getSpines / status responses (src/server/scan/queries.ts,
// src/app/api/status/route.ts). Every rule that decides what a card shows
// comes from the pure src/lib functions the real read model uses.
import { eligibilityOf, isCurrentBulkItem } from '@/lib/bulk-eligibility';
import type { BulkItemDto, BulkRunDto } from '@/lib/bulk-types';
import { isFallbackSpine, lookupOf, summarizeRun } from '@/lib/bulk-view';
import {
  type CandidateDto,
  INLINE_CANDIDATES,
  type SearchFailure,
  type SearchState,
  type SpineDiscogsDto,
} from '@/lib/discogs-types';
import {
  canChangeMatchOf,
  canRetryOf,
  type ImportDto,
  type ImportFailure,
  type ImportStatus,
  importPhaseOf,
  type ReviewStatus,
} from '@/lib/import-types';
import { distinctFallback } from '@/lib/pressing';
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
import type {
  DemoBulkItem,
  DemoCandidate,
  DemoImport,
  DemoPhoto,
  DemoPhotoRun,
  DemoSearch,
  DemoSpine,
  DemoState,
} from './store';

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

// ---------------------------------------------------------------------------
// Discogs search summary (mirrors src/server/discogs/queries.ts
// discogsForSpines: searchStateOf, orderCandidates, fieldsChangedSince).

/** Longest search input in code points (src/server/discogs/inputs.ts). */
const MAX_INPUT_CODE_POINTS = 200;
/** Owner-facing failure reasons are cut to this many code points. */
const REASON_MAX = 160;

function capCodePoints(s: string, max: number): string {
  const points = Array.from(s);
  return points.length > max ? points.slice(0, max).join('') : s;
}

/** normalizeInput from inputs.ts: NFC, collapse whitespace, trim, cap. */
function normalizeInput(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null;
  const collapsed = v.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (!collapsed) return null;
  const capped = capCodePoints(collapsed, MAX_INPUT_CODE_POINTS).trim();
  return capped || null;
}

export type DemoSearchInputs = NonNullable<DemoSearch['inputs']>;

/** A spine's current search inputs (searchInputs from inputs.ts). */
export function searchInputsOf(spine: DemoSpine): DemoSearchInputs {
  const value = (field: string) =>
    spine.fields.find((f) => f.field === field)?.value ?? null;
  return {
    artist: normalizeInput(value('artist')),
    title: normalizeInput(value('title')),
    catno: normalizeInput(value('catalog_number')),
    rawText: normalizeInput(value('raw_text')),
  };
}

/** Both inputs normalize to the same search (fieldsChangedSince). */
export function sameInputs(a: DemoSearchInputs, b: DemoSearchInputs): boolean {
  return (
    normalizeInput(a.artist) === b.artist &&
    normalizeInput(a.title) === b.title &&
    normalizeInput(a.catno) === b.catno &&
    normalizeInput(a.rawText) === b.rawText
  );
}

const byNewest =
  <T extends { id: string }>(at: (x: T) => number) =>
  (a: T, b: T): number =>
    at(b) - at(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/** The spine's latest auto or again search that exists at `now`. */
export function latestAutoSearch(
  state: DemoState,
  spineId: string,
  now: number,
): DemoSearch | null {
  const list = state.searches
    .filter(
      (s) =>
        s.spineId === spineId &&
        (s.kind === 'auto' || s.kind === 'again') &&
        s.queuedAt <= now,
    )
    .sort(byNewest((s) => s.queuedAt));
  return list[0] ?? null;
}

/** A search's state at `now` from its timestamps and outcome. */
export function searchStateAt(
  search: DemoSearch | null,
  now: number,
): { state: SearchState; failure: SearchFailure | null } {
  if (!search) return { state: 'not_searched', failure: null };
  if (now < search.runningAt) return { state: 'queued', failure: null };
  if (now < search.readyAt) return { state: 'searching', failure: null };
  switch (search.outcome) {
    case 'done':
      return { state: 'done', failure: null };
    case 'failed':
      return {
        state: 'failed',
        failure: search.failure ?? { kind: 'other', reason: null },
      };
    default:
      return { state: 'no_match', failure: null };
  }
}

/** The candidate row exists at `now`: added, and not yet replaced. */
export function candidateListedAt(c: DemoCandidate, now: number): boolean {
  return c.addedAt <= now && (c.removedAt == null || c.removedAt > now);
}

function toCandidateDto(c: DemoCandidate): CandidateDto {
  return {
    id: c.id,
    releaseId: c.releaseId,
    title: c.title,
    year: c.year,
    country: c.country,
    labels: [...c.labels],
    catno: c.catno,
    formats: c.formats.map((f) => ({
      ...f,
      descriptions: [...f.descriptions],
    })),
    // Every recorded release has a generated cover (D-08).
    hasThumb: true,
    source: c.source,
    catnoMatch: c.catnoMatch,
    stage: c.stage,
  };
}

/**
 * A spine's stored candidates at `now` in D-10 order (orderCandidates):
 * manual newest first, then exact-catno matches, then Discogs order;
 * deduped by release id, a manual row winning.
 */
export function candidatesOf(
  state: DemoState,
  spineId: string,
  now: number,
): CandidateDto[] {
  // A bulk lookup's 'pressing' candidate is never listed (D-02): only the
  // import points at it.
  const rows = state.candidates.filter(
    (c) =>
      c.spineId === spineId &&
      c.source !== 'pressing' &&
      candidateListedAt(c, now),
  );
  const manual = rows
    .filter((c) => c.source === 'manual')
    .sort(byNewest((c) => c.addedAt));
  const auto = rows
    .filter((c) => c.source !== 'manual')
    .sort(
      (a, b) =>
        Number(b.catnoMatch) - Number(a.catnoMatch) ||
        a.rank - b.rank ||
        (a.id < b.id ? -1 : 1),
    );
  const seen = new Set<number>();
  const out: CandidateDto[] = [];
  for (const c of [...manual, ...auto]) {
    if (seen.has(c.releaseId)) continue;
    seen.add(c.releaseId);
    out.push(toCandidateDto(c));
  }
  return out;
}

/** The spine's search summary at `now` (discogsForSpines). */
export function discogsOf(
  state: DemoState,
  spine: DemoSpine,
  now: number,
): SpineDiscogsDto {
  const candidates = candidatesOf(state, spine.id, now);
  const latest = latestAutoSearch(state, spine.id, now);
  let { state: searchState, failure } = searchStateAt(latest, now);
  if (
    candidates.length > 0 &&
    (searchState === 'not_searched' || searchState === 'no_match')
  ) {
    searchState = 'done';
  }
  if (candidates.length === 0 && searchState === 'done') {
    searchState = 'no_match';
  }
  return {
    state: searchState,
    candidateCount: candidates.length,
    topCandidates: candidates.slice(0, INLINE_CANDIDATES),
    failure,
    fieldsChanged:
      latest?.inputs != null &&
      !sameInputs(latest.inputs, searchInputsOf(spine)),
  };
}

// ---------------------------------------------------------------------------
// Import summary (mirrors src/server/imports/queries.ts toImportDto).

/** The spine's latest import that exists at `now` (cancelled ones are gone). */
export function latestImport(
  state: DemoState,
  spineId: string,
  now: number,
): DemoImport | null {
  const list = state.imports
    .filter(
      (i) =>
        i.spineId === spineId &&
        i.outcome !== 'cancelled' &&
        i.createdAt <= now,
    )
    .sort(byNewest((i) => i.createdAt));
  return list[0] ?? null;
}

/** The imports row and its job as the real read model would see them. */
export function importRowAt(
  imp: DemoImport,
  now: number,
): { status: ImportStatus; intentAt: number | null; jobStatus: string } {
  if (imp.runningAt === null || now < imp.runningAt) {
    return { status: 'pending', intentAt: null, jobStatus: 'queued' };
  }
  if (imp.readyAt === null || now < imp.readyAt) {
    return {
      status: 'importing',
      intentAt: imp.intentAt ?? imp.runningAt,
      jobStatus: 'running',
    };
  }
  if (imp.outcome === 'cancelled') {
    return { status: 'failed', intentAt: imp.intentAt, jobStatus: 'cancelled' };
  }
  return {
    status: imp.outcome,
    intentAt: imp.intentAt,
    jobStatus: imp.outcome === 'failed' ? 'failed' : 'succeeded',
  };
}

/** A folder's label (collectionFolderName). */
export function folderNameOf(state: DemoState, id: number): string {
  const f = state.account.folders.find((x) => x.id === id);
  if (f) return f.name;
  return id === 1 ? 'Uncategorized' : `Folder ${id}`;
}

function importFailureOf(imp: DemoImport, status: ImportStatus): ImportFailure {
  const kind =
    imp.errorKind ??
    (status === 'pending' || status === 'importing' ? 'interrupted' : 'other');
  const text = imp.error?.trim();
  return {
    kind,
    reason: kind === 'other' && text ? capCodePoints(text, REASON_MAX) : null,
  };
}

/** The spine's latest import as the card sees it at `now`, or null. */
export function importOf(
  state: DemoState,
  spine: DemoSpine,
  now: number,
): ImportDto | null {
  const imp = latestImport(state, spine.id, now);
  if (!imp) return null;
  const row = importRowAt(imp, now);
  const phase = importPhaseOf(row);
  const candidateExists =
    imp.candidateId !== null &&
    state.candidates.some(
      (c) =>
        c.id === imp.candidateId &&
        c.spineId === spine.id &&
        candidateListedAt(c, now),
    );
  const done = row.status === 'imported';
  const copies = [...(state.collection[imp.releaseId] ?? [])].sort(
    (a, b) => a.instanceId - b.instanceId,
  );
  const first = copies[0];
  return {
    id: imp.id,
    phase,
    releaseId: imp.releaseId,
    candidateId: candidateExists ? imp.candidateId : null,
    candidate: structuredClone(imp.snapshot),
    hasThumb: candidateExists,
    folderId: imp.folderId,
    folderName: folderNameOf(state, imp.folderId),
    instanceId: done ? imp.instanceId : null,
    linked: done && imp.linked,
    adopted: false,
    importedAt: done ? imp.readyAt : null,
    existing:
      phase === 'already_in_collection' && first
        ? {
            count: copies.length,
            folderId: first.folderId,
            folderName: folderNameOf(state, first.folderId),
            dateAdded: first.dateAdded,
          }
        : null,
    failure: phase === 'failed' ? importFailureOf(imp, row.status) : null,
    canChangeMatch: canChangeMatchOf({
      phase,
      intentAt: row.intentAt,
      errorKind: imp.errorKind,
      jobStatus: row.jobStatus,
    }),
    canRetry: canRetryOf(phase),
    checking: false,
  };
}

// ---------------------------------------------------------------------------
// Bulk items (D-17): queued until lookupAt, running until readyAt, then the
// status decided when the run started.

/** A demo bulk item's phase at `now`: finding until its readyAt. */
export function bulkItemPhaseAt(
  item: DemoBulkItem,
  now: number,
): 'finding' | DemoBulkItem['status'] {
  return now < item.readyAt ? 'finding' : item.status;
}

/** The spine has a bulk item whose pressing is still being found. */
export function bulkFindingFor(
  state: DemoState,
  spineId: string,
  now: number,
): boolean {
  return state.bulkItems.some(
    (i) =>
      i.spineId === spineId &&
      i.createdAt <= now &&
      bulkItemPhaseAt(i, now) === 'finding',
  );
}

/**
 * The spine's current bulk item at `now` (bulkForSpines): its newest item,
 * dropped once a newer import (a manual one) replaced it. Its outcome,
 * release, country and import show only once it resolved.
 */
function bulkItemOf(
  state: DemoState,
  spine: Pick<SpineDto, 'id' | 'photoId'>,
  now: number,
): BulkItemDto | null {
  const item = state.bulkItems
    .filter((i) => i.spineId === spine.id && i.createdAt <= now)
    .sort(byNewest((i) => i.createdAt))[0];
  if (!item) return null;
  const phase = bulkItemPhaseAt(item, now);
  const resolved = phase === 'resolved';
  const importId = resolved ? item.importId : null;
  const latest = latestImport(state, spine.id, now);
  if (
    !isCurrentBulkItem(
      { id: item.id, importId, createdAt: item.createdAt },
      latest ? { id: latest.id, createdAt: latest.createdAt } : null,
    )
  ) {
    return null;
  }
  const run = state.bulkRuns.find((r) => r.id === item.runId);
  let skip: BulkItemDto['skip'] = null;
  if (phase === 'skipped' && item.skipReason !== null) {
    const holder =
      item.dupSpineId === null
        ? null
        : (state.spines.find((s) => s.id === item.dupSpineId) ?? null);
    const photo = holder
      ? (state.photos.find((p) => p.id === holder.photoId) ?? null)
      : null;
    skip = {
      reason: item.skipReason,
      photo: photo?.filename ?? null,
      spineNumber: holder ? holder.index + 1 : null,
      samePhoto: holder !== null && holder.photoId === spine.photoId,
    };
  }
  return {
    id: item.id,
    runId: item.runId,
    phase,
    preferredCountry: run?.country ?? state.account.preferredCountry,
    fallbackCountry: run
      ? run.fallbackCountry
      : distinctFallback(
          state.account.preferredCountry,
          state.account.fallbackCountry,
        ),
    outcome: resolved ? item.outcome : null,
    releaseId: resolved ? item.releaseId : null,
    country: resolved ? item.country : null,
    importId,
    skip,
    failure: null,
    createdAt: item.createdAt,
  };
}

/** The newest demo bulk run at `now`, summarized (latestBulkRun). */
export function latestBulkRunAt(
  state: DemoState,
  now: number,
): BulkRunDto | null {
  const run = state.bulkRuns
    .filter((r) => r.createdAt <= now)
    .sort(byNewest((r) => r.createdAt))[0];
  if (!run) return null;
  return summarizeRun(
    {
      id: run.id,
      country: run.country,
      folderName: folderNameOf(state, run.folderId),
      createdAt: run.createdAt,
      openLookups: state.bulkItems.filter(
        (i) => bulkItemPhaseAt(i, now) === 'finding',
      ).length,
    },
    state.bulkItems
      .filter((i) => i.runId === run.id)
      .map((i) => {
        const phase = bulkItemPhaseAt(i, now);
        const imp =
          phase === 'resolved' && i.importId !== null
            ? state.imports.find(
                (x) => x.id === i.importId && x.outcome !== 'cancelled',
              )
            : undefined;
        return {
          phase,
          skipReason: phase === 'skipped' ? i.skipReason : null,
          country: phase === 'resolved' ? i.country : null,
          hasImport: imp !== undefined,
          importPhase: imp ? importPhaseOf(importRowAt(imp, now)) : null,
        };
      }),
  );
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
    discogs: discogsOf(state, s, now),
    import: importOf(state, s, now),
    notOnDiscogs: s.notOnDiscogs,
    reviewStatus: null,
    bulk: null,
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
  opts: {
    photoId?: string;
    review?: boolean;
    status?: ReviewStatus;
    fallback?: boolean;
  } = {},
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
  const bulk = latestBulkRunAt(state, now);
  let discogsActive = bulk?.running === true;
  for (const s of listed) {
    const item = bulkItemOf(state, s, now);
    s.bulk = { ...eligibilityOf(s, item), item };
    if (item?.phase === 'finding') discogsActive = true;
    const status = reviewStatusOf({
      importPhase: s.import?.phase ?? null,
      importInstanceId: s.import?.instanceId ?? null,
      notOnDiscogs: s.notOnDiscogs,
      searchState: s.discogs?.state ?? null,
      candidateCount: s.discogs?.candidateCount ?? 0,
      lookup: lookupOf(item),
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
      (!opts.review || flagged.has(s.id)) &&
      (!opts.fallback || isFallbackSpine(s)),
  );
  const filtered =
    opts.review || opts.status !== undefined || opts.fallback === true;
  const withSpines = new Set(spines.map((s) => s.photoId));
  const photos = filtered ? scoped.filter((p) => withSpines.has(p.id)) : scoped;
  const { account } = state;
  const folder = account.folders.find((f) => f.id === account.folderId);
  return {
    photos,
    spines,
    photoOptions,
    counts: {
      all: listed.length,
      needsReview: flagged.size,
      byStatus,
      fallback: listed.filter(isFallbackSpine).length,
    },
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
      preferredCountry: account.preferredCountry,
      fallbackCountry: account.fallbackCountry,
    },
    bulk,
  };
}

function laneCounts(): Record<StatusJobStatus, number> {
  return { queued: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0 };
}

/** A search's or import's job status at `now` (queued, running, ended). */
function jobStatusAt(
  start: number,
  runningAt: number | null,
  readyAt: number | null,
  failed: boolean,
  cancelled: boolean,
  now: number,
): StatusJobStatus | null {
  if (now < start) return null;
  if (cancelled) return 'cancelled';
  if (runningAt === null || now < runningAt) return 'queued';
  if (readyAt === null || now < readyAt) return 'running';
  return failed ? 'failed' : 'succeeded';
}

/**
 * Mirrors GET /api/status: a running simulated worker, the scan and
 * Discogs lane job counts, and the Discogs part with discogsStatus()'s
 * definitions (src/server/discogs/status.ts).
 */
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
  let importsLeft = 0;
  for (const s of state.searches) {
    const job = jobStatusAt(
      s.queuedAt,
      s.runningAt,
      s.readyAt,
      s.outcome === 'failed',
      false,
      now,
    );
    if (job) jobs.discogs[job] += 1;
  }
  for (const i of state.imports) {
    const job = jobStatusAt(
      i.createdAt,
      i.runningAt,
      i.readyAt,
      i.outcome === 'failed',
      i.outcome === 'cancelled',
      now,
    );
    if (job) jobs.discogs[job] += 1;
    if (job === 'queued' || job === 'running') importsLeft += 1;
  }
  // A bulk lookup is a Discogs-lane job: queued until lookupAt, running
  // until readyAt, then succeeded. A finding item is an import still left.
  for (const b of state.bulkItems) {
    const job = jobStatusAt(
      b.createdAt,
      b.lookupAt,
      b.readyAt,
      false,
      false,
      now,
    );
    if (job) jobs.discogs[job] += 1;
    if (job === 'queued' || job === 'running') importsLeft += 1;
  }
  // Active or orphaned spines, as the real queries join on spines.state.
  const photoIds = new Set(state.photos.map((p) => p.id));
  const spines = state.spines.filter(
    (s) =>
      (s.state === 'active' || s.state === 'orphaned') &&
      isVisible(s, now) &&
      photoIds.has(s.photoId),
  );
  let failedSpines = 0;
  let importsFailed = 0;
  for (const s of spines) {
    const latest = latestAutoSearch(state, s.id, now);
    if (searchStateAt(latest, now).state === 'failed') failedSpines += 1;
    if (!s.notOnDiscogs && importOf(state, s, now)?.phase === 'failed') {
      importsFailed += 1;
    }
  }
  return {
    worker: { bootId: 'demo', startedAt: state.initAt, starts: 1, pid: 0 },
    jobs,
    lease: null,
    discogs: {
      connected: state.account.connected && !state.account.needsReconnect,
      backlog: jobs.discogs.queued + jobs.discogs.running,
      pausedUntil: null,
      failedSpines,
      imports: { left: importsLeft, failed: importsFailed },
    },
  };
}
