import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDuplicateBody } from '@/components/duplicate-import-dialog';
import type { SpineDto, SpinesResponse } from '@/lib/scan-types';
import type { StatusResponse } from '@/lib/status-types';
import { handle } from '../routes';
import { getState, resetStore, setClock } from '../store';

// D-09, D-14, D-04: imports, the duplicate and already-in-collection
// warnings, Change match and the retries run in memory with the real
// routes' contracts and phases, and nothing stays in flight.

const T0 = Date.UTC(2026, 9, 23, 12, 0, 0);
const ORIGIN = 'http://127.0.0.1:4173';
const HELD_INSTANCE_ID = 987_654_321;
let clockNow = T0;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  clockNow = T0;
  setClock(() => clockNow);
  resetStore();
});

afterEach(() => {
  setClock(null);
  vi.useRealTimers();
});

async function call(
  method: string,
  path: string,
  body?: unknown,
  opts: { raw?: string | null; contentType?: string | null } = {},
): Promise<{ status: number; body: unknown }> {
  const headers = new Headers();
  const contentType =
    opts.contentType === undefined ? 'application/json' : opts.contentType;
  if (contentType !== null) headers.set('content-type', contentType);
  const raw =
    opts.raw !== undefined
      ? opts.raw
      : body === undefined
        ? null
        : JSON.stringify(body);
  const pending = handle({
    method,
    url: new URL(path, ORIGIN),
    headers,
    body: raw,
  });
  await vi.runAllTimersAsync();
  const res = await pending;
  return { status: res.status, body: res.body };
}

const advance = (ms: number) => {
  clockNow += ms;
};

const id = (key: string) => `demo-spine-${key}`;

async function spines(): Promise<SpinesResponse> {
  return (await call('GET', '/api/spines')).body as SpinesResponse;
}

async function status(): Promise<StatusResponse> {
  return (await call('GET', '/api/status')).body as StatusResponse;
}

async function spine(key: string): Promise<SpineDto> {
  const s = (await spines()).spines.find((x) => x.id === id(key));
  if (!s) throw new Error(`no spine ${key}`);
  return s;
}

async function topCandidateId(key: string): Promise<string> {
  const c = (await spine(key)).discogs?.topCandidates[0];
  if (!c) throw new Error(`no candidate on ${key}`);
  return c.id;
}

const importPath = (key: string) => `/api/spines/${id(key)}/import`;

async function expectSettled() {
  const list = await spines();
  expect(list.discogsActive).toBe(false);
  const st = await status();
  expect(st.discogs.imports.left).toBe(0);
  expect(st.discogs.backlog).toBe(0);
}

describe('POST /api/spines/:id/import', () => {
  it('runs waiting -> importing -> imported and adds the release to the collection', async () => {
    const candidateId = await topCandidateId('00');
    const res = await call('POST', importPath('00'), { candidateId });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ importId: expect.any(String) });

    let s = await spine('00');
    expect(s.import?.phase).toBe('waiting');
    expect(s.import?.canChangeMatch).toBe(true);
    expect(s.import?.candidateId).toBe(candidateId);
    expect((await spines()).discogsActive).toBe(true);
    expect((await status()).discogs.imports.left).toBe(1);

    advance(700);
    s = await spine('00');
    expect(s.import?.phase).toBe('importing');
    expect(s.import?.canChangeMatch).toBe(false);

    advance(1500);
    s = await spine('00');
    expect(s.import?.phase).toBe('imported');
    expect(s.reviewStatus).toBe('imported');
    const instanceId = s.import?.instanceId;
    expect(typeof instanceId).toBe('number');
    const releaseId = s.import?.releaseId ?? -1;
    expect(
      getState().collection[releaseId]?.map((c) => c.instanceId),
    ).toContain(instanceId);
    await expectSettled();

    expect(await call('POST', importPath('00'), { candidateId })).toEqual({
      status: 409,
      body: {
        error: 'already_confirmed',
        message:
          'This spine already has a match being added. It will show here in a moment.',
      },
    });
  });

  it('answers the real refusals', async () => {
    expect(
      await call('POST', importPath('00'), { candidateId: 'nope' }),
    ).toEqual({
      status: 404,
      body: {
        error: 'no_candidate',
        message: 'That match is no longer listed for this spine.',
      },
    });
    expect(
      await call('POST', '/api/spines/nope/import', { candidateId: 'x' }),
    ).toEqual({
      status: 404,
      body: { error: 'not_found', message: 'This spine no longer exists.' },
    });
    expect(await call('POST', importPath('25'), { candidateId: 'x' })).toEqual({
      status: 409,
      body: {
        error: 'not_on_discogs',
        message: 'This spine is marked not on Discogs. Unmark it first.',
      },
    });
    expect(
      (await call('POST', importPath('00'), { candidateId: 'x', extra: 1 }))
        .status,
    ).toBe(400);
    expect(
      await call('POST', importPath('00'), undefined, { raw: '{' }),
    ).toEqual({
      status: 400,
      body: { error: 'invalid_body', message: 'The request body is not JSON.' },
    });
    getState().account.connected = false;
    expect(await call('POST', importPath('00'), { candidateId: 'x' })).toEqual({
      status: 409,
      body: {
        error: 'not_connected',
        message: 'Connect Discogs in Settings first',
      },
    });
  });
});

describe('already in collection (D-09)', () => {
  it('a release already held ends in the warning with the held copy', async () => {
    // Change match on the seeded hold, then confirm the same release again.
    expect(await call('DELETE', importPath('14'), {})).toEqual({
      status: 200,
      body: { cancelled: true },
    });
    expect((await spine('14')).import).toBeNull();
    const candidateId = await topCandidateId('14');
    expect((await call('POST', importPath('14'), { candidateId })).status).toBe(
      201,
    );
    advance(2200);
    const s = await spine('14');
    expect(s.import?.phase).toBe('already_in_collection');
    expect(s.import?.existing).toEqual({
      count: 1,
      folderId: 1,
      folderName: 'Uncategorized',
      dateAdded: '2014-08-17T19:42:03-07:00',
    });
    await expectSettled();
  });

  it('Link existing copy reads imported with the held copy', async () => {
    const res = await call(
      'POST',
      `/api/spines/${id('14')}/import/link-existing`,
      {},
    );
    expect(res).toEqual({
      status: 200,
      body: { importId: 'demo-import-14', instanceId: HELD_INSTANCE_ID },
    });
    const s = await spine('14');
    expect(s.import).toMatchObject({
      phase: 'imported',
      linked: true,
      instanceId: HELD_INSTANCE_ID,
    });
    expect(s.reviewStatus).toBe('imported');
    expect(
      await call('POST', `/api/spines/${id('14')}/import/link-existing`, {}),
    ).toEqual({
      status: 409,
      body: {
        error: 'not_held',
        message: 'This spine is not waiting on that choice any more.',
      },
    });
    expect(
      await call('POST', `/api/spines/${id('00')}/import/link-existing`, {}),
    ).toEqual({
      status: 404,
      body: {
        error: 'not_found',
        message: 'This spine has no import to link.',
      },
    });
  });

  it('Add another copy runs a new import that ends imported with a new instance', async () => {
    const path = `/api/spines/${id('14')}/import/another`;
    expect(await call('POST', path, {})).toEqual({
      status: 201,
      body: { importId: 'demo-import-14' },
    });
    expect((await spine('14')).import?.phase).toBe('waiting');
    // Idempotent while that job is still queued.
    expect(await call('POST', path, {})).toEqual({
      status: 201,
      body: { importId: 'demo-import-14' },
    });
    advance(700);
    expect((await spine('14')).import?.phase).toBe('importing');
    expect(await call('POST', path, {})).toEqual({
      status: 409,
      body: {
        error: 'not_held',
        message: 'This spine is not waiting on that choice any more.',
      },
    });
    advance(1500);
    const s = await spine('14');
    expect(s.import?.phase).toBe('imported');
    expect(s.import?.linked).toBe(false);
    expect(s.import?.instanceId).not.toBe(HELD_INSTANCE_ID);
    expect(typeof s.import?.instanceId).toBe('number');
    expect(getState().collection[s.import?.releaseId ?? -1]).toHaveLength(2);
    await expectSettled();
  });

  it('Add another copy needs a connection and a held import', async () => {
    expect(
      await call('POST', `/api/spines/${id('00')}/import/another`, {}),
    ).toEqual({
      status: 404,
      body: { error: 'not_found', message: 'This spine has no import to add.' },
    });
    expect(await call('POST', '/api/spines/nope/import/another', {})).toEqual({
      status: 404,
      body: { error: 'not_found', message: 'This spine no longer exists.' },
    });
    getState().account.needsReconnect = true;
    expect(
      await call('POST', `/api/spines/${id('14')}/import/another`, {}),
    ).toEqual({
      status: 409,
      body: {
        error: 'not_connected',
        message: 'Reconnect Discogs in Settings first',
      },
    });
  });
});

describe('local duplicate (D-09)', () => {
  it('answers 409 with the other spine; allowDuplicate proceeds and ends imported', async () => {
    const res = await call('POST', importPath('31'), {
      candidateId: 'demo-cand-31-manual',
    });
    expect(res.status).toBe(409);
    const body = parseDuplicateBody(res.body);
    expect(body).not.toBeNull();
    const held = getState().spines.find((s) => s.id === id('29'));
    expect(body).toEqual({
      error: 'duplicate',
      message:
        'This release is already going into your collection from another spine.',
      photo: 'cd-spines.heic',
      spineNumber: (held?.index ?? -2) + 1,
      cropUrl: `/demo-assets/${held?.crop?.file}`,
      done: true,
    });
    expect((await spine('31')).import).toBeNull();

    const ok = await call('POST', importPath('31'), {
      candidateId: 'demo-cand-31-manual',
      allowDuplicate: true,
    });
    expect(ok.status).toBe(201);
    advance(2200);
    const s = await spine('31');
    expect(s.import?.phase).toBe('imported');
    expect(s.import?.instanceId).not.toBe(
      (await spine('29')).import?.instanceId,
    );
    await expectSettled();
  });

  it('a still-running import is a duplicate that is not done yet', async () => {
    const candidateId = await topCandidateId('00');
    await call('POST', importPath('00'), { candidateId });
    // Spine 01 lists that release as a manual pick from the dialog.
    const searchRes = await call('POST', `/api/spines/${id('01')}/search`, {
      mode: 'text',
      value: '5822653',
    });
    const searchId = (searchRes.body as { searchId: string }).searchId;
    advance(1600);
    const pin = await call('POST', `/api/spines/${id('01')}/candidates`, {
      searchId,
      releaseId: 5822653,
    });
    const manual = (pin.body as { candidate: { id: string } }).candidate.id;
    const res = await call('POST', importPath('01'), { candidateId: manual });
    expect(res.status).toBe(409);
    expect(parseDuplicateBody(res.body)).toMatchObject({
      spineNumber: 1,
      done: false,
    });
  });
});

describe('DELETE /api/spines/:id/import (Change match)', () => {
  it('cancels a waiting import and the spine returns to its candidates', async () => {
    const candidateId = await topCandidateId('00');
    await call('POST', importPath('00'), { candidateId });
    const releaseId = (await spine('00')).import?.releaseId ?? -1;
    expect(await call('DELETE', importPath('00'), {})).toEqual({
      status: 200,
      body: { cancelled: true },
    });
    const s = await spine('00');
    expect(s.import).toBeNull();
    expect(s.reviewStatus).toBe('pending');
    expect(getState().collection[releaseId] ?? []).toHaveLength(0);
    await expectSettled();
  });

  it('refuses an importing or imported one, and answers 404 without an import', async () => {
    const started = {
      status: 409,
      body: {
        error: 'started',
        message:
          "It's already being added to Discogs, so the match can't be changed now.",
      },
    };
    const candidateId = await topCandidateId('00');
    await call('POST', importPath('00'), { candidateId });
    advance(700);
    expect(await call('DELETE', importPath('00'), {})).toEqual(started);
    expect(await call('DELETE', importPath('09'), {})).toEqual(started);
    expect(await call('DELETE', importPath('01'), {})).toEqual({
      status: 404,
      body: {
        error: 'not_found',
        message: 'This spine has no match to change.',
      },
    });
    expect((await call('DELETE', importPath('00'), { x: 1 })).status).toBe(400);
  });

  it('cancels the seeded failed import that never reached Discogs', async () => {
    expect(await call('DELETE', importPath('42'), {})).toEqual({
      status: 200,
      body: { cancelled: true },
    });
    expect((await spine('42')).reviewStatus).toBe('pending');
  });
});

describe('POST /api/spines/:id/retry', () => {
  it('retries the failed import on the same row until imported', async () => {
    const path = `/api/spines/${id('42')}/retry`;
    expect((await spine('42')).import?.phase).toBe('failed');
    expect(await call('POST', path, {})).toEqual({
      status: 201,
      body: { kind: 'import', importId: 'demo-import-42' },
    });
    expect((await spine('42')).import?.phase).toBe('waiting');
    // Idempotent: a waiting import returns the same job.
    expect(await call('POST', path, {})).toEqual({
      status: 201,
      body: { kind: 'import', importId: 'demo-import-42' },
    });
    advance(700);
    expect(await call('POST', path, {})).toEqual({
      status: 409,
      body: { error: 'busy', message: "It's already waiting or running." },
    });
    advance(1500);
    const s = await spine('42');
    expect(s.import?.phase).toBe('imported');
    expect(s.import?.failure).toBeNull();
    await expectSettled();
    expect(await call('POST', path, {})).toEqual({
      status: 409,
      body: {
        error: 'nothing_to_retry',
        message: 'Nothing failed on this spine.',
      },
    });
  });

  it('retries the failed search with an again search that ends done', async () => {
    const res = await call('POST', `/api/spines/${id('28')}/retry`, {});
    expect(res).toEqual({
      status: 201,
      body: { kind: 'search', searchId: expect.any(String) },
    });
    expect((await spine('28')).discogs?.state).toBe('queued');
    advance(1600);
    expect((await spine('28')).discogs?.state).toBe('done');
    await expectSettled();
  });

  it('answers the real refusals', async () => {
    const nothing = {
      status: 409,
      body: {
        error: 'nothing_to_retry',
        message: 'Nothing failed on this spine.',
      },
    };
    expect(await call('POST', `/api/spines/${id('09')}/retry`, {})).toEqual(
      nothing,
    );
    expect(await call('POST', `/api/spines/${id('25')}/retry`, {})).toEqual(
      nothing,
    );
    expect(await call('POST', `/api/spines/${id('00')}/retry`, {})).toEqual(
      nothing,
    );
    expect(await call('POST', '/api/spines/nope/retry', {})).toEqual({
      status: 404,
      body: { error: 'not_found', message: 'This spine no longer exists.' },
    });
    getState().account.connected = false;
    expect(
      (await call('POST', `/api/spines/${id('42')}/retry`, {})).status,
    ).toBe(409);
  });
});

describe('POST /api/spines/retry-failed', () => {
  it('retries every failed spine and the Failed count reaches 0', async () => {
    expect((await spines()).counts.byStatus.failed).toBe(2);
    expect(await call('POST', '/api/spines/retry-failed', {})).toEqual({
      status: 200,
      body: { retried: 2, skipped: 0 },
    });
    advance(5000);
    const list = await spines();
    expect(list.counts.byStatus.failed).toBe(0);
    const st = await status();
    expect(st.discogs.failedSpines).toBe(0);
    expect(st.discogs.imports.failed).toBe(0);
    await expectSettled();
  });

  it('a photo filter with no failed spines retries nothing', async () => {
    expect(
      await call('POST', '/api/spines/retry-failed', { photoId: 'nope' }),
    ).toEqual({ status: 200, body: { retried: 0, skipped: 0 } });
  });

  it('skips everything while Discogs is not connected', async () => {
    getState().account.connected = false;
    expect(await call('POST', '/api/spines/retry-failed', {})).toEqual({
      status: 200,
      body: { retried: 0, skipped: 2 },
    });
    expect(
      (await call('POST', '/api/spines/retry-failed', { all: true })).status,
    ).toBe(400);
  });
});
