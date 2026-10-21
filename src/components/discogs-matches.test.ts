import { describe, expect, it } from 'vitest';
import { getDb } from '@/server/db/client';
import { inputHash, loadSpineInputs } from '@/server/discogs/inputs';
import { discogsForSpines } from '@/server/discogs/queries';
import { createSearch, finishSearch } from '@/server/discogs/store';
import { orphanScenario } from '../../test/helpers/scan-runs';
import { useTempDataDir } from '../../test/helpers/temp-data-dir';
import { matchesAction } from './discogs-matches';

// The card state of a spine whose latest auto search ended skipped (DISC-03):
// the read model shows it as not searched, and the header offers no action
// (it is neither failed nor a changed-fields baseline).

describe('skipped search card state', () => {
  useTempDataDir();

  it('a skipped latest auto search reads not_searched with no header action', async () => {
    const { spineIds } = await orphanScenario();
    const id = spineIds[0];
    const db = getDb().$client;
    const inputs = loadSpineInputs(db, id);
    const searchId = createSearch(db, {
      spineId: id,
      kind: 'auto',
      inputs,
      inputHash: inputHash(inputs),
    });
    finishSearch(db, searchId, { status: 'skipped' });
    const discogs = discogsForSpines(db, [{ id }]).get(id) ?? null;
    expect(discogs).toMatchObject({
      state: 'not_searched',
      failure: null,
      fieldsChanged: false,
      candidateCount: 0,
    });
    expect(matchesAction({ discogs })).toBeNull();
  });

  it('matchesAction maps failed to retry and changed fields to again, except while queued or searching', () => {
    const base = {
      candidateCount: 0,
      topCandidates: [],
      failure: null,
      fieldsChanged: false,
    };
    expect(matchesAction({ discogs: null })).toBeNull();
    expect(
      matchesAction({
        discogs: { ...base, state: 'failed', fieldsChanged: true },
      }),
    ).toBe('retry');
    expect(
      matchesAction({
        discogs: { ...base, state: 'done', fieldsChanged: true },
      }),
    ).toBe('again');
    expect(
      matchesAction({
        discogs: { ...base, state: 'not_searched', fieldsChanged: true },
      }),
    ).toBe('again');
    for (const state of ['queued', 'searching'] as const) {
      expect(
        matchesAction({ discogs: { ...base, state, fieldsChanged: true } }),
      ).toBeNull();
    }
    expect(matchesAction({ discogs: { ...base, state: 'done' } })).toBeNull();
  });
});
