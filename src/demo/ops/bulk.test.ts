import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { topMatchOf } from '@/lib/bulk-eligibility';
import pressingsJson from '../../../demo/fixtures/pressings.json';
import { buildSpinesResponse } from '../read-model';
import { recordingFor } from '../seed';
import { type DemoBulkItem, getState, resetStore, setClock } from '../store';
import {
  BULK_LOOKUP_MS,
  BULK_STEP_MS,
  bulkItemPhaseAt,
  startBulk,
} from './bulk';
import { retrySpine, startImport } from './imports';

// D-17, D-20, T-06-25: a demo bulk import runs in memory from canned pressing
// outcomes, with every outcome the real job produces, and its state comes
// from timestamps instead of timers.

const T0 = Date.UTC(2026, 9, 23, 12, 0, 0);
const ROOT = path.resolve(import.meta.dirname, '../../..');
const COVERS = path.join(ROOT, 'demo/assets/covers');
const RUN_KEYS = ['11', '40', '15', '16', '31', '42'] as const;
let clockNow = T0;

beforeEach(() => {
  clockNow = T0;
  setClock(() => clockNow);
  resetStore();
});

afterEach(() => {
  setClock(null);
  vi.restoreAllMocks();
});

const id = (key: string) => `demo-spine-${key}`;

/** The pick the UI would send: the spine and its top match at `now`. */
function pick(key: string, now = T0): { spineId: string; candidateId: string } {
  const spine = buildSpinesResponse(getState(), now).spines.find(
    (s) => s.id === id(key),
  );
  const top = spine ? topMatchOf(spine) : null;
  if (!top) throw new Error(`no top match for spine ${key}`);
  return { spineId: id(key), candidateId: top.id };
}

function itemOf(key: string): DemoBulkItem {
  const item = getState().bulkItems.find((i) => i.spineId === id(key));
  if (!item) throw new Error(`no bulk item for spine ${key}`);
  return item;
}

const runPicks = () => RUN_KEYS.map((k) => pick(k));
const lastReadyAt = () =>
  Math.max(...getState().bulkItems.map((i) => i.readyAt));

describe('startBulk', () => {
  it('starts every eligible pick of the six-spine run', () => {
    const res = startBulk(getState(), runPicks(), T0);
    expect(res.status).toBe('ok');
    expect(res).toEqual({
      status: 'ok',
      runId: expect.any(String),
      started: 6,
      skipped: 0,
    });
    expect(getState().bulkRuns).toHaveLength(1);
    expect(getState().bulkRuns[0]).toMatchObject({
      country: 'Canada',
      folderId: 1,
      total: 6,
      createdAt: T0,
    });
    expect(getState().bulkItems).toHaveLength(6);
  });

  it('spaces the lookups BULK_STEP_MS apart, each BULK_LOOKUP_MS long', () => {
    startBulk(getState(), runPicks(), T0);
    RUN_KEYS.forEach((key, i) => {
      const item = itemOf(key);
      expect(item.lookupAt).toBe(T0 + i * BULK_STEP_MS);
      expect(item.readyAt).toBe(T0 + i * BULK_STEP_MS + BULK_LOOKUP_MS);
    });
  });

  it('reads finding before readyAt and the stored outcome from then on', () => {
    startBulk(getState(), runPicks(), T0);
    for (const key of RUN_KEYS) {
      const item = itemOf(key);
      expect(bulkItemPhaseAt(item, item.readyAt - 1)).toBe('finding');
      expect(bulkItemPhaseAt(item, item.readyAt)).toBe(item.status);
    }
  });

  it('a top match in the preferred country is imported as is', () => {
    const top = pick('11');
    startBulk(getState(), runPicks(), T0);
    const item = itemOf('11');
    const cand = getState().candidates.find((c) => c.id === top.candidateId);
    expect(item).toMatchObject({
      status: 'resolved',
      outcome: 'preferred',
      releaseId: cand?.releaseId,
      country: 'Canada',
      candidateId: top.candidateId,
    });
    const imp = getState().imports.find((i) => i.id === item.importId);
    expect(imp?.releaseId).toBe(cand?.releaseId);
    expect(imp?.createdAt).toBe(item.readyAt);
  });

  it('a canned pressing imports the Canadian release through a hidden candidate', () => {
    startBulk(getState(), runPicks(), T0);
    const item = itemOf('40');
    expect(item).toMatchObject({
      status: 'resolved',
      outcome: 'preferred',
      releaseId: 1408104,
      country: 'Canada',
    });
    const imp = getState().imports.find((i) => i.id === item.importId);
    expect(imp?.releaseId).toBe(1408104);
    const cand = getState().candidates.find((c) => c.id === imp?.candidateId);
    expect(cand).toMatchObject({
      id: 'demo-cand-40-pressing-1408104',
      source: 'pressing',
      spineId: id('40'),
      releaseId: 1408104,
      addedAt: item.readyAt,
    });
  });

  it('a top match with no Canadian version falls back to itself', () => {
    const top = pick('15');
    startBulk(getState(), runPicks(), T0);
    const item = itemOf('15');
    expect(item).toMatchObject({
      status: 'resolved',
      outcome: 'fallback_no_version',
      country: 'UK',
      candidateId: top.candidateId,
    });
    const imp = getState().imports.find((i) => i.id === item.importId);
    expect(imp?.candidateId).toBe(top.candidateId);
  });

  it('a canned fallback_no_master keeps the top match', () => {
    const top = pick('16');
    startBulk(getState(), runPicks(), T0);
    const item = itemOf('16');
    expect(item).toMatchObject({
      status: 'resolved',
      outcome: 'fallback_no_master',
    });
    const imp = getState().imports.find((i) => i.id === item.importId);
    expect(imp?.candidateId).toBe(top.candidateId);
  });

  it('spine 31 is skipped as a duplicate of spine 29', () => {
    startBulk(getState(), runPicks(), T0);
    expect(itemOf('31')).toMatchObject({
      status: 'skipped',
      skipReason: 'duplicate',
      dupSpineId: id('29'),
      importId: null,
    });
    expect(
      getState().imports.filter((i) => i.spineId === id('31')),
    ).toHaveLength(0);
  });

  it('spine 42, whose earlier import failed, gets a new import (D-20)', () => {
    startBulk(getState(), runPicks(), T0);
    const item = itemOf('42');
    expect(item.status).toBe('resolved');
    expect(item.importId).not.toBeNull();
    expect(item.importId).not.toBe('demo-import-42');
    expect(item.outcome).toBe('fallback_no_version');
    const imports = getState().imports.filter((i) => i.spineId === id('42'));
    expect(imports).toHaveLength(2);
  });

  it('answers busy while any item is still finding', () => {
    startBulk(getState(), runPicks(), T0);
    expect(startBulk(getState(), [pick('17')], T0 + 100)).toEqual({
      status: 'busy',
    });
    const after = lastReadyAt();
    expect(startBulk(getState(), [pick('17', after)], after)).toMatchObject({
      status: 'ok',
      started: 1,
    });
  });

  it('skips picks that are no longer the top match, ineligible or repeated', () => {
    const wrong = getState().candidates.find(
      (c) => c.spineId === id('11') && c.id !== pick('11').candidateId,
    );
    expect(wrong).toBeDefined();
    const res = startBulk(
      getState(),
      [
        { spineId: id('11'), candidateId: wrong?.id ?? '' },
        { spineId: id('09'), candidateId: 'demo-cand-09-0' },
        pick('15'),
        pick('15'),
      ],
      T0,
    );
    expect(res).toMatchObject({ status: 'ok', started: 1, skipped: 3 });
  });

  it('answers nothing when every pick is skipped', () => {
    expect(
      startBulk(
        getState(),
        [
          { spineId: id('09'), candidateId: 'demo-cand-09-0' },
          { spineId: 'demo-spine-nope', candidateId: 'x' },
        ],
        T0,
      ),
    ).toEqual({ status: 'nothing', skipped: 2 });
    expect(getState().bulkRuns).toHaveLength(0);
  });

  it('a manual Add while its pressing is being found answers already_confirmed', () => {
    const top = pick('15');
    startBulk(getState(), runPicks(), T0);
    expect(startImport(getState(), top, T0 + 100)).toEqual({
      status: 'already_confirmed',
    });
  });

  it('Retry on a spine whose pressing is being found answers busy', () => {
    startBulk(getState(), runPicks(), T0);
    expect(retrySpine(getState(), id('42'), T0 + 100)).toEqual({
      status: 'busy',
    });
  });

  it('makes no network request', () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    startBulk(getState(), runPicks(), T0);
    clockNow = lastReadyAt() + 10_000;
    buildSpinesResponse(getState(), clockNow);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('demo/fixtures/pressings.json', () => {
  type Entry = { outcome: string; releaseId?: number };
  const byKey = (pressingsJson as { byKey: Record<string, Entry> }).byKey;

  it('has the canned keys', () => {
    expect(Object.keys(byKey).sort()).toEqual([
      '06',
      '08',
      '16',
      '17',
      '40',
      '55',
    ]);
  });

  it('every pressing names a recorded Canadian candidate with a cover', () => {
    for (const [key, entry] of Object.entries(byKey)) {
      if (entry.outcome !== 'pressing') {
        expect(entry.outcome).toBe('fallback_no_master');
        continue;
      }
      const rec = recordingFor(key);
      const cand = rec?.candidates.find((c) => c.releaseId === entry.releaseId);
      expect(cand?.country, `key ${key}`).toBe('Canada');
      expect(
        fs.existsSync(path.join(COVERS, `${entry.releaseId}.svg`)),
        `cover ${entry.releaseId}`,
      ).toBe(true);
    }
  });
});
