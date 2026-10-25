import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { topMatchOf } from '@/lib/bulk-eligibility';
import type { SpinesResponse } from '@/lib/scan-types';
import { buildSpinesResponse } from '../read-model';
import { handle } from '../routes';
import { getState, resetStore, setClock } from '../store';

// D-17, T-06-18: the demo answers POST /api/spines/bulk-import in memory
// with the real route's status codes and messages.

const T0 = Date.UTC(2026, 9, 23, 12, 0, 0);
const ORIGIN = 'http://127.0.0.1:4173';
const id = (key: string) => `demo-spine-${key}`;

beforeEach(() => {
  setClock(() => T0);
  resetStore();
});

afterEach(() => {
  setClock(null);
  vi.restoreAllMocks();
});

function post(body: unknown, contentType = 'application/json') {
  return handle({
    method: 'POST',
    url: new URL('/api/spines/bulk-import', ORIGIN),
    headers: new Headers({ 'content-type': contentType }),
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** The pick the UI would send: the spine and its top match. */
function pick(key: string): { spineId: string; candidateId: string } {
  const spine = buildSpinesResponse(getState(), T0).spines.find(
    (s) => s.id === id(key),
  );
  const top = spine ? topMatchOf(spine) : null;
  if (!top) throw new Error(`no top match for spine ${key}`);
  return { spineId: id(key), candidateId: top.id };
}

async function spines(): Promise<SpinesResponse> {
  const res = await handle({
    method: 'GET',
    url: new URL('/api/spines', ORIGIN),
    headers: new Headers(),
    body: null,
  });
  return res.body as SpinesResponse;
}

describe('demo POST /api/spines/bulk-import', () => {
  it('starts a run for two eligible picks and the spines read finding', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await post({ items: [pick('11'), pick('40')] });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      runId: expect.any(String),
      started: 2,
      skipped: 0,
    });
    const listed = (await spines()).spines;
    for (const key of ['11', '40']) {
      expect(listed.find((s) => s.id === id(key))?.bulk?.item?.phase).toBe(
        'finding',
      );
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('409 not_connected with the real Connect and Reconnect messages', async () => {
    const items = [pick('11')];
    getState().account.connected = false;
    const out = await post({ items });
    expect(out).toMatchObject({
      status: 409,
      body: {
        error: 'not_connected',
        message: 'Connect Discogs in Settings first',
      },
    });
    getState().account.connected = true;
    getState().account.needsReconnect = true;
    const refused = await post({ items });
    expect(refused).toMatchObject({
      status: 409,
      body: {
        error: 'not_connected',
        message: 'Reconnect Discogs in Settings first',
      },
    });
    expect(getState().bulkRuns).toHaveLength(0);
  });

  it('409 bulk_running while a demo item is still finding', async () => {
    expect((await post({ items: [pick('11')] })).status).toBe(201);
    const res = await post({ items: [pick('40')] });
    expect(res).toMatchObject({
      status: 409,
      body: {
        error: 'bulk_running',
        message: 'Wait for the current bulk import to finish',
      },
    });
    expect(getState().bulkRuns).toHaveLength(1);
  });

  it('409 nothing_to_import when every pick is skipped', async () => {
    const res = await post({
      items: [{ spineId: 'demo-spine-nope', candidateId: 'nope' }],
    });
    expect(res).toMatchObject({
      status: 409,
      body: {
        error: 'nothing_to_import',
        message: 'None of the picked spines can be imported now',
      },
    });
    expect(getState().bulkRuns).toHaveLength(0);
  });

  it('400 invalid_body for bodies the schema refuses and 415 for non-JSON', async () => {
    const good = pick('11');
    expect((await post({ items: [good] }, 'text/plain')).status).toBe(415);
    for (const body of [
      '{nope',
      { items: [] },
      { items: [{ ...good, releaseId: 1 }] },
      { items: [good], country: 'US' },
    ]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect((res.body as { error: string }).error).toBe('invalid_body');
    }
    expect(getState().bulkRuns).toHaveLength(0);
  });
});
