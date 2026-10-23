// In-memory demo state (D-03, D-04). Plain TS, no React, no persistence of
// any kind: the state lives in page memory and a reload rebuilds it from
// the seed (buildSeed). Times are epoch ms from now(); every in-flight thing has a
// readyAt-style timestamp so the read model derives its state lazily from
// now() instead of timers (RESEARCH Pattern 3).
import type {
  CandidateFormat,
  SearchFailure,
  SearchKind,
  SearchResultDto,
  SearchStage,
} from '@/lib/discogs-types';
import type {
  ExistingInstance,
  ImportCandidateSnapshot,
  ImportErrorKind,
} from '@/lib/import-types';
import type { DensityFlag, SpineState } from '@/lib/scan-types';
import type { Legibility, MediaKind, SpineField } from '@/lib/vision-contract';
import { buildSeed } from './seed';

export type DemoPhotoRun = {
  runNo: number;
  queuedAt: number;
  preparingAt: number;
  callingAt: number;
  parsingAt: number;
  doneAt: number;
  outcome: 'done' | 'error';
  errorReason: string | null;
};

export type DemoPhoto = {
  id: string;
  filename: string;
  createdAt: number;
  runs: DemoPhotoRun[];
  model: string;
  spineCountEstimate: number | null;
  densityFlags: DensityFlag[];
  thumbFile: string | null;
  visionFile: string | null;
};

export type DemoField = {
  field: SpineField;
  aiValue: string | null;
  value: string | null;
  confidence: number;
  editBaseAiValue: string | null;
};

export type DemoSpine = {
  id: string;
  photoId: string;
  /** Shelf key '00'..'60': the spine's entry in the sample shelf fixture. */
  key: string;
  index: number;
  state: SpineState;
  legibility: Legibility | null;
  mediaKind: MediaKind | null;
  crop: { file: string; width: number; height: number } | null;
  fields: DemoField[];
  notOnDiscogs: boolean;
  visibleAt: number;
  createdRunNo: number;
};

export type DemoCandidate = {
  id: string;
  spineId: string;
  releaseId: number;
  title: string;
  year: number | null;
  country: string | null;
  labels: string[];
  catno: string | null;
  formats: CandidateFormat[];
  source: 'auto' | 'manual';
  catnoMatch: boolean;
  stage: SearchStage | null;
  rank: number;
  addedAt: number;
  /** A later search replaced it at this time (replaceAutoCandidates). */
  removedAt?: number | null;
};

export type DemoSearch = {
  id: string;
  spineId: string;
  kind: SearchKind;
  query: string | null;
  /** The pasted release a 'release' search fetched (DialogSearchDto). */
  releaseId?: number | null;
  inputs: {
    artist: string | null;
    title: string | null;
    catno: string | null;
    rawText: string | null;
  } | null;
  queuedAt: number;
  runningAt: number;
  readyAt: number;
  outcome: 'done' | 'no_match' | 'not_found' | 'failed';
  failure: SearchFailure | null;
  results: Array<Omit<SearchResultDto, 'alreadyListed'>>;
  totalCount: number;
};

export type DemoImport = {
  id: string;
  spineId: string;
  releaseId: number;
  candidateId: string | null;
  snapshot: ImportCandidateSnapshot;
  folderId: number;
  createdAt: number;
  runningAt: number | null;
  intentAt: number | null;
  readyAt: number | null;
  outcome: 'imported' | 'already_in_collection' | 'failed' | 'cancelled';
  errorKind: ImportErrorKind | null;
  error: string | null;
  instanceId: number | null;
  linked: boolean;
  allowDuplicate: boolean;
  existingCount: number;
};

export type DemoAccount = {
  connected: boolean;
  username: string;
  needsReconnect: boolean;
  folderId: number;
  folders: Array<{ id: number; name: string; count: number }>;
  model: string;
  consumerKeyTail: string | null;
  consumerSecretTail: string | null;
  pendingConnectAt: number | null;
};

export type DemoState = {
  initAt: number;
  photos: DemoPhoto[];
  spines: DemoSpine[];
  candidates: DemoCandidate[];
  searches: DemoSearch[];
  imports: DemoImport[];
  /** Copies "already in the owner's Discogs collection", by release id. */
  collection: Record<number, ExistingInstance[]>;
  account: DemoAccount;
  seq: number;
};

let clock: (() => number) | null = null;

/** Wall-clock ms, or the test clock installed by setClock. */
export function now(): number {
  return clock ? clock() : Date.now();
}

/** Install a test clock (null restores Date.now). */
export function setClock(fn: (() => number) | null): void {
  clock = fn;
}

/** The seeded state (D-04, D-07, D-09) for a load at now(). */
function initialState(): DemoState {
  return buildSeed(now());
}

let state: DemoState = initialState();
let version = 0;
const listeners = new Set<() => void>();

export function getState(): DemoState {
  return state;
}

/** Call after every mutation: bumps the version and notifies subscribers. */
export function emit(): void {
  version += 1;
  for (const fn of listeners) fn();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getVersion(): number {
  return version;
}

/** Rebuild the state from the seed (tests; a page reload does the same). */
export function resetStore(): void {
  state = initialState();
  emit();
}

/** Deterministic id: `${prefix}-${seq}`. */
export function nextId(prefix: string): string {
  state.seq += 1;
  return `${prefix}-${state.seq}`;
}
