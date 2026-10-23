// Demo review actions (D-13, D-14): field edits, Search again, the Search
// Discogs dialog, manual candidates, Not on Discogs, re-attach and dismiss.
// Each operation mutates the in-memory state at `now` and returns a result
// union the route maps to the real status codes. Nothing uses timers: a
// search gets queuedAt/runningAt/readyAt and the read model derives its
// state lazily (RESEARCH Pattern 3). Rules mirror src/server (fields.ts,
// enqueue.ts, store.ts addManualCandidate, not-on-discogs.ts, orphans.ts)
// without importing it.
import { parseDiscogsRef } from '@/lib/discogs-ref';
import {
  DIALOG_RESULTS_MAX,
  type DialogSearchDto,
  type DialogSearchState,
  type SearchResultDto,
  type SearchStage,
} from '@/lib/discogs-types';
import type { SpineDto, SpineFieldDto } from '@/lib/scan-types';
import { normalizeFieldInput } from '@/lib/spine-review';
import type { SpineField } from '@/lib/vision-contract';
import {
  buildSpinesResponse,
  candidatesOf,
  importRowAt,
  latestAutoSearch,
  latestImport,
  sameInputs,
  searchInputsOf,
  searchStateAt,
} from '../read-model';
import {
  allRecordedCandidates,
  cannedRelease,
  type RecordedCandidate,
  recordingFor,
} from '../seed';
import {
  type DemoAccount,
  type DemoImport,
  type DemoSearch,
  type DemoSpine,
  type DemoState,
  nextId,
} from '../store';

/** A search runs this long after it is queued, and ends this long after. */
export const SEARCH_RUNNING_MS = 400;
export const SEARCH_READY_MS = 1600;
/** Candidates an edited-fields Search again keeps (a recording has <= 10). */
const AGAIN_RESULTS_MAX = 10;

// ---------------------------------------------------------------------------
// Shared lookups.

/** A spine row that exists at `now` (uploaded copies appear at visibleAt). */
export function findSpine(
  state: DemoState,
  spineId: string,
  now: number,
): DemoSpine | null {
  const s = state.spines.find((x) => x.id === spineId);
  return s && s.visibleAt <= now ? s : null;
}

/** Active or orphaned: the states the real routes list and act on. */
export function isListed(s: DemoSpine): boolean {
  return s.state === 'active' || s.state === 'orphaned';
}

/** discogsReady(): connected and not known to be rejected. */
export function discogsReady(account: DemoAccount): boolean {
  return account.connected && !account.needsReconnect;
}

/** The real not_connected message (WR-05). */
export function notConnectedMessage(account: DemoAccount): string {
  return account.connected
    ? 'Reconnect Discogs in Settings first'
    : 'Connect Discogs in Settings first';
}

/** The spine's import rows that exist at `now` (cancelled ones are deleted). */
export function importsOf(
  state: DemoState,
  spineId: string,
  now: number,
): DemoImport[] {
  return state.imports.filter(
    (i) =>
      i.spineId === spineId && i.outcome !== 'cancelled' && i.createdAt <= now,
  );
}

/** importMayBeOnDiscogsSql for one import row at `now` (WR-01). */
export function mayBeOnDiscogs(imp: DemoImport, now: number): boolean {
  const row = importRowAt(imp, now);
  if (row.status !== 'failed') return true;
  return (
    row.intentAt !== null &&
    imp.errorKind !== 'not_found' &&
    imp.errorKind !== 'rejected'
  );
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

// ---------------------------------------------------------------------------
// Fields (updateSpineField / revertSpineField).

export type FieldResult =
  | { ok: true; field: SpineFieldDto }
  | { ok: false; error: 'not_found' | 'not_editable' };

export function editField(
  state: DemoState,
  spineId: string,
  field: SpineField,
  edit: { value: string | null } | { revert: true },
  now: number,
): FieldResult {
  const spine = findSpine(state, spineId, now);
  if (!spine) return { ok: false, error: 'not_found' };
  if (!isListed(spine)) return { ok: false, error: 'not_editable' };
  let f = spine.fields.find((x) => x.field === field);
  if (!f) {
    // Every real spine has a row per field; the demo adds a missing one.
    f = {
      field,
      aiValue: null,
      value: null,
      confidence: 0,
      editBaseAiValue: null,
    };
    spine.fields.push(f);
  }
  if ('revert' in edit) {
    f.value = f.aiValue;
    f.editBaseAiValue = null;
  } else {
    const value = normalizeFieldInput(edit.value);
    if (value === normalizeFieldInput(f.aiValue)) {
      f.value = f.aiValue;
      f.editBaseAiValue = null;
    } else {
      f.value = value;
      f.editBaseAiValue = f.aiValue;
    }
  }
  return { ok: true, field: { ...f } };
}

// ---------------------------------------------------------------------------
// Searches (enqueueExplicitSearch and the search handlers' outcomes).

/** Recorded releases whose title, labels or catalog number hold every word. */
export function matchRecordings(query: string): RecordedCandidate[] {
  const words = query.toLowerCase().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return [];
  return allRecordedCandidates().filter((c) => {
    const hay = [c.title, ...c.labels, c.catno ?? ''].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

function catnoKey(v: string | null): string | null {
  const k = v?.toLowerCase().replace(/[^a-z0-9]/gu, '') ?? '';
  return k || null;
}

/**
 * replaceAutoCandidates at `at`: the spine's auto candidates end then and
 * the new ones start; manual candidates are never touched (D-16).
 */
function replaceAutoCandidates(
  state: DemoState,
  spineId: string,
  list: RecordedCandidate[],
  at: number,
): void {
  for (const c of state.candidates) {
    if (c.spineId !== spineId || c.source !== 'auto') continue;
    if (c.removedAt == null || c.removedAt > at) c.removedAt = at;
  }
  list.forEach((c, rank) => {
    state.candidates.push({
      id: nextId('demo-run-cand'),
      spineId,
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
      addedAt: at,
    });
  });
}

/** The latest auto or again search is still queued or running (busy). */
function searchBusy(state: DemoState, spineId: string, now: number): boolean {
  const s = searchStateAt(latestAutoSearch(state, spineId, now), now).state;
  return s === 'queued' || s === 'searching';
}

/**
 * Search again / Retry search (kind 'again') from the spine's current
 * fields. Unchanged inputs replay the spine's recording; edited ones run
 * the recordings matcher on the edited artist and title.
 */
export function startSearchAgain(
  state: DemoState,
  spine: DemoSpine,
  now: number,
): { status: 'ok'; searchId: string } | { status: 'busy' } {
  if (searchBusy(state, spine.id, now)) return { status: 'busy' };
  const inputs = searchInputsOf(spine);
  const rec = recordingFor(spine.key);
  let found: RecordedCandidate[];
  let total: number;
  let outcome: DemoSearch['outcome'];
  if (rec && sameInputs(rec.inputs, inputs)) {
    found = rec.candidates;
    total = rec.total;
    outcome = rec.outcome;
  } else {
    const byName = [inputs.artist, inputs.title].filter(Boolean).join(' ');
    const stage: SearchStage = byName ? 'artist_title' : 'text';
    const matched = matchRecordings(
      byName || inputs.catno || inputs.rawText || '',
    );
    const want = catnoKey(inputs.catno);
    found = matched.slice(0, AGAIN_RESULTS_MAX).map((c) => ({
      ...c,
      catnoMatch: want !== null && catnoKey(c.catno) === want,
      stage,
    }));
    total = matched.length;
    outcome = found.length > 0 ? 'done' : 'no_match';
  }
  const search: DemoSearch = {
    id: nextId('demo-run-search'),
    spineId: spine.id,
    kind: 'again',
    query: null,
    releaseId: null,
    inputs,
    queuedAt: now,
    runningAt: now + SEARCH_RUNNING_MS,
    readyAt: now + SEARCH_READY_MS,
    outcome,
    failure: null,
    results: found.map(resultOf),
    totalCount: total,
  };
  state.searches.push(search);
  replaceAutoCandidates(state, spine.id, found, search.readyAt);
  return { status: 'ok', searchId: search.id };
}

export type SearchBody =
  | { mode: 'again' }
  | { mode: 'text' | 'ref'; value: string };

export type StartSearchResult =
  | { status: 'ok'; searchId: string }
  | { status: 'empty' }
  | { status: 'master' }
  | { status: 'invalid_ref' }
  | { status: 'not_found' }
  | { status: 'not_searchable' }
  | { status: 'not_connected'; message: string }
  | { status: 'busy' };

type DialogInput =
  | { kind: 'manual'; query: string }
  | { kind: 'release'; releaseId: number; query: string };

/** The route's explicitInput: what the typed or pasted value asks for. */
function classify(
  body: Exclude<SearchBody, { mode: 'again' }>,
): DialogInput | StartSearchResult {
  const value = body.value.trim();
  if (!value) return { status: 'empty' };
  const ref = parseDiscogsRef(value);
  switch (ref.kind) {
    case 'master':
      return { status: 'master' };
    case 'release':
      return { kind: 'release', releaseId: ref.id, query: value };
    default:
      if (body.mode === 'ref') return { status: 'invalid_ref' };
      return { kind: 'manual', query: ref.q };
  }
}

function startDialogSearch(
  state: DemoState,
  spineId: string,
  input: DialogInput,
  now: number,
): string {
  let results: RecordedCandidate[];
  let total: number;
  if (input.kind === 'release') {
    // D-13: a recorded release, or the canned one for any other number.
    const hit = allRecordedCandidates().find(
      (c) => c.releaseId === input.releaseId,
    );
    results = [hit ?? cannedRelease()];
    total = 1;
  } else {
    const matched = matchRecordings(input.query);
    results = matched.slice(0, DIALOG_RESULTS_MAX);
    total = matched.length;
  }
  const search: DemoSearch = {
    id: nextId('demo-run-search'),
    spineId,
    kind: input.kind,
    query: input.query,
    releaseId: input.kind === 'release' ? input.releaseId : null,
    inputs: null,
    queuedAt: now,
    runningAt: now + SEARCH_RUNNING_MS,
    readyAt: now + SEARCH_READY_MS,
    outcome: results.length > 0 ? 'done' : 'no_match',
    failure: null,
    results: results.map(resultOf),
    totalCount: total,
  };
  state.searches.push(search);
  return search.id;
}

/** POST /api/spines/:id/search, in the real route's order of checks. */
export function startSearch(
  state: DemoState,
  spineId: string,
  body: SearchBody,
  now: number,
): StartSearchResult {
  let input: DialogInput | null = null;
  if (body.mode !== 'again') {
    const c = classify(body);
    if ('status' in c) return c;
    input = c;
  }
  const spine = findSpine(state, spineId, now);
  if (!spine) return { status: 'not_found' };
  if (!isListed(spine)) return { status: 'not_searchable' };
  if (!discogsReady(state.account)) {
    return {
      status: 'not_connected',
      message: notConnectedMessage(state.account),
    };
  }
  if (input === null) return startSearchAgain(state, spine, now);
  return {
    status: 'ok',
    searchId: startDialogSearch(state, spine.id, input, now),
  };
}

function dialogSearch(
  state: DemoState,
  searchId: string,
  now: number,
): DemoSearch | null {
  const s = state.searches.find((x) => x.id === searchId);
  if (!s || (s.kind !== 'manual' && s.kind !== 'release')) return null;
  return s.queuedAt <= now ? s : null;
}

function dialogStateAt(s: DemoSearch, now: number): DialogSearchState {
  if (now < s.runningAt) return 'queued';
  if (now < s.readyAt) return 'searching';
  return s.outcome;
}

/** GET /api/discogs/searches/:id, or null for the real 404. */
export function dialogSearchDto(
  state: DemoState,
  searchId: string,
  now: number,
): DialogSearchDto | null {
  const s = dialogSearch(state, searchId, now);
  if (!s || (s.kind !== 'manual' && s.kind !== 'release')) return null;
  const st = dialogStateAt(s, now);
  const finished = now >= s.readyAt;
  const listed = new Set(
    candidatesOf(state, s.spineId, now).map((c) => c.releaseId),
  );
  const stored = finished ? s.results : [];
  return {
    id: s.id,
    kind: s.kind,
    state: st,
    query: s.query,
    releaseId: s.releaseId ?? null,
    results: stored.slice(0, DIALOG_RESULTS_MAX).map((r) => ({
      ...structuredClone(r),
      alreadyListed: listed.has(r.releaseId),
    })),
    totalCount: finished ? s.totalCount : 0,
    failure: st === 'failed' ? "Discogs didn't respond" : null,
    pausedUntil: null,
  };
}

// ---------------------------------------------------------------------------
// Manual candidates (addManualCandidate).

export type AddManualResult =
  | { status: 'ok'; candidateId: string }
  | { status: 'search_not_found' }
  | { status: 'not_done' }
  | { status: 'release_not_found' };

export function addManualCandidate(
  state: DemoState,
  input: { spineId: string; searchId: string; releaseId: number },
  now: number,
): AddManualResult {
  const search = dialogSearch(state, input.searchId, now);
  if (!search || search.spineId !== input.spineId) {
    return { status: 'search_not_found' };
  }
  if (now < search.readyAt || search.outcome !== 'done') {
    return { status: 'not_done' };
  }
  const r = search.results.find((x) => x.releaseId === input.releaseId);
  if (!r) return { status: 'release_not_found' };
  const fields = {
    releaseId: r.releaseId,
    title: r.title,
    year: r.year,
    country: r.country,
    labels: [...r.labels],
    catno: r.catno,
    formats: structuredClone(r.formats),
    stage: (search.kind === 'release' ? 'release' : 'text') as SearchStage,
    addedAt: now,
  };
  const existing = state.candidates.find(
    (c) =>
      c.spineId === input.spineId &&
      c.source === 'manual' &&
      c.releaseId === r.releaseId,
  );
  if (existing) {
    // ON CONFLICT DO UPDATE: same id, fresh details, moved to the top.
    Object.assign(existing, fields, { removedAt: null });
    return { status: 'ok', candidateId: existing.id };
  }
  const id = nextId('demo-run-cand');
  state.candidates.push({
    id,
    spineId: input.spineId,
    source: 'manual',
    catnoMatch: false,
    rank: 0,
    ...fields,
  });
  return { status: 'ok', candidateId: id };
}

// ---------------------------------------------------------------------------
// Not on Discogs (setNotOnDiscogs).

export type NotOnDiscogsResult =
  | { status: 'ok'; notOnDiscogs: boolean }
  | { status: 'not_found' }
  | { status: 'not_markable' }
  | { status: 'imported' }
  | { status: 'import_open' };

export function setNotOnDiscogs(
  state: DemoState,
  spineId: string,
  flag: boolean,
  now: number,
): NotOnDiscogsResult {
  const spine = findSpine(state, spineId, now);
  if (!spine) return { status: 'not_found' };
  if (!isListed(spine)) return { status: 'not_markable' };
  // A repeat (double click, Undo after Unmark) is a no-op.
  if (spine.notOnDiscogs === flag) return { status: 'ok', notOnDiscogs: flag };
  if (flag) {
    const latest = latestImport(state, spineId, now);
    if (latest) {
      if (importRowAt(latest, now).status === 'imported') {
        return { status: 'imported' };
      }
      if (mayBeOnDiscogs(latest, now)) return { status: 'import_open' };
    }
  }
  spine.notOnDiscogs = flag;
  return { status: 'ok', notOnDiscogs: flag };
}

// ---------------------------------------------------------------------------
// Orphaned spines (listReattachCandidates, reattachSpine, dismissSpine).

export type OrphanResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'not_found' }
  | { status: 'conflict' };

function latestDoneRunNo(
  state: DemoState,
  photoId: string,
  now: number,
): number | null {
  const photo = state.photos.find((p) => p.id === photoId);
  const done = (photo?.runs ?? [])
    .filter((r) => r.outcome === 'done' && now >= r.doneAt)
    .map((r) => r.runNo);
  return done.length > 0 ? Math.max(...done) : null;
}

/** The CANDIDATE rule of orphans.ts for orphan `orphan`. */
function reattachTargets(
  state: DemoState,
  orphan: DemoSpine,
  now: number,
): DemoSpine[] {
  const runNo = latestDoneRunNo(state, orphan.photoId, now);
  return state.spines.filter(
    (t) =>
      t.state === 'active' &&
      t.visibleAt <= now &&
      t.photoId === orphan.photoId &&
      t.createdRunNo === runNo &&
      !t.notOnDiscogs &&
      t.fields.every(
        (f) => normalizeFieldInput(f.value) === normalizeFieldInput(f.aiValue),
      ) &&
      !importsOf(state, t.id, now).some((i) => mayBeOnDiscogs(i, now)),
  );
}

function spineDtos(
  state: DemoState,
  ids: Set<string>,
  now: number,
): SpineDto[] {
  return buildSpinesResponse(state, now).spines.filter((s) => ids.has(s.id));
}

export function listReattachCandidates(
  state: DemoState,
  orphanId: string,
  now: number,
): OrphanResult<SpineDto[]> {
  const spine = findSpine(state, orphanId, now);
  if (!spine) return { status: 'not_found' };
  if (spine.state !== 'orphaned') return { status: 'ok', value: [] };
  const ids = new Set(reattachTargets(state, spine, now).map((t) => t.id));
  return { status: 'ok', value: spineDtos(state, ids, now) };
}

export function reattachSpine(
  state: DemoState,
  orphanId: string,
  targetSpineId: string,
  now: number,
): OrphanResult<SpineDto> {
  const orphan = findSpine(state, orphanId, now);
  if (!orphan) return { status: 'not_found' };
  if (orphan.state !== 'orphaned') return { status: 'conflict' };
  const target = reattachTargets(state, orphan, now).find(
    (t) => t.id === targetSpineId,
  );
  if (!target) return { status: 'conflict' };
  const norm = normalizeFieldInput;
  for (const tf of target.fields) {
    const of = orphan.fields.find((f) => f.field === tf.field);
    if (!of) {
      orphan.fields.push({ ...tf, editBaseAiValue: null });
      continue;
    }
    if (norm(of.value) === norm(of.aiValue)) {
      of.value = tf.value;
      of.editBaseAiValue = null;
    } else if (norm(of.value) === norm(tf.aiValue)) {
      of.editBaseAiValue = null;
    } else {
      of.editBaseAiValue = of.editBaseAiValue ?? of.aiValue;
    }
    of.aiValue = tf.aiValue;
    of.confidence = tf.confidence;
  }
  // The orphan takes over the target's detection (and so its crop).
  orphan.key = target.key;
  orphan.index = target.index;
  orphan.crop = target.crop ? { ...target.crop } : null;
  orphan.legibility = target.legibility;
  orphan.mediaKind = target.mediaKind;
  orphan.state = 'active';
  target.state = 'superseded';
  const dto = spineDtos(state, new Set([orphan.id]), now)[0];
  return dto ? { status: 'ok', value: dto } : { status: 'not_found' };
}

export function dismissSpine(
  state: DemoState,
  spineId: string,
  now: number,
): 'ok' | 'not_found' | 'has_import' | 'conflict' {
  const spine = findSpine(state, spineId, now);
  if (!spine) return 'not_found';
  if (spine.state !== 'orphaned') return 'conflict';
  if (importsOf(state, spineId, now).some((i) => mayBeOnDiscogs(i, now))) {
    return 'has_import';
  }
  spine.state = 'dismissed';
  return 'ok';
}
