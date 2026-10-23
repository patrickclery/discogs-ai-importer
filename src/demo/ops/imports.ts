// Demo import actions (D-09, D-14): add to collection with the local
// duplicate rule, Change match, Link existing copy, Add another copy,
// Retry and Retry all failed. They mirror src/server/imports/store.ts
// (createImport, cancelImport, linkExisting, addAnotherCopy, retrySpine)
// and the retry-failed route without importing them. An import gets
// createdAt/runningAt/readyAt and its outcome up front; the read model
// derives waiting -> importing -> imported (or already_in_collection)
// from now() with the real importPhaseOf (RESEARCH Pattern 3).
import {
  canChangeMatchOf,
  type DuplicateBody,
  type ExistingInstance,
  type ImportCandidateSnapshot,
  type ImportPhase,
  importPhaseOf,
} from '@/lib/import-types';
import {
  buildSpinesResponse,
  candidateListedAt,
  demoAssetUrl,
  discogsOf,
  importRowAt,
  latestImport,
} from '../read-model';
import {
  type DemoCandidate,
  type DemoImport,
  type DemoState,
  nextId,
} from '../store';
import {
  discogsReady,
  findSpine,
  importsOf,
  isListed,
  startSearchAgain,
} from './review';

/** The add starts this long after the confirm, and lands this long after. */
export const IMPORT_RUNNING_MS = 700;
export const IMPORT_READY_MS = 2200;
/** Instance numbers the demo hands out for new copies. */
const NEW_INSTANCE_BASE = 1_900_000_000;

function phaseAt(imp: DemoImport, now: number): ImportPhase {
  return importPhaseOf(importRowAt(imp, now));
}

function snapshotOf(c: DemoCandidate): ImportCandidateSnapshot {
  return {
    title: c.title,
    year: c.year,
    country: c.country,
    labels: [...c.labels],
    catno: c.catno,
    formats: structuredClone(c.formats),
  };
}

/** Discogs-style date_added for an epoch ms (UTC offset). */
function dateAddedOf(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

/** Folder counts follow the collection (the Settings folder picker). */
function recountFolders(state: DemoState): void {
  const copies = Object.values(state.collection).flat();
  state.account.folders = state.account.folders.map((f) => ({
    ...f,
    count: copies.filter((c) => c.folderId === f.id).length,
  }));
}

function addCopy(
  state: DemoState,
  releaseId: number,
  copy: ExistingInstance,
): void {
  const list = state.collection[releaseId] ?? [];
  list.push(copy);
  list.sort((a, b) => a.instanceId - b.instanceId);
  state.collection[releaseId] = list;
  recountFolders(state);
}

function removeCopy(
  state: DemoState,
  releaseId: number,
  instanceId: number,
): void {
  const list = (state.collection[releaseId] ?? []).filter(
    (c) => c.instanceId !== instanceId,
  );
  if (list.length > 0) state.collection[releaseId] = list;
  else delete state.collection[releaseId];
  recountFolders(state);
}

/** Copies some imports row records (imports.instance_id), except `exceptId`. */
function recordedInstances(state: DemoState, exceptId: string): Set<number> {
  const out = new Set<number>();
  for (const i of state.imports) {
    if (i.id === exceptId || i.outcome === 'cancelled') continue;
    if (i.instanceId !== null) out.add(i.instanceId);
  }
  return out;
}

/**
 * Puts the import (back) in line at `now`, as enqueueImport plus the
 * add_to_collection handler would run it: unless allowDuplicate, a copy
 * of the release that no import records holds it already_in_collection
 * (D-05); otherwise it lands as a new copy.
 */
function scheduleImport(state: DemoState, imp: DemoImport, now: number): void {
  if (imp.instanceId !== null && phaseAt(imp, now) !== 'imported') {
    removeCopy(state, imp.releaseId, imp.instanceId);
  }
  imp.runningAt = now + IMPORT_RUNNING_MS;
  imp.readyAt = now + IMPORT_READY_MS;
  imp.errorKind = null;
  imp.error = null;
  imp.linked = false;
  const recorded = recordedInstances(state, imp.id);
  const held = (state.collection[imp.releaseId] ?? []).filter(
    (c) => !recorded.has(c.instanceId),
  );
  if (!imp.allowDuplicate && held.length > 0) {
    // The hold happens before any POST: no intent is written.
    imp.outcome = 'already_in_collection';
    imp.intentAt = null;
    imp.instanceId = null;
    imp.existingCount = held.length;
    return;
  }
  state.seq += 1;
  imp.outcome = 'imported';
  imp.intentAt = imp.runningAt;
  imp.instanceId = NEW_INSTANCE_BASE + state.seq;
  addCopy(state, imp.releaseId, {
    instanceId: imp.instanceId,
    folderId: imp.folderId,
    dateAdded: dateAddedOf(imp.readyAt),
  });
}

/** Change match: the import is gone, and a copy it planned is too. */
function dropImport(state: DemoState, imp: DemoImport, now: number): void {
  if (imp.instanceId !== null && phaseAt(imp, now) !== 'imported') {
    removeCopy(state, imp.releaseId, imp.instanceId);
    imp.instanceId = null;
  }
  imp.outcome = 'cancelled';
}

// ---------------------------------------------------------------------------
// Add (createImport) and the local duplicate check (duplicateOf).

export type DuplicateOf = Omit<DuplicateBody, 'error' | 'message'>;

export type CreateImportResult =
  | { status: 'ok'; importId: string }
  | { status: 'not_found' }
  | { status: 'not_importable' }
  | { status: 'not_on_discogs' }
  | { status: 'already_confirmed' }
  | { status: 'retry_first' }
  | { status: 'no_candidate' }
  | ({ status: 'duplicate' } & DuplicateOf);

const HOLDS_RELEASE = new Set([
  'pending',
  'importing',
  'imported',
  'already_in_collection',
]);

/**
 * The oldest import of the same release held by another listed spine that
 * is pending, importing, imported or already_in_collection (D-04).
 */
function duplicateOf(
  state: DemoState,
  spineId: string,
  releaseId: number,
  now: number,
): DuplicateOf | null {
  const rows = state.imports
    .filter(
      (i) =>
        i.releaseId === releaseId &&
        i.spineId !== spineId &&
        i.outcome !== 'cancelled' &&
        i.createdAt <= now,
    )
    .sort(
      (a, b) =>
        a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  for (const i of rows) {
    const status = importRowAt(i, now).status;
    if (!HOLDS_RELEASE.has(status)) continue;
    const spine = findSpine(state, i.spineId, now);
    if (!spine || !isListed(spine)) continue;
    const photo = state.photos.find((p) => p.id === spine.photoId);
    if (!photo) continue;
    return {
      photo: photo.filename,
      spineNumber: spine.index + 1,
      cropUrl: demoAssetUrl(spine.crop?.file ?? null),
      done: status === 'imported',
    };
  }
  return null;
}

export function startImport(
  state: DemoState,
  input: { spineId: string; candidateId: string; allowDuplicate?: boolean },
  now: number,
): CreateImportResult {
  const spine = findSpine(state, input.spineId, now);
  if (!spine) return { status: 'not_found' };
  if (!isListed(spine)) return { status: 'not_importable' };
  if (spine.notOnDiscogs) return { status: 'not_on_discogs' };
  const rows = importsOf(state, spine.id, now);
  if (rows.some((i) => importRowAt(i, now).status !== 'failed')) {
    return { status: 'already_confirmed' };
  }
  // D-07: a failed add whose intent was written may have reached Discogs.
  const latest = latestImport(state, spine.id, now);
  if (
    latest &&
    importRowAt(latest, now).intentAt !== null &&
    latest.errorKind !== 'not_found' &&
    latest.errorKind !== 'rejected'
  ) {
    return { status: 'retry_first' };
  }
  const candidate = state.candidates.find(
    (c) =>
      c.id === input.candidateId &&
      c.spineId === spine.id &&
      candidateListedAt(c, now),
  );
  if (!candidate) return { status: 'no_candidate' };
  if (!input.allowDuplicate) {
    const other = duplicateOf(state, spine.id, candidate.releaseId, now);
    if (other) return { status: 'duplicate', ...other };
  }
  const imp: DemoImport = {
    id: nextId('demo-run-import'),
    spineId: spine.id,
    releaseId: candidate.releaseId,
    candidateId: candidate.id,
    snapshot: snapshotOf(candidate),
    folderId: state.account.folderId,
    createdAt: now,
    runningAt: null,
    intentAt: null,
    readyAt: null,
    outcome: 'imported',
    errorKind: null,
    error: null,
    instanceId: null,
    linked: false,
    // The local "Add another copy" is not the remote allow_duplicate.
    allowDuplicate: false,
    existingCount: 0,
  };
  state.imports.push(imp);
  scheduleImport(state, imp, now);
  return { status: 'ok', importId: imp.id };
}

// ---------------------------------------------------------------------------
// Change match (cancelImport).

export function cancelImport(
  state: DemoState,
  spineId: string,
  now: number,
): 'ok' | 'not_found' | 'started' | 'checking' {
  const row = latestImport(state, spineId, now);
  if (!row) return 'not_found';
  const r = importRowAt(row, now);
  const phase = importPhaseOf(r);
  const allowed = canChangeMatchOf({
    phase,
    intentAt: r.intentAt,
    errorKind: row.errorKind,
    jobStatus: r.jobStatus,
  });
  if (!allowed) {
    if (phase !== 'failed' || r.intentAt === null) return 'started';
    // CR-01: a check that never POSTs; nothing landed in the demo.
    dropImport(state, row, now);
    return 'checking';
  }
  dropImport(state, row, now);
  return 'ok';
}

// ---------------------------------------------------------------------------
// The already-in-collection decision (linkExisting, addAnotherCopy).

export type LinkExistingResult =
  | { status: 'ok'; importId: string; instanceId: number }
  | { status: 'not_found' }
  | { status: 'not_held' }
  | { status: 'no_existing' };

export function linkExisting(
  state: DemoState,
  spineId: string,
  now: number,
): LinkExistingResult {
  const row = latestImport(state, spineId, now);
  if (!row) return { status: 'not_found' };
  if (importRowAt(row, now).status !== 'already_in_collection') {
    return { status: 'not_held' };
  }
  const recorded = recordedInstances(state, row.id);
  const copy = (state.collection[row.releaseId] ?? []).find(
    (c) => !recorded.has(c.instanceId),
  );
  if (!copy) return { status: 'no_existing' };
  row.outcome = 'imported';
  row.instanceId = copy.instanceId;
  row.folderId = copy.folderId;
  row.linked = true;
  row.errorKind = null;
  row.error = null;
  row.readyAt = now;
  return { status: 'ok', importId: row.id, instanceId: copy.instanceId };
}

export type AddAnotherResult =
  | { status: 'ok'; importId: string }
  | { status: 'not_found' }
  | { status: 'not_held' };

export function addAnotherCopy(
  state: DemoState,
  spineId: string,
  now: number,
): AddAnotherResult {
  const row = latestImport(state, spineId, now);
  if (!row) return { status: 'not_found' };
  if (importRowAt(row, now).status !== 'already_in_collection') {
    // A second click while that add is still queued returns the same job.
    if (row.allowDuplicate && phaseAt(row, now) === 'waiting') {
      return { status: 'ok', importId: row.id };
    }
    return { status: 'not_held' };
  }
  row.allowDuplicate = true;
  scheduleImport(state, row, now);
  return { status: 'ok', importId: row.id };
}

// ---------------------------------------------------------------------------
// Retry (retrySpine) and Retry all failed.

export type RetrySpineResult =
  | { status: 'ok'; kind: 'import'; importId: string }
  | { status: 'ok'; kind: 'search'; searchId: string }
  | { status: 'nothing_to_retry' }
  | { status: 'busy' }
  | { status: 'not_found' };

export function retrySpine(
  state: DemoState,
  spineId: string,
  now: number,
): RetrySpineResult {
  const spine = findSpine(state, spineId, now);
  if (!spine) return { status: 'not_found' };
  if (!isListed(spine) || spine.notOnDiscogs) {
    return { status: 'nothing_to_retry' };
  }
  const row = latestImport(state, spine.id, now);
  if (row) {
    switch (phaseAt(row, now)) {
      case 'failed':
        scheduleImport(state, row, now);
        return { status: 'ok', kind: 'import', importId: row.id };
      case 'waiting':
        return { status: 'ok', kind: 'import', importId: row.id };
      case 'importing':
        return { status: 'busy' };
      default:
        return { status: 'nothing_to_retry' };
    }
  }
  if (discogsOf(state, spine, now).state !== 'failed') {
    return { status: 'nothing_to_retry' };
  }
  const res = startSearchAgain(state, spine, now);
  return res.status === 'ok'
    ? { status: 'ok', kind: 'search', searchId: res.searchId }
    : { status: 'busy' };
}

/**
 * POST /api/spines/retry-failed: the per-spine Retry over the failed
 * spines in /spines order; while not connected everything is skipped.
 */
export function retryAllFailed(
  state: DemoState,
  photoId: string | undefined,
  now: number,
): { retried: number; skipped: number } {
  const failed = buildSpinesResponse(state, now, {
    photoId,
    status: 'failed',
  }).spines;
  if (!discogsReady(state.account)) {
    return { retried: 0, skipped: failed.length };
  }
  let retried = 0;
  for (const s of failed) {
    const phase = s.import?.phase;
    if (phase === 'waiting' || phase === 'importing') continue;
    if (retrySpine(state, s.id, now).status === 'ok') retried += 1;
  }
  return { retried, skipped: 0 };
}
