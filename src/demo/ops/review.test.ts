import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MASTER_REFUSAL } from '@/lib/discogs-ref';
import {
  type CandidateDto,
  type CandidatesResponse,
  DIALOG_RESULTS_MAX,
  type DialogSearchDto,
} from '@/lib/discogs-types';
import type { SpineDto, SpineFieldDto, SpinesResponse } from '@/lib/scan-types';
import { MAX_FIELD_CHARS } from '@/lib/spine-review';
import { buildStatusResponse } from '../read-model';
import { handle } from '../routes';
import { allRecordedCandidates, cannedRelease, recordingFor } from '../seed';
import { getState, resetStore, setClock } from '../store';

// D-13, D-14, D-04: the demo's review actions answer with the real routes'
// contracts and move through the real states from memory, driven by a
// fake clock (RESEARCH Pattern 3).

const T0 = Date.UTC(2026, 9, 23, 12, 0, 0);
const ORIGIN = 'http://127.0.0.1:4173';
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

type CallOpts = { raw?: string | null; contentType?: string | null };

async function call(
  method: string,
  path: string,
  body?: unknown,
  opts: CallOpts = {},
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

async function spine(key: string): Promise<SpineDto> {
  const s = (await spines()).spines.find((x) => x.id === id(key));
  if (!s) throw new Error(`no spine ${key}`);
  return s;
}

function field(key: string, name: string) {
  const f = getState()
    .spines.find((s) => s.id === id(key))
    ?.fields.find((x) => x.field === name);
  if (!f) throw new Error(`no field ${name} on ${key}`);
  return f;
}

async function searchDto(searchId: string): Promise<DialogSearchDto> {
  const res = await call('GET', `/api/discogs/searches/${searchId}`);
  expect(res.status).toBe(200);
  return res.body as DialogSearchDto;
}

async function startDialog(key: string, mode: 'text' | 'ref', value: string) {
  const res = await call('POST', `/api/spines/${id(key)}/search`, {
    mode,
    value,
  });
  expect(res.status).toBe(201);
  return (res.body as { searchId: string }).searchId;
}

const RECORDED_IDS = new Set(allRecordedCandidates().map((c) => c.releaseId));

describe('PATCH /api/spines/:id/fields', () => {
  it('edits a field like updateSpineField and reverts it', async () => {
    const ai = field('00', 'artist').aiValue;
    const res = await call('PATCH', `/api/spines/${id('00')}/fields`, {
      field: 'artist',
      value: '  Massive Attack  ',
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      field: 'artist',
      aiValue: ai,
      value: 'Massive Attack',
      confidence: field('00', 'artist').confidence,
      editBaseAiValue: ai,
    } satisfies SpineFieldDto);
    expect((await spine('00')).discogs?.fieldsChanged).toBe(true);

    const back = await call('PATCH', `/api/spines/${id('00')}/fields`, {
      field: 'artist',
      revert: true,
    });
    expect(back.status).toBe(200);
    expect(back.body).toMatchObject({ value: ai, editBaseAiValue: null });
    expect((await spine('00')).discogs?.fieldsChanged).toBe(false);
  });

  it('treats a value equal to the AI read (trimmed) as unedited, and empty as null', async () => {
    const ai = field('00', 'title').aiValue;
    const same = await call('PATCH', `/api/spines/${id('00')}/fields`, {
      field: 'title',
      value: ` ${ai} `,
    });
    expect(same.body).toMatchObject({ value: ai, editBaseAiValue: null });
    const empty = await call('PATCH', `/api/spines/${id('00')}/fields`, {
      field: 'title',
      value: '   ',
    });
    expect(empty.body).toMatchObject({ value: null, editBaseAiValue: ai });
  });

  it('a field that does not feed the search leaves fieldsChanged false', async () => {
    await call('PATCH', `/api/spines/${id('00')}/fields`, {
      field: 'format',
      value: 'Vinyl',
    });
    expect((await spine('00')).discogs?.fieldsChanged).toBe(false);
  });

  it('answers the real 400, 404 and 415 bodies', async () => {
    const path = `/api/spines/${id('00')}/fields`;
    const long = await call('PATCH', path, {
      field: 'artist',
      value: 'x'.repeat(MAX_FIELD_CHARS + 1),
    });
    expect(long.status).toBe(400);
    expect(typeof (long.body as { error: unknown }).error).toBe('string');
    expect(await call('PATCH', path, undefined, { raw: '{nope' })).toEqual({
      status: 400,
      body: { error: 'invalid JSON body' },
    });
    expect(
      (await call('PATCH', path, { field: 'colour', value: 'x' })).status,
    ).toBe(400);
    expect(
      (await call('PATCH', path, { field: 'artist', value: 'x', extra: 1 }))
        .status,
    ).toBe(400);
    expect(
      await call('PATCH', '/api/spines/nope/fields', {
        field: 'artist',
        value: 'x',
      }),
    ).toEqual({ status: 404, body: { error: 'spine not found' } });
    expect(
      await call(
        'PATCH',
        path,
        { field: 'artist', value: 'x' },
        { contentType: 'text/plain' },
      ),
    ).toEqual({
      status: 415,
      body: { error: 'content-type must be application/json' },
    });
  });

  it('refuses a superseded spine with 409', async () => {
    const s = getState().spines.find((x) => x.id === id('00'));
    if (s) s.state = 'superseded';
    expect(
      await call('PATCH', `/api/spines/${id('00')}/fields`, {
        field: 'artist',
        value: 'x',
      }),
    ).toEqual({
      status: 409,
      body: { error: 'this spine can no longer be edited' },
    });
  });
});

describe('POST /api/spines/:id/search {mode: again}', () => {
  it('re-runs the failed search: queued, searching, then done with the recording', async () => {
    expect((await spine('28')).discogs?.state).toBe('failed');
    const res = await call('POST', `/api/spines/${id('28')}/search`, {
      mode: 'again',
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ searchId: expect.any(String) });
    expect((await spine('28')).discogs?.state).toBe('queued');
    expect((await spines()).discogsActive).toBe(true);

    const busy = await call('POST', `/api/spines/${id('28')}/search`, {
      mode: 'again',
    });
    expect(busy).toEqual({
      status: 409,
      body: {
        error: 'busy',
        message: 'A search for this spine is already waiting or running',
      },
    });

    advance(400);
    expect((await spine('28')).discogs?.state).toBe('searching');
    advance(1200);
    const done = await spine('28');
    expect(done.discogs?.state).toBe('done');
    expect(done.discogs?.candidateCount).toBe(
      recordingFor('28')?.candidates.length,
    );
    expect(done.discogs?.failure).toBeNull();
    expect((await spines()).discogsActive).toBe(false);
  });

  it('searches the edited artist and title among the recordings', async () => {
    const path = `/api/spines/${id('05')}/fields`;
    await call('PATCH', path, { field: 'artist', value: 'nine inch nails' });
    await call('PATCH', path, { field: 'title', value: 'march of the pigs' });
    expect((await spine('05')).discogs?.fieldsChanged).toBe(true);
    await call('POST', `/api/spines/${id('05')}/search`, { mode: 'again' });
    advance(5000);
    const s = await spine('05');
    expect(s.discogs?.state).toBe('done');
    expect(s.discogs?.fieldsChanged).toBe(false);
    expect(s.discogs?.topCandidates.map((c) => c.releaseId)).toContain(
      10852960,
    );
    const all = (await call('GET', `/api/spines/${id('05')}/candidates`))
      .body as CandidatesResponse;
    expect(all.candidates.every((c) => RECORDED_IDS.has(c.releaseId))).toBe(
      true,
    );
  });

  it('keeps the old candidates until the new search finishes', async () => {
    const before = (await spine('00')).discogs?.candidateCount;
    await call('PATCH', `/api/spines/${id('00')}/fields`, {
      field: 'title',
      value: 'zzqx no such title',
    });
    await call('POST', `/api/spines/${id('00')}/search`, { mode: 'again' });
    advance(400);
    expect((await spine('00')).discogs?.candidateCount).toBe(before);
    advance(1200);
    const s = await spine('00');
    expect(s.discogs?.state).toBe('no_match');
    expect(s.discogs?.candidateCount).toBe(0);
  });

  it('answers not_connected while Discogs is disconnected or rejected', async () => {
    getState().account.connected = false;
    expect(
      await call('POST', `/api/spines/${id('28')}/search`, { mode: 'again' }),
    ).toEqual({
      status: 409,
      body: {
        error: 'not_connected',
        message: 'Connect Discogs in Settings first',
      },
    });
    getState().account.connected = true;
    getState().account.needsReconnect = true;
    expect(
      (await call('POST', `/api/spines/${id('28')}/search`, { mode: 'again' }))
        .body,
    ).toEqual({
      error: 'not_connected',
      message: 'Reconnect Discogs in Settings first',
    });
  });

  it('answers the real 404, 400 and 415 bodies', async () => {
    expect(
      await call('POST', '/api/spines/nope/search', { mode: 'again' }),
    ).toEqual({
      status: 404,
      body: { error: 'not_found', message: 'This spine no longer exists.' },
    });
    const bad = await call('POST', `/api/spines/${id('00')}/search`, {
      mode: 'again',
      value: 'x',
    });
    expect(bad.status).toBe(400);
    expect((bad.body as { error: string }).error).toBe('invalid_body');
    expect(
      await call('POST', `/api/spines/${id('00')}/search`, undefined, {
        raw: 'nope',
      }),
    ).toEqual({
      status: 400,
      body: { error: 'invalid_body', message: 'The request body is not JSON.' },
    });
    expect(
      await call(
        'POST',
        `/api/spines/${id('00')}/search`,
        { mode: 'again' },
        { contentType: null },
      ),
    ).toEqual({
      status: 415,
      body: { error: 'unsupported_type', message: 'Send application/json.' },
    });
  });
});

describe('Search Discogs dialog (D-13)', () => {
  it('a text search reads queued, searching, then done from the recordings only', async () => {
    const searchId = await startDialog('09', 'text', 'nine inch');
    const queued = await searchDto(searchId);
    expect(queued).toMatchObject({
      id: searchId,
      kind: 'manual',
      state: 'queued',
      query: 'nine inch',
      releaseId: null,
      results: [],
      failure: null,
      pausedUntil: null,
    });
    advance(400);
    expect((await searchDto(searchId)).state).toBe('searching');
    advance(1200);
    const done = await searchDto(searchId);
    expect(done.state).toBe('done');
    expect(done.results.length).toBeGreaterThan(0);
    expect(done.results.length).toBeLessThanOrEqual(DIALOG_RESULTS_MAX);
    expect(done.totalCount).toBeGreaterThanOrEqual(done.results.length);
    for (const r of done.results) {
      expect(RECORDED_IDS.has(r.releaseId)).toBe(true);
      expect(r.title.toLowerCase()).toContain('nine inch');
    }
    const own = new Set(
      recordingFor('09')?.candidates.map((c) => c.releaseId) ?? [],
    );
    for (const r of done.results) {
      expect(r.alreadyListed).toBe(own.has(r.releaseId));
    }
    expect(done.results.some((r) => r.alreadyListed)).toBe(true);
    // Results never become candidates by themselves (D-16).
    expect((await spine('09')).discogs?.candidateCount).toBe(own.size);
    expect((await spines()).discogsActive).toBe(false);
  });

  it('a query matching nothing ends no_match', async () => {
    const searchId = await startDialog('00', 'text', 'zzqx qqqv');
    advance(5000);
    expect(await searchDto(searchId)).toMatchObject({
      state: 'no_match',
      results: [],
      totalCount: 0,
    });
  });

  it('a pasted recorded release link returns that release', async () => {
    const searchId = await startDialog(
      '00',
      'ref',
      'https://www.discogs.com/release/7430-Kid606-Down-With-The-Scene',
    );
    advance(5000);
    const dto = await searchDto(searchId);
    expect(dto).toMatchObject({
      kind: 'release',
      state: 'done',
      releaseId: 7430,
      totalCount: 1,
    });
    expect(dto.results.map((r) => r.releaseId)).toEqual([7430]);
  });

  it('a release number outside the recordings returns the canned release', async () => {
    expect(RECORDED_IDS.has(123)).toBe(false);
    const searchId = await startDialog('00', 'text', '123');
    advance(5000);
    const dto = await searchDto(searchId);
    expect(dto).toMatchObject({
      kind: 'release',
      state: 'done',
      releaseId: 123,
    });
    expect(dto.results.map((r) => r.releaseId)).toEqual([
      cannedRelease().releaseId,
    ]);
  });

  it('refuses a master, non-release ref text and empty text like the real route', async () => {
    const path = `/api/spines/${id('00')}/search`;
    expect(
      await call('POST', path, {
        mode: 'ref',
        value: 'https://www.discogs.com/master/12345',
      }),
    ).toEqual({
      status: 400,
      body: { error: 'master', message: MASTER_REFUSAL },
    });
    expect(await call('POST', path, { mode: 'ref', value: 'hello' })).toEqual({
      status: 400,
      body: {
        error: 'invalid_ref',
        message: 'That is not a Discogs release link or number.',
      },
    });
    expect(await call('POST', path, { mode: 'text', value: '   ' })).toEqual({
      status: 400,
      body: { error: 'invalid_body', message: 'Type something to search for.' },
    });
    expect(
      (await call('POST', path, { mode: 'text', value: 'x'.repeat(501) }))
        .status,
    ).toBe(400);
  });

  it('GET answers 404 for an automatic or unknown search', async () => {
    const notFound = {
      status: 404,
      body: { error: 'not_found', message: 'This search no longer exists.' },
    };
    expect(await call('GET', '/api/discogs/searches/demo-search-00')).toEqual(
      notFound,
    );
    expect(await call('GET', '/api/discogs/searches/nope')).toEqual(notFound);
  });
});

describe('/api/spines/:id/candidates', () => {
  it('GET lists every candidate in D-10 order; unknown spine 404', async () => {
    const res = await call('GET', `/api/spines/${id('00')}/candidates`);
    expect(res.status).toBe(200);
    const list = (res.body as CandidatesResponse).candidates;
    expect(list).toHaveLength(recordingFor('00')?.candidates.length ?? -1);
    expect((await spine('00')).discogs?.topCandidates).toEqual(
      list.slice(0, 3),
    );
    expect(await call('GET', '/api/spines/nope/candidates')).toEqual({
      status: 404,
      body: { error: 'not_found', message: 'This spine no longer exists.' },
    });
  });

  it('POST pins a dialog result at the top; re-adding moves it first', async () => {
    const searchId = await startDialog('00', 'text', 'nine inch');
    const path = `/api/spines/${id('00')}/candidates`;
    expect(await call('POST', path, { searchId, releaseId: 10852960 })).toEqual(
      {
        status: 409,
        body: {
          error: 'not_done',
          message: "The search hasn't finished with results yet.",
        },
      },
    );
    advance(5000);
    const [a, b] = (await searchDto(searchId)).results;
    const first = await call('POST', path, {
      searchId,
      releaseId: a.releaseId,
    });
    expect(first.status).toBe(201);
    const pinned = (first.body as { candidate: CandidateDto }).candidate;
    expect(pinned).toMatchObject({ releaseId: a.releaseId, source: 'manual' });
    advance(10);
    await call('POST', path, { searchId, releaseId: b.releaseId });
    let list = ((await call('GET', path)).body as CandidatesResponse)
      .candidates;
    expect(list.map((c) => c.releaseId).slice(0, 2)).toEqual([
      b.releaseId,
      a.releaseId,
    ]);
    advance(10);
    const again = await call('POST', path, {
      searchId,
      releaseId: a.releaseId,
    });
    expect((again.body as { candidate: CandidateDto }).candidate.id).toBe(
      pinned.id,
    );
    list = ((await call('GET', path)).body as CandidatesResponse).candidates;
    expect(list[0].releaseId).toBe(a.releaseId);
    expect((await spine('00')).discogs?.topCandidates[0].releaseId).toBe(
      a.releaseId,
    );
  });

  it('POST answers the real 404s for unknown searches and releases', async () => {
    const other = await startDialog('09', 'text', 'nine inch');
    const own = await startDialog('00', 'text', 'nine inch');
    advance(5000);
    const path = `/api/spines/${id('00')}/candidates`;
    const searchNotFound = {
      status: 404,
      body: {
        error: 'search_not_found',
        message: 'That search is not a Search Discogs search of this spine.',
      },
    };
    expect(
      await call('POST', path, { searchId: 'nope', releaseId: 1 }),
    ).toEqual(searchNotFound);
    expect(
      await call('POST', path, { searchId: other, releaseId: 10852960 }),
    ).toEqual(searchNotFound);
    expect(
      await call('POST', path, { searchId: 'demo-search-00', releaseId: 1 }),
    ).toEqual(searchNotFound);
    expect(await call('POST', path, { searchId: own, releaseId: 1 })).toEqual({
      status: 404,
      body: {
        error: 'release_not_found',
        message: "That release isn't among the search's results.",
      },
    });
    expect(
      (await call('POST', path, { searchId: own, releaseId: -1 })).status,
    ).toBe(400);
  });
});

describe('POST /api/spines/:id/not-on-discogs', () => {
  it('marks, repeats as a no-op, and unmarks', async () => {
    const path = `/api/spines/${id('00')}/not-on-discogs`;
    expect(await call('POST', path, { flag: true })).toEqual({
      status: 200,
      body: { id: id('00'), notOnDiscogs: true },
    });
    expect((await spine('00')).reviewStatus).toBe('not_on_discogs');
    expect(await call('POST', path, { flag: true })).toEqual({
      status: 200,
      body: { id: id('00'), notOnDiscogs: true },
    });
    expect(await call('POST', path, { flag: false })).toEqual({
      status: 200,
      body: { id: id('00'), notOnDiscogs: false },
    });
    expect((await spine('00')).reviewStatus).toBe('pending');
  });

  it('refuses an imported spine and an open import like the real route', async () => {
    expect(
      await call('POST', `/api/spines/${id('09')}/not-on-discogs`, {
        flag: true,
      }),
    ).toEqual({
      status: 409,
      body: {
        error: 'imported',
        message:
          "This spine is already in your collection, so it can't be marked.",
      },
    });
    expect(
      await call('POST', `/api/spines/${id('14')}/not-on-discogs`, {
        flag: true,
      }),
    ).toEqual({
      status: 409,
      body: {
        error: 'import_open',
        message: 'This spine has a match being added. Change the match first.',
      },
    });
    // The failed import never reached Discogs, so it does not block.
    expect(
      (
        await call('POST', `/api/spines/${id('42')}/not-on-discogs`, {
          flag: true,
        })
      ).status,
    ).toBe(200);
    expect(
      await call('POST', '/api/spines/nope/not-on-discogs', { flag: true }),
    ).toEqual({
      status: 404,
      body: { error: 'not_found', message: 'This spine no longer exists.' },
    });
    expect(
      (
        await call('POST', `/api/spines/${id('00')}/not-on-discogs`, {
          flag: 'yes',
        })
      ).status,
    ).toBe(400);
  });
});

describe('reattach and dismiss', () => {
  const NOT_FOUND = {
    status: 404,
    body: { error: 'not_found', message: 'This spine no longer exists.' },
  };

  it('answer an active spine like the real routes', async () => {
    expect(await call('GET', `/api/spines/${id('00')}/reattach`)).toEqual({
      status: 200,
      body: { candidates: [] },
    });
    expect(
      await call('POST', `/api/spines/${id('00')}/reattach`, {
        targetSpineId: id('01'),
      }),
    ).toEqual({
      status: 409,
      body: {
        error: 'conflict',
        message: 'That spine can no longer be re-attached there.',
      },
    });
    expect(await call('POST', `/api/spines/${id('00')}/dismiss`, {})).toEqual({
      status: 409,
      body: {
        error: 'conflict',
        message: 'Only a spine that is no longer detected can be dismissed.',
      },
    });
  });

  it('answer an unknown spine 404 and a superseded one like the real routes', async () => {
    expect(await call('GET', '/api/spines/nope/reattach')).toEqual(NOT_FOUND);
    expect(
      await call('POST', '/api/spines/nope/reattach', { targetSpineId: 'x' }),
    ).toEqual(NOT_FOUND);
    expect(await call('POST', '/api/spines/nope/dismiss', {})).toEqual(
      NOT_FOUND,
    );
    const s = getState().spines.find((x) => x.id === id('00'));
    if (s) s.state = 'superseded';
    expect(await call('GET', `/api/spines/${id('00')}/reattach`)).toEqual({
      status: 200,
      body: { candidates: [] },
    });
    expect(
      (await call('POST', `/api/spines/${id('00')}/dismiss`, {})).status,
    ).toBe(409);
    expect(
      (await call('POST', `/api/spines/${id('00')}/reattach`, { bad: 1 }))
        .status,
    ).toBe(400);
  });

  it('dismiss removes an orphaned spine, but not one whose copy is on Discogs', async () => {
    const st = getState();
    for (const key of ['00', '09']) {
      const s = st.spines.find((x) => x.id === id(key));
      if (s) s.state = 'orphaned';
    }
    expect(await call('POST', `/api/spines/${id('00')}/dismiss`, {})).toEqual({
      status: 200,
      body: { id: id('00'), state: 'dismissed' },
    });
    expect((await spines()).spines.some((s) => s.id === id('00'))).toBe(false);
    expect(await call('POST', `/api/spines/${id('09')}/dismiss`, {})).toEqual({
      status: 409,
      body: {
        error: 'has_import',
        message:
          "Spines with a match being added or already added can't be dismissed.",
      },
    });
  });
});

describe('nothing stays in flight (D-04, T-05-19)', () => {
  it('after every review action and all readyAt, polling stops', async () => {
    await call('POST', `/api/spines/${id('28')}/search`, { mode: 'again' });
    await startDialog('00', 'text', 'kid606');
    await startDialog('01', 'ref', 'r7430');
    await call('PATCH', `/api/spines/${id('03')}/fields`, {
      field: 'title',
      value: 'who still kill sound',
    });
    await call('POST', `/api/spines/${id('03')}/search`, { mode: 'again' });
    advance(60_000);
    expect((await spines()).discogsActive).toBe(false);
    const status = buildStatusResponse(getState(), clockNow);
    expect(status.discogs.backlog).toBe(0);
    expect(status.discogs.failedSpines).toBe(0);
  });
});
