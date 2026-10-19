import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';
import {
  claimNext,
  complete,
  countsByLaneStatus,
  enqueue,
  listJobs,
} from './queue';
import { JOB_STATUSES, LANES } from './types';

const T0 = 1_700_000_000_000;

describe('jobs queue (happy path)', () => {
  const dataDir = useTempDataDir();

  it('runs each test against its own migrated app.db in the temp DATA_DIR', () => {
    expect(fs.existsSync(path.join(dataDir(), 'app.db'))).toBe(true);
    expect(listJobs()).toEqual([]);
  });

  it('enqueue -> claimNext -> complete ends succeeded with attempts 1', () => {
    const { id, created } = enqueue({
      lane: 'anthropic',
      type: 'noop',
      payload: { ms: 0 },
      runAfter: T0,
    });
    expect(created).toBe(true);

    const claimed = claimNext('anthropic', T0);
    expect(claimed?.id).toBe(id);
    expect(claimed?.status).toBe('running');
    expect(claimed?.attempts).toBe(1);

    expect(complete(id, T0 + 1)).toBe(true);
    const [job] = listJobs();
    expect(job).toMatchObject({
      id,
      status: 'succeeded',
      attempts: 1,
      finishedAt: T0 + 1,
      lockedAt: null,
    });
  });

  it('claimNext returns undefined once the only job is claimed', () => {
    enqueue({ lane: 'discogs', type: 'noop', runAfter: T0 });
    expect(claimNext('discogs', T0)).toBeDefined();
    expect(claimNext('discogs', T0)).toBeUndefined();
  });

  it('complete on an already-succeeded job returns false (exactly-once completion)', () => {
    const { id } = enqueue({ lane: 'anthropic', type: 'noop', runAfter: T0 });
    claimNext('anthropic', T0);
    expect(complete(id, T0 + 1)).toBe(true);
    expect(complete(id, T0 + 2)).toBe(false);
    expect(listJobs()[0]?.finishedAt).toBe(T0 + 1);
  });

  it('countsByLaneStatus on an empty database returns every lane and status at 0', () => {
    const counts = countsByLaneStatus();
    expect(Object.keys(counts).sort()).toEqual([...LANES].sort());
    for (const lane of LANES) {
      expect(Object.keys(counts[lane]).sort()).toEqual(
        [...JOB_STATUSES].sort(),
      );
      for (const status of JOB_STATUSES) expect(counts[lane][status]).toBe(0);
    }
  });

  it('a later test sees an empty jobs table (no state leaks between tests)', () => {
    expect(listJobs()).toEqual([]);
    expect(countsByLaneStatus().anthropic.succeeded).toBe(0);
  });
});
