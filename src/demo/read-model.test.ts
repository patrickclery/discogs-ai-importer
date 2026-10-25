import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eligibilityOf, topMatchOf } from '@/lib/bulk-eligibility';
import { countryBadgeOf } from '@/lib/bulk-view';
import { REVIEW_STATUSES } from '@/lib/import-types';
import type { SpineDto } from '@/lib/scan-types';
import {
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_DENSITY_MAX_SPINES,
} from '@/lib/vision-contract';
import { startBulk } from './ops/bulk';
import { IMPORT_READY_MS } from './ops/imports';
import {
  buildPhotosResponse,
  buildSpinesResponse,
  buildStatusResponse,
} from './read-model';
import {
  allRecordedCandidates,
  buildSeed,
  cannedRelease,
  pristineShelf,
  recordingFor,
  SEED_PLAN,
} from './seed';
import { type DemoState, getState, resetStore, setClock } from './store';

// D-04, D-07, D-09, T-05-16: the seeded sample shelf and the read model that
// mirrors getSpines / GET /api/status with the real src/lib rules.

const T0 = Date.UTC(2026, 9, 23, 12, 0, 0);
let clockNow = T0;

beforeEach(() => {
  clockNow = T0;
  setClock(() => clockNow);
  resetStore();
});

afterEach(() => {
  setClock(null);
});

const spinesAt = (state: DemoState, now: number) =>
  buildSpinesResponse(state, now);

function bySpineKey(state: DemoState, key: string, list: SpineDto[]) {
  const id = state.spines.find(
    (s) => s.key === key && s.photoId === 'demo-photo-1',
  )?.id;
  return list.find((s) => s.id === id);
}

function timesInOrder(state: DemoState): string[] {
  const bad: string[] = [];
  for (const s of state.searches) {
    if (!(s.queuedAt <= s.runningAt && s.runningAt <= s.readyAt)) {
      bad.push(`search ${s.id}`);
    }
  }
  for (const i of state.imports) {
    if (
      i.runningAt === null ||
      i.readyAt === null ||
      !(i.createdAt <= i.runningAt && i.runningAt <= i.readyAt)
    ) {
      bad.push(`import ${i.id}`);
    }
  }
  return bad;
}

describe('seed (D-04, D-07)', () => {
  it('is deterministic for a given init time', () => {
    expect(buildSeed(T0)).toEqual(buildSeed(T0));
  });

  it('is the store state, and resetStore restores it after a mutation', () => {
    expect(getState()).toEqual(buildSeed(T0));
    getState().spines[0].notOnDiscogs = true;
    getState().imports.length = 0;
    resetStore();
    expect(getState()).toEqual(buildSeed(T0));
  });

  it('holds the 61-spine sample shelf with crops and one search each', () => {
    const s = getState();
    expect(s.photos).toHaveLength(1);
    expect(s.photos[0]).toMatchObject({
      id: 'demo-photo-1',
      filename: 'cd-spines.heic',
      model: 'claude-opus-5-5',
      visionFile: 'vision.jpg',
      thumbFile: 'thumb.webp',
    });
    expect(s.spines).toHaveLength(61);
    expect(s.spines.every((x) => x.crop !== null)).toBe(true);
    expect(s.spines.every((x) => x.visibleAt <= T0)).toBe(true);
    const auto = s.searches.filter((x) => x.kind === 'auto');
    expect(new Set(auto.map((x) => x.spineId)).size).toBe(61);
  });

  it('names only real shelf keys in SEED_PLAN', () => {
    for (const key of Object.values(SEED_PLAN).flat()) {
      expect(recordingFor(key)).not.toBeNull();
    }
  });

  it('keeps every search and import time in order (Pitfall 8)', () => {
    expect(timesInOrder(getState())).toEqual([]);
  });
});

describe('seeded Spines response (D-09)', () => {
  it('lists all 61 spines on cd-spines.heic', () => {
    const r = spinesAt(getState(), T0);
    expect(r.photos.map((p) => p.filename)).toEqual(['cd-spines.heic']);
    expect(r.photos[0].status).toBe('done');
    expect(r.spines).toHaveLength(61);
    expect(r.counts.all).toBe(61);
    expect(r.spines.every((s) => s.crop?.url.includes('/demo-assets/'))).toBe(
      true,
    );
  });

  it('has at least one spine in every review status', () => {
    const r = spinesAt(getState(), T0);
    for (const status of REVIEW_STATUSES) {
      expect(r.counts.byStatus[status], status).toBeGreaterThanOrEqual(1);
    }
    const sum = Object.values(r.counts.byStatus).reduce((a, b) => a + b, 0);
    expect(sum).toBe(r.counts.all);
    expect(Object.keys(r.statusById).sort()).toEqual(
      r.spines.map((s) => s.id).sort(),
    );
  });

  it('has the warning and failure states', () => {
    const r = spinesAt(getState(), T0);
    expect(
      r.spines.some((s) => s.import?.phase === 'already_in_collection'),
    ).toBe(true);
    const held = r.spines.find(
      (s) => s.import?.phase === 'already_in_collection',
    );
    expect(held?.import?.existing).toMatchObject({
      count: 1,
      folderId: 1,
      folderName: 'Uncategorized',
    });
    expect(held?.import?.canChangeMatch).toBe(true);
    expect(r.spines.some((s) => s.discogs?.state === 'failed')).toBe(true);
    const failedSearch = r.spines.find((s) => s.discogs?.state === 'failed');
    expect(failedSearch?.discogs?.failure).toEqual({
      kind: 'unavailable',
      reason: null,
    });
    const failedImport = r.spines.find((s) => s.import?.phase === 'failed');
    expect(failedImport?.import).toMatchObject({
      canRetry: true,
      canChangeMatch: true,
      failure: { kind: 'unavailable', reason: null },
    });
    expect(r.spines.filter((s) => s.import?.phase === 'imported').length).toBe(
      r.counts.byStatus.imported,
    );
    expect(r.counts.byStatus.imported).toBeGreaterThanOrEqual(3);
  });

  it('has a duplicate-across-spines pair', () => {
    const r = spinesAt(getState(), T0);
    const importedReleases = new Set(
      r.spines
        .filter((s) => s.import?.phase === 'imported')
        .map((s) => s.import?.releaseId),
    );
    const dup = r.spines.find(
      (s) =>
        s.import === null &&
        s.discogs?.topCandidates.some((c) => importedReleases.has(c.releaseId)),
    );
    expect(dup).toBeDefined();
    expect(dup?.reviewStatus).toBe('pending');
  });

  it('derives search summaries like discogsForSpines', () => {
    const state = getState();
    const r = spinesAt(state, T0);
    for (const s of r.spines) {
      expect(s.discogs).not.toBeNull();
      expect(s.discogs?.fieldsChanged).toBe(false);
      expect(s.discogs?.topCandidates.length).toBeLessThanOrEqual(3);
      expect(s.discogs?.topCandidates.every((c) => c.hasThumb)).toBe(true);
    }
    const nin = bySpineKey(state, '11', r.spines);
    const rec = recordingFor('11');
    expect(nin?.discogs?.state).toBe('done');
    expect(nin?.discogs?.candidateCount).toBe(
      new Set(rec?.candidates.map((c) => c.releaseId)).size,
    );
    const illegible = bySpineKey(state, '21', r.spines);
    expect(illegible?.discogs?.state).toBe('no_match');
    expect(illegible?.reviewStatus).toBe('not_found');
    // D-10 order: exact catno matches first, then Discogs order.
    const order = nin?.discogs?.topCandidates.map((c) => c.catnoMatch) ?? [];
    expect([...order].sort((a, b) => Number(b) - Number(a))).toEqual(order);
  });

  it('marks fields changed only for a real edit of a search field', () => {
    const state = getState();
    const spine = state.spines.find((s) => s.key === '11');
    const title = spine?.fields.find((f) => f.field === 'title');
    if (!spine || !title) throw new Error('missing seed spine 11');
    title.value = `  ${title.value}  `;
    expect(
      bySpineKey(state, '11', spinesAt(state, T0).spines)?.discogs,
    ).toMatchObject({ fieldsChanged: false });
    title.value = 'Something else';
    expect(
      bySpineKey(state, '11', spinesAt(state, T0).spines)?.discogs,
    ).toMatchObject({ fieldsChanged: true });
  });

  it('reports the default thresholds and no activity', () => {
    const r = spinesAt(getState(), T0);
    expect(r.confidenceThreshold).toBe(DEFAULT_CONFIDENCE_THRESHOLD);
    expect(r.densityMaxSpines).toBe(DEFAULT_DENSITY_MAX_SPINES);
    expect(r.discogsActive).toBe(false);
    expect(r.photoProgress['demo-photo-1']).toEqual({
      imported: r.counts.byStatus.imported,
      total: 61,
    });
  });
});

describe('filters (getSpines rules)', () => {
  it('status keeps only that status; counts ignore it', () => {
    const state = getState();
    const all = spinesAt(state, T0);
    const r = buildSpinesResponse(state, T0, { status: 'imported' });
    expect(r.spines.length).toBe(all.counts.byStatus.imported);
    expect(r.spines.every((s) => s.reviewStatus === 'imported')).toBe(true);
    expect(r.counts).toEqual(all.counts);
    expect(r.statusById).toEqual(all.statusById);
  });

  it('review keeps only spines that need review', () => {
    const state = getState();
    const all = spinesAt(state, T0);
    const r = buildSpinesResponse(state, T0, { review: true });
    expect(r.spines.length).toBe(all.counts.needsReview);
    expect(r.counts).toEqual(all.counts);
  });

  it('an unknown photo id yields no photos and no spines', () => {
    const r = buildSpinesResponse(getState(), T0, { photoId: 'nope' });
    expect(r.photos).toEqual([]);
    expect(r.spines).toEqual([]);
    expect(r.counts.all).toBe(0);
    expect(r.photoOptions).toHaveLength(1);
  });

  it('a status no spine has omits the photo while filtering', () => {
    const state = getState();
    for (const s of state.spines) s.notOnDiscogs = false;
    const r = buildSpinesResponse(state, T0, { status: 'not_on_discogs' });
    expect(r.spines).toEqual([]);
    expect(r.photos).toEqual([]);
  });
});

describe('bulk (eligibilityOf, Plan 06-04)', () => {
  it('every listed spine gets eligibilityOf with no item, and no run', () => {
    const r = spinesAt(getState(), T0);
    expect(r.bulk).toBeNull();
    expect(r.spines.length).toBeGreaterThan(0);
    for (const s of r.spines) {
      const e = eligibilityOf(s, null);
      expect(s.bulk).toEqual({
        eligible: e.eligible,
        reason: e.reason,
        item: null,
      });
    }
    expect(r.spines.some((s) => s.bulk?.eligible)).toBe(true);
  });

  it('serves the preferred country, an empty Fallback filter and its count', () => {
    const state = getState();
    const all = spinesAt(state, T0);
    expect(all.discogs.preferredCountry).toBe('Canada');
    state.account.preferredCountry = 'Germany';
    expect(spinesAt(state, T0).discogs.preferredCountry).toBe('Germany');
    const r = buildSpinesResponse(state, T0, { fallback: true });
    expect(r.spines).toEqual([]);
    expect(r.photos).toEqual([]);
    expect(r.counts.fallback).toBe(0);
    expect(r.counts).toEqual(all.counts);
  });
});

describe('status response', () => {
  it('counts failed spines and imports like discogsStatus', () => {
    const r = buildStatusResponse(getState(), T0);
    expect(r.discogs.connected).toBe(true);
    expect(r.discogs.backlog).toBe(0);
    expect(r.discogs.failedSpines).toBeGreaterThanOrEqual(1);
    expect(r.discogs.imports).toEqual({ left: 0, failed: 1 });
    expect(r.jobs.discogs.queued + r.jobs.discogs.running).toBe(0);
    expect(r.jobs.discogs.succeeded).toBeGreaterThan(0);
  });

  it('leaves out a failed import whose spine is marked not on Discogs', () => {
    const state = getState();
    const failed = state.imports.find((i) => i.outcome === 'failed');
    const spine = state.spines.find((s) => s.id === failed?.spineId);
    if (!spine) throw new Error('no failed import in the seed');
    spine.notOnDiscogs = true;
    expect(buildStatusResponse(state, T0).discogs.imports.failed).toBe(0);
  });
});

describe('pristineShelf (D-17)', () => {
  const T = T0 + 10_000;

  function withSecondPhoto(): DemoState {
    const state = getState();
    state.photos.push({
      ...state.photos[0],
      id: 'p2',
      filename: 'my-shelf.jpg',
      createdAt: T - 3000,
      runs: [
        {
          runNo: 1,
          queuedAt: T - 3000,
          preparingAt: T - 2500,
          callingAt: T - 2000,
          parsingAt: T - 500,
          doneAt: T,
          outcome: 'done',
          errorReason: null,
        },
      ],
    });
    pristineShelf(state, 'p2', T);
    return state;
  }

  it('adds 61 fresh spines with no imports or marks, hidden before T', () => {
    const state = withSecondPhoto();
    const fresh = state.spines.filter((s) => s.photoId === 'p2');
    expect(fresh).toHaveLength(61);
    expect(fresh.every((s) => !s.notOnDiscogs)).toBe(true);
    const ids = new Set(fresh.map((s) => s.id));
    expect(state.imports.some((i) => ids.has(i.spineId))).toBe(false);
    expect(new Set(state.spines.map((s) => s.id)).size).toBe(122);
    expect(spinesAt(state, T - 1).counts.all).toBe(61);
    expect(timesInOrder(state)).toEqual([]);
  });

  it('searches run queued, searching, then done from the recordings', () => {
    const state = withSecondPhoto();
    const p2 = (now: number) =>
      buildSpinesResponse(state, now, { photoId: 'p2' });
    const atT = p2(T);
    expect(atT.spines).toHaveLength(61);
    expect(atT.spines.every((s) => s.discogs?.state === 'queued')).toBe(true);
    expect(atT.discogsActive).toBe(true);
    expect(spinesAt(state, T).discogsActive).toBe(true);
    expect(p2(T + 500).spines[0].discogs?.state).toBe('searching');
    const last = Math.max(
      ...state.searches.map((s) => s.readyAt),
      ...state.imports.map((i) => i.readyAt ?? 0),
    );
    const done = p2(last);
    expect(done.discogsActive).toBe(false);
    expect(spinesAt(state, last).discogsActive).toBe(false);
    for (const s of done.spines) {
      const key = state.spines.find((x) => x.id === s.id)?.key ?? '';
      const rec = recordingFor(key);
      expect(s.discogs?.state).toBe(
        (rec?.candidates.length ?? 0) > 0 ? 'done' : 'no_match',
      );
      expect(s.discogs?.candidateCount).toBe(
        new Set(rec?.candidates.map((c) => c.releaseId)).size,
      );
      expect(s.import).toBeNull();
    }
    expect(buildStatusResponse(state, last).discogs.backlog).toBe(0);
    expect(buildStatusResponse(state, T).discogs.backlog).toBe(61);
  });

  it('lists the second photo first (newest first)', () => {
    const state = withSecondPhoto();
    expect(buildPhotosResponse(state, T).photos.map((p) => p.id)).toEqual([
      'p2',
      'demo-photo-1',
    ]);
  });
});

describe('recording helpers (D-13)', () => {
  it('gives every recorded release once, plus the canned release', () => {
    const all = allRecordedCandidates();
    const ids = all.map((c) => c.releaseId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(cannedRelease().releaseId);
    expect(recordingFor('nope')).toBeNull();
  });
});

describe('bulk fields (D-15, D-17, BULK-12)', () => {
  const RUN_KEYS = ['11', '40', '15', '16', '31', '42'];
  const sid = (key: string) => `demo-spine-${key}`;

  function run(): { after: number } {
    const state = getState();
    const listed = spinesAt(state, T0).spines;
    const picks = RUN_KEYS.map((key) => {
      const s = listed.find((x) => x.id === sid(key));
      const top = s ? topMatchOf(s) : null;
      if (!top) throw new Error(`no top match for ${key}`);
      return { spineId: sid(key), candidateId: top.id };
    });
    const res = startBulk(state, picks, T0);
    if (res.status !== 'ok') throw new Error(`startBulk ${res.status}`);
    const last = Math.max(...state.bulkItems.map((i) => i.readyAt));
    return { after: last + IMPORT_READY_MS };
  }

  const spineAt = (key: string, now: number) =>
    spinesAt(getState(), now).spines.find((s) => s.id === sid(key));

  it('a picked spine reads finding and Matched while its pressing is found', () => {
    run();
    const at = T0 + 100;
    for (const key of RUN_KEYS) {
      const s = spineAt(key, at);
      expect(s?.bulk?.item?.phase, key).toBe('finding');
      expect(s?.bulk?.eligible, key).toBe(false);
      expect(s?.bulk?.reason, key).toBe('finding');
      expect(s?.reviewStatus, key).toBe('matched');
      expect(s?.bulk?.item).toMatchObject({
        preferredCountry: 'Canada',
        fallbackCountry: 'US',
        outcome: null,
        releaseId: null,
        country: null,
        importId: null,
        skip: null,
        failure: null,
        createdAt: T0,
      });
    }
    expect(spinesAt(getState(), at).discogsActive).toBe(true);
  });

  it("each item carries its run's fallback country, not the live setting (G-06-side-1)", () => {
    run();
    getState().account.fallbackCountry = 'UK';
    expect(spineAt(RUN_KEYS[0], T0 + 100)?.bulk?.item?.fallbackCountry).toBe(
      'US',
    );
  });

  it('a run started with no distinct fallback country gives null', () => {
    getState().account.fallbackCountry = 'Canada';
    run();
    expect(
      spineAt(RUN_KEYS[0], T0 + 100)?.bulk?.item?.fallbackCountry,
    ).toBeNull();
  });

  it('the status response counts finding items as Discogs jobs and imports left', () => {
    const before = buildStatusResponse(getState(), T0);
    run();
    const at = T0 + 100;
    const during = buildStatusResponse(getState(), at);
    // Item 0 is running, items 1..5 queued; no bulk import exists yet.
    expect(during.discogs.imports.left).toBe(
      before.discogs.imports.left + RUN_KEYS.length,
    );
    expect(during.jobs.discogs.running).toBe(before.jobs.discogs.running + 1);
    expect(during.jobs.discogs.queued).toBe(
      before.jobs.discogs.queued + RUN_KEYS.length - 1,
    );
  });

  it('response.bulk summarizes the latest run with summarizeRun', () => {
    const { after } = run();
    const during = spinesAt(getState(), T0 + 100);
    expect(during.bulk?.running).toBe(true);
    expect(during.bulk).toMatchObject({
      country: 'Canada',
      folderName: 'Uncategorized',
      total: 6,
      done: 0,
      createdAt: T0,
    });
    const done = spinesAt(getState(), after);
    expect(done.bulk).toMatchObject({
      total: 6,
      done: 6,
      added: 5,
      fallbacks: 3,
      duplicates: 1,
      changed: 0,
      failed: 0,
      running: false,
    });
    expect(done.discogsActive).toBe(false);
  });

  it('response.bulk is null before any run', () => {
    expect(spinesAt(getState(), T0).bulk).toBeNull();
  });

  it('a UK fallback reads the fallback badge and appears under the Fallback filter', () => {
    const { after } = run();
    const s = spineAt('15', after);
    expect(s?.bulk?.item).toMatchObject({
      phase: 'resolved',
      outcome: 'fallback_no_version',
      country: 'UK',
    });
    expect(s && countryBadgeOf(s)).toEqual({ kind: 'fallback', country: 'UK' });
    expect(s?.reviewStatus).toBe('imported');
    const filtered = buildSpinesResponse(getState(), after, { fallback: true });
    expect(filtered.spines.map((x) => x.id)).toContain(sid('15'));
    expect(filtered.spines.map((x) => x.id)).not.toContain(sid('11'));
    expect(filtered.counts.fallback).toBe(3);
  });

  it('spine 40 imports the Canadian pressing but never lists it', () => {
    const { after } = run();
    const s = spineAt('40', after);
    expect(s?.import?.releaseId).toBe(1408104);
    expect(s?.bulk?.item).toMatchObject({
      phase: 'resolved',
      outcome: 'preferred',
      releaseId: 1408104,
      country: 'Canada',
      importId: s?.import?.id,
    });
    expect(s && countryBadgeOf(s)?.kind).toBe('preferred');
    const ids = getState()
      .candidates.filter((c) => c.source === 'pressing')
      .map((c) => c.id);
    expect(ids).toEqual(['demo-cand-40-pressing-1408104']);
    for (const x of spinesAt(getState(), after).spines) {
      for (const c of x.discogs?.topCandidates ?? []) {
        expect(ids).not.toContain(c.id);
      }
      expect(ids).not.toContain(topMatchOf(x)?.id);
    }
    expect(topMatchOf(s ?? { discogs: null })?.releaseId).not.toBe(1408104);
  });

  it('spine 31 shows the duplicate skip naming spine 29', () => {
    const { after } = run();
    const holder = getState().spines.find((x) => x.id === sid('29'));
    const s = spineAt('31', after);
    expect(s?.bulk?.item).toMatchObject({
      phase: 'skipped',
      importId: null,
      skip: {
        reason: 'duplicate',
        photo: 'cd-spines.heic',
        spineNumber: (holder?.index ?? -2) + 1,
        samePhoto: true,
      },
    });
    expect(s?.bulk?.reason).toBe('skipped_duplicate');
  });

  it('a later manual import replaces the bulk item', () => {
    const { after } = run();
    const state = getState();
    const imp = state.imports.find((i) => i.spineId === sid('15'));
    expect(imp).toBeDefined();
    if (!imp) return;
    state.imports.push({
      ...structuredClone(imp),
      id: 'manual-later',
      createdAt: after + 1,
      runningAt: after + 2,
      readyAt: after + 3,
    });
    expect(spineAt('15', after + 10)?.bulk?.item).toBeNull();
  });
});
