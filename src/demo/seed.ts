// The demo's starting state (D-04, D-07, D-09): the owner's cd-spines shelf
// (demo/fixtures/shelf.json, 61 spines read by Claude, crops from the real
// pipeline) with each spine's recorded Discogs search
// (demo/fixtures/discogs.json), then SEED_PLAN puts a few spines into the
// other review states. Everything is relative to initAt (RESEARCH Pitfall
// 4), so buildSeed(t) is deterministic and a reload starts identically.
// Every search and import is finished before initAt, with
// queuedAt <= runningAt <= readyAt (RESEARCH Pitfall 8).
import type {
  CandidateFormat,
  SearchResultDto,
  SearchStage,
} from '@/lib/discogs-types';
import type {
  ExistingInstance,
  ImportCandidateSnapshot,
} from '@/lib/import-types';
import type { DensityFlag } from '@/lib/scan-types';
import type {
  Legibility,
  MediaKind,
  SpineField,
  TextOrientation,
} from '@/lib/vision-contract';
import discogsJson from '../../demo/fixtures/discogs.json';
import shelfJson from '../../demo/fixtures/shelf.json';
import type {
  DemoAccount,
  DemoCandidate,
  DemoImport,
  DemoPhoto,
  DemoSpine,
  DemoState,
} from './store';

// Fixture shapes (plan 05-02).
type Shelf = {
  source: { read: string; model: string; effort: string };
  photo: {
    filename: string;
    sentW: number;
    sentH: number;
    spineCountEstimate: number | null;
    detectedCount: number;
    densityFlags: DensityFlag[];
    vision: string;
    thumb: string;
  };
  spines: Array<{
    key: string;
    index: number;
    legibility: Legibility | null;
    mediaKind: MediaKind | null;
    textOrientation: TextOrientation | null;
    crop: { file: string; width: number; height: number } | null;
    fields: Array<{
      field: SpineField;
      value: string | null;
      confidence: number;
    }>;
  }>;
};

export type RecordedCandidate = {
  releaseId: number;
  title: string;
  year: number | null;
  country: string | null;
  labels: string[];
  catno: string | null;
  formats: CandidateFormat[];
  catnoMatch: boolean;
  stage: SearchStage | null;
};

export type Recording = {
  inputs: {
    artist: string | null;
    title: string | null;
    catno: string | null;
    rawText: string | null;
  };
  stage: SearchStage | null;
  total: number;
  outcome: 'done' | 'no_match';
  candidates: RecordedCandidate[];
};

type Recordings = {
  recordedAt: string;
  spines: Record<string, Recording>;
  canned: RecordedCandidate;
};

const SHELF = shelfJson as unknown as Shelf;
const RECORDINGS = discogsJson as unknown as Recordings;

export const SAMPLE_PHOTO_ID = 'demo-photo-1';

/**
 * Which shelf spines carry which seeded state (D-09), chosen from the
 * recordings: the imported ones are Nine Inch Nails spines whose search
 * found candidates; 14 is Massive Attack "blue lines" (4 candidates), held
 * as already in the collection; 25 (an obscure release Discogs found
 * nothing for) is marked not on Discogs; 28 (Boards of Canada) has a
 * failed search that kept its candidates; 42 (Nirvana "Bleach") has a
 * failed import. No release is a candidate of two spines in the
 * recordings, so the duplicate pair is 29 (Atmosphere "godlovesugly",
 * imported) and 31 (an Atmosphere spine with no title) holding that
 * release as a manual candidate, as if added from the Search dialog.
 * The illegible and unmatched spines stay not found; the rest pending.
 */
export const SEED_PLAN = {
  imported: ['09', '10', '13'],
  alreadyInCollection: ['14'],
  notOnDiscogs: ['25'],
  failedSearch: ['28'],
  failedImport: ['42'],
  /** [imported spine, spine that also lists its release]. */
  duplicatePair: ['29', '31'],
} as const satisfies Record<string, readonly string[]>;

const MIN = 60_000;
const FOLDER_ID = 1;
/** Discogs date_added of the already-held copy (verbatim ISO 8601). */
const HELD_DATE_ADDED = '2014-08-17T19:42:03-07:00';
const HELD_INSTANCE_ID = 987_654_321;
const INSTANCE_BASE = 1_712_400_000;

/** A recorded spine's Discogs search, or null for an unknown key. */
export function recordingFor(key: string): Recording | null {
  const r = RECORDINGS.spines[key];
  return r ? structuredClone(r) : null;
}

/** The canned release a pasted link or number returns (D-13). */
export function cannedRelease(): RecordedCandidate {
  return structuredClone(RECORDINGS.canned);
}

/** Every recorded candidate once by release id, plus the canned release. */
export function allRecordedCandidates(): RecordedCandidate[] {
  const seen = new Set<number>();
  const out: RecordedCandidate[] = [];
  const keys = Object.keys(RECORDINGS.spines).sort();
  for (const key of keys) {
    for (const c of RECORDINGS.spines[key].candidates) {
      if (seen.has(c.releaseId)) continue;
      seen.add(c.releaseId);
      out.push(structuredClone(c));
    }
  }
  if (!seen.has(RECORDINGS.canned.releaseId)) out.push(cannedRelease());
  return out;
}

export function defaultAccount(): DemoAccount {
  return {
    connected: true,
    username: 'demo-user',
    needsReconnect: false,
    folderId: FOLDER_ID,
    folders: [
      { id: FOLDER_ID, name: 'Uncategorized', count: 0 },
      { id: 2, name: 'Jazz', count: 0 },
      { id: 3, name: 'Soundtracks', count: 0 },
    ],
    foldersFetchedAt: null,
    model: 'claude-opus-5-5',
    consumerKeyTail: '••••demo',
    consumerSecretTail: '••••demo',
    pendingConnectAt: null,
  };
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

function resultOf(
  c: RecordedCandidate,
): Omit<SearchResultDto, 'alreadyListed'> {
  return {
    releaseId: c.releaseId,
    title: c.title,
    year: c.year,
    country: c.country,
    labels: [...c.labels],
    catno: c.catno,
    formats: structuredClone(c.formats),
    hasThumb: true,
  };
}

/** Discogs-style date_added for an epoch ms (UTC offset). */
function dateAddedOf(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

type Ids = {
  spine: string;
  search: string;
  candidate: (rank: number) => string;
};

/**
 * One shelf spine, its auto search (queued, running, ready at the given
 * times) and the search's candidates, added to `state`.
 */
function addShelfSpine(
  state: DemoState,
  spine: Shelf['spines'][number],
  photoId: string,
  ids: Ids,
  times: {
    visibleAt: number;
    queuedAt: number;
    runningAt: number;
    readyAt: number;
  },
): DemoSpine {
  const rec = RECORDINGS.spines[spine.key];
  const s: DemoSpine = {
    id: ids.spine,
    photoId,
    key: spine.key,
    index: spine.index,
    state: 'active',
    legibility: spine.legibility,
    mediaKind: spine.mediaKind,
    crop: spine.crop ? { ...spine.crop } : null,
    fields: spine.fields.map((f) => ({
      field: f.field,
      aiValue: f.value,
      value: f.value,
      confidence: f.confidence,
      editBaseAiValue: null,
    })),
    notOnDiscogs: false,
    visibleAt: times.visibleAt,
    createdRunNo: 1,
  };
  state.spines.push(s);
  state.searches.push({
    id: ids.search,
    spineId: s.id,
    kind: 'auto',
    query: null,
    inputs: rec ? { ...rec.inputs } : null,
    queuedAt: times.queuedAt,
    runningAt: times.runningAt,
    readyAt: times.readyAt,
    outcome: rec?.outcome ?? 'no_match',
    failure: null,
    results: (rec?.candidates ?? []).map(resultOf),
    totalCount: rec?.total ?? 0,
  });
  (rec?.candidates ?? []).forEach((c, rank) => {
    state.candidates.push({
      id: ids.candidate(rank),
      spineId: s.id,
      releaseId: c.releaseId,
      title: c.title,
      year: c.year,
      country: c.country,
      labels: [...c.labels],
      catno: c.catno,
      formats: structuredClone(c.formats),
      source: 'auto',
      catnoMatch: c.catnoMatch,
      stage: c.stage,
      rank,
      addedAt: times.readyAt,
    });
  });
  return s;
}

/** The candidate an import confirms: the spine's first in D-10 order. */
function topCandidate(state: DemoState, spineId: string): DemoCandidate {
  const list = state.candidates.filter((c) => c.spineId === spineId);
  const manual = list
    .filter((c) => c.source === 'manual')
    .sort((a, b) => b.addedAt - a.addedAt);
  const auto = list
    .filter((c) => c.source !== 'manual')
    .sort(
      (a, b) => Number(b.catnoMatch) - Number(a.catnoMatch) || a.rank - b.rank,
    );
  const top = manual[0] ?? auto[0];
  if (!top) throw new Error(`demo seed: spine ${spineId} has no candidates`);
  return top;
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
}

/** The seeded demo state for a page load at initAt. */
export function buildSeed(initAt: number): DemoState {
  const createdAt = initAt - 7 * MIN;
  const runEnd = initAt - 6 * MIN;
  const photo: DemoPhoto = {
    id: SAMPLE_PHOTO_ID,
    filename: SHELF.photo.filename,
    createdAt,
    runs: [
      {
        runNo: 1,
        queuedAt: createdAt,
        preparingAt: createdAt + 500,
        callingAt: createdAt + 2000,
        parsingAt: runEnd - 1500,
        doneAt: runEnd,
        outcome: 'done',
        errorReason: null,
      },
    ],
    model: SHELF.source.model,
    spineCountEstimate: SHELF.photo.spineCountEstimate,
    densityFlags: [...SHELF.photo.densityFlags],
    thumbFile: SHELF.photo.thumb,
    visionFile: SHELF.photo.vision,
  };
  const state: DemoState = {
    initAt,
    photos: [photo],
    spines: [],
    candidates: [],
    searches: [],
    imports: [],
    collection: {},
    account: defaultAccount(),
    seq: 0,
  };
  for (const spine of SHELF.spines) {
    const runningAt = runEnd + 400 + 1200 * spine.index;
    addShelfSpine(
      state,
      spine,
      SAMPLE_PHOTO_ID,
      {
        spine: `demo-spine-${spine.key}`,
        search: `demo-search-${spine.key}`,
        candidate: (rank) => `demo-cand-${spine.key}-${rank}`,
      },
      {
        visibleAt: runEnd,
        queuedAt: runEnd + 200,
        runningAt,
        readyAt: runningAt + 900,
      },
    );
  }

  const spineOf = (key: string): DemoSpine => {
    const s = state.spines.find((x) => x.key === key);
    if (!s) throw new Error(`demo seed: no shelf spine ${key}`);
    return s;
  };
  let importNo = 0;
  const addImport = (
    key: string,
    end: Pick<DemoImport, 'outcome' | 'errorKind' | 'existingCount'> & {
      posted: boolean;
    },
    candidate?: DemoCandidate,
  ): DemoImport => {
    const spine = spineOf(key);
    const c = candidate ?? topCandidate(state, spine.id);
    const at = initAt - 4 * MIN + 15_000 * importNo;
    importNo += 1;
    const runningAt = at + 1500;
    const readyAt = runningAt + 2000;
    const imported = end.outcome === 'imported';
    const imp: DemoImport = {
      id: `demo-import-${key}`,
      spineId: spine.id,
      releaseId: c.releaseId,
      candidateId: c.id,
      snapshot: snapshotOf(c),
      folderId: FOLDER_ID,
      createdAt: at,
      runningAt,
      intentAt: end.posted ? runningAt : null,
      readyAt,
      outcome: end.outcome,
      errorKind: end.errorKind,
      error: null,
      instanceId: imported ? INSTANCE_BASE + 137 * importNo : null,
      linked: false,
      allowDuplicate: false,
      existingCount: end.existingCount,
    };
    state.imports.push(imp);
    if (imported && imp.instanceId !== null) {
      addCopy(state, imp.releaseId, {
        instanceId: imp.instanceId,
        folderId: FOLDER_ID,
        dateAdded: dateAddedOf(readyAt),
      });
    }
    return imp;
  };
  const importedEnd = {
    outcome: 'imported',
    errorKind: null,
    existingCount: 0,
    posted: true,
  } as const;

  for (const key of SEED_PLAN.imported) addImport(key, importedEnd);

  for (const key of SEED_PLAN.alreadyInCollection) {
    const c = topCandidate(state, spineOf(key).id);
    addCopy(state, c.releaseId, {
      instanceId: HELD_INSTANCE_ID,
      folderId: FOLDER_ID,
      dateAdded: HELD_DATE_ADDED,
    });
    addImport(
      key,
      {
        outcome: 'already_in_collection',
        errorKind: null,
        existingCount: 1,
        posted: false,
      },
      c,
    );
  }

  for (const key of SEED_PLAN.notOnDiscogs) spineOf(key).notOnDiscogs = true;

  for (const key of SEED_PLAN.failedSearch) {
    const search = state.searches.find((x) => x.spineId === spineOf(key).id);
    if (search) {
      search.outcome = 'failed';
      search.failure = { kind: 'unavailable', reason: null };
      search.results = [];
    }
  }

  for (const key of SEED_PLAN.failedImport) {
    addImport(key, {
      outcome: 'failed',
      errorKind: 'unavailable',
      existingCount: 0,
      posted: false,
    });
  }

  const [heldKey, otherKey] = SEED_PLAN.duplicatePair;
  const held = addImport(heldKey, importedEnd);
  const source = state.candidates.find((c) => c.id === held.candidateId);
  const other = spineOf(otherKey);
  if (source) {
    state.candidates.push({
      ...structuredClone(source),
      id: `demo-cand-${otherKey}-manual`,
      spineId: other.id,
      source: 'manual',
      catnoMatch: false,
      stage: null,
      rank: 0,
      addedAt: initAt - 3 * MIN,
    });
  }

  state.account.folders = state.account.folders.map((f) => ({
    ...f,
    count: Object.values(state.collection)
      .flat()
      .filter((copy) => copy.folderId === f.id).length,
  }));
  return state;
}

/**
 * A fresh copy of the sample shelf on `photoId` (D-17): 61 new spines with
 * no imports or marks, visible at visibleAt, each with one auto search
 * queued then, running 400 ms later and ready after 1200 ms + 40 ms per
 * index, replaying the recordings. Added to `state`; returns the spines.
 */
export function pristineShelf(
  state: DemoState,
  photoId: string,
  visibleAt: number,
): DemoSpine[] {
  return SHELF.spines.map((spine) =>
    addShelfSpine(
      state,
      spine,
      photoId,
      {
        spine: `${photoId}-spine-${spine.key}`,
        search: `${photoId}-search-${spine.key}`,
        candidate: (rank) => `${photoId}-cand-${spine.key}-${rank}`,
      },
      {
        visibleAt,
        queuedAt: visibleAt,
        runningAt: visibleAt + 400,
        readyAt: visibleAt + 1200 + 40 * spine.index,
      },
    ),
  );
}
