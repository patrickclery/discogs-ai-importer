import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDuplicateBody } from '@/components/duplicate-import-dialog';
import type {
  PhotoDto,
  PhotosResponse,
  SpinesResponse,
} from '@/lib/scan-types';
import type { StatusResponse } from '@/lib/status-types';
import { toDemoRequest } from '../fetch-shim';
import { handle } from '../routes';
import { SAMPLE_PHOTO_ID } from '../seed';
import { getState, resetStore, setClock } from '../store';

// D-11, D-17, D-14: dropping any photo fakes a ~3 s analysis without ever
// reading the file, then adds a fresh second copy of the sample shelf whose
// searches finish from the recordings; Re-scan animates a new run and keeps
// the spines. The answers mirror the real /api/photos and rescan routes.

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

const advance = (ms: number) => {
  clockNow += ms;
};

async function send(
  input: string,
  init: RequestInit,
): Promise<{ status: number; body: unknown }> {
  const pending = handle(toDemoRequest(input, init, ORIGIN));
  await vi.runAllTimersAsync();
  const res = await pending;
  return { status: res.status, body: res.body };
}

function spyBody() {
  return {
    arrayBuffer: vi.fn(),
    text: vi.fn(),
    stream: vi.fn(),
    bytes: vi.fn(),
    blob: vi.fn(),
  };
}

async function upload(
  header: string | null,
  body: ReturnType<typeof spyBody> = spyBody(),
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    'content-type': 'application/octet-stream',
  };
  if (header !== null) headers['x-filename'] = header;
  return send('/api/photos', {
    method: 'POST',
    headers,
    body: body as unknown as BodyInit,
  });
}

async function rescan(
  photoId: string,
  contentType = 'application/json',
): Promise<{ status: number; body: unknown }> {
  return send(`/api/photos/${encodeURIComponent(photoId)}/rescan`, {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: '{}',
  });
}

async function photos(): Promise<PhotoDto[]> {
  const res = await send('/api/photos', { method: 'GET' });
  return (res.body as PhotosResponse).photos;
}

async function photo(id: string): Promise<PhotoDto> {
  const p = (await photos()).find((x) => x.id === id);
  if (!p) throw new Error(`no photo ${id}`);
  return p;
}

async function spines(photoId?: string): Promise<SpinesResponse> {
  const q = photoId ? `?photo=${encodeURIComponent(photoId)}` : '';
  const res = await send(`/api/spines${q}`, { method: 'GET' });
  return res.body as SpinesResponse;
}

async function status(): Promise<StatusResponse> {
  const res = await send('/api/status', { method: 'GET' });
  return res.body as StatusResponse;
}

async function uploadedId(header = 'my%20shelf.jpg'): Promise<string> {
  const res = await upload(header);
  expect(res.status).toBe(201);
  return (res.body as { photoId: string }).photoId;
}

describe('POST /api/photos (D-11)', () => {
  it('answers 201 {photoId, duplicate:false} from the name alone and never reads the body', async () => {
    const body = spyBody();
    const res = await upload('my%20shelf.jpg', body);
    expect(res.status).toBe(201);
    const { photoId, duplicate } = res.body as {
      photoId: string;
      duplicate: boolean;
    };
    expect(typeof photoId).toBe('string');
    expect(duplicate).toBe(false);
    expect(body.arrayBuffer).not.toHaveBeenCalled();
    expect(body.text).not.toHaveBeenCalled();
    expect(body.stream).not.toHaveBeenCalled();
    expect(body.bytes).not.toHaveBeenCalled();
    expect(body.blob).not.toHaveBeenCalled();
    const p = await photo(photoId);
    expect(p.filename).toBe('my shelf.jpg');
    // newest first, like listPhotos
    expect((await photos())[0].id).toBe(photoId);
  });

  it('keeps a malformed header as is, strips separators, caps at 255 and falls back when empty', async () => {
    const bad = await uploadedId('100%zz.jpg');
    expect((await photo(bad)).filename).toBe('100%zz.jpg');
    const sep = await uploadedId(encodeURIComponent('a/b\\c.jpg'));
    expect((await photo(sep)).filename).toBe('abc.jpg');
    const long = await uploadedId('x'.repeat(400));
    expect((await photo(long)).filename).toHaveLength(255);
    const empty = await uploadedId('%20%20');
    expect((await photo(empty)).filename).toBe('photo.jpg');
    const none = await upload(null);
    expect(none.status).toBe(201);
    const noneId = (none.body as { photoId: string }).photoId;
    expect((await photo(noneId)).filename).toBe('photo.jpg');
  });
});

describe('the fake analysis and second shelf copy (D-11, D-17)', () => {
  it('runs queued, preparing, calling, parsing and done at +3000 ms, then lists 61 new spines', async () => {
    const id = await uploadedId();
    const sample = await photo(SAMPLE_PHOTO_ID);
    let p = await photo(id);
    expect(p.status).toBe('queued');
    expect(p.runNo).toBe(1);
    expect(p.model).toBe('claude-opus-5-5');
    expect(p.thumbUrl).toBe(sample.thumbUrl);
    expect(p.visionUrl).toBe(sample.visionUrl);
    expect(p.densityFlags).toEqual(sample.densityFlags);
    expect(p.spineCountEstimate).toBe(sample.spineCountEstimate);
    expect(p.spawnedAt).toBeNull();
    expect(p.hasEarlierScan).toBe(false);

    advance(400);
    expect((await photo(id)).status).toBe('preparing');
    advance(500);
    p = await photo(id);
    expect(p.status).toBe('calling');
    expect(p.spawnedAt).toBe(T0 + 900);
    advance(1500);
    expect((await photo(id)).status).toBe('parsing');
    expect((await spines(id)).spines).toHaveLength(0);
    expect((await spines()).counts.all).toBe(61);
    advance(599);
    expect((await photo(id)).status).toBe('parsing');

    advance(1);
    p = await photo(id);
    expect(p.status).toBe('done');
    expect(p.finishedAt).toBe(T0 + 3000);
    expect(p.spineCount).toBe(61);
    expect(p.detectedCount).toBe(61);

    const copy = await spines(id);
    expect(copy.spines).toHaveLength(61);
    expect(new Set(copy.spines.map((s) => s.photoId))).toEqual(new Set([id]));
    for (const s of copy.spines) {
      expect(['queued', 'searching']).toContain(s.discogs?.state);
      expect(s.import).toBeNull();
    }
    expect(copy.discogsActive).toBe(true);
    expect((await spines()).counts.all).toBe(122);
  });

  it('finishes every lookup on the copy from the recordings, then polling stops', async () => {
    const id = await uploadedId();
    advance(3000);
    const ready = Math.max(
      ...getState()
        .searches.filter((s) => s.spineId.startsWith(`${id}-`))
        .map((s) => s.readyAt),
    );
    clockNow = ready;
    const copy = await spines(id);
    for (const s of copy.spines) {
      expect(['done', 'no_match']).toContain(s.discogs?.state);
    }
    // the copy reads the same recordings as the sample shelf
    const sample = await spines(SAMPLE_PHOTO_ID);
    const first = sample.spines.find((s) => s.index === 0);
    const firstCopy = copy.spines.find((s) => s.index === 0);
    expect(firstCopy?.discogs?.candidateCount).toBe(
      first?.discogs?.candidateCount,
    );
    expect((await spines()).discogsActive).toBe(false);
    const st = await status();
    expect(st.discogs.backlog).toBe(0);
    expect(st.jobs.anthropic.running + st.jobs.anthropic.queued).toBe(0);
  });

  it('leaves the sample shelf seeded states untouched', async () => {
    const before = (await spines(SAMPLE_PHOTO_ID)).statusById;
    const id = await uploadedId();
    advance(10_000);
    expect((await spines(SAMPLE_PHOTO_ID)).statusById).toEqual(before);
    const copy = await spines(id);
    expect(copy.counts.byStatus.imported).toBe(0);
  });

  it('confirming a release the sample shelf imported on the copy is the duplicate 409', async () => {
    const id = await uploadedId();
    advance(10_000);
    const state = getState();
    const held = state.imports.find((i) => i.spineId === 'demo-spine-09');
    expect(held).toBeDefined();
    const cand = state.candidates.find(
      (c) =>
        c.spineId === `${id}-spine-09` &&
        c.releaseId === held?.releaseId &&
        c.removedAt == null,
    );
    expect(cand).toBeDefined();
    const res = await send(`/api/spines/${id}-spine-09/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ candidateId: cand?.id }),
    });
    expect(res.status).toBe(409);
    const dup = parseDuplicateBody(res.body);
    expect(dup?.error).toBe('duplicate');
    expect(dup?.photo).toBe('cd-spines.heic');
  });
});

describe('POST /api/photos/:id/rescan (D-14)', () => {
  it('runs a new ~3 s run on the done sample photo and keeps its spines and states', async () => {
    const before = await spines(SAMPLE_PHOTO_ID);
    const res = await rescan(SAMPLE_PHOTO_ID);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      runId: `${SAMPLE_PHOTO_ID}-run-2`,
      runNo: 2,
    });
    let p = await photo(SAMPLE_PHOTO_ID);
    expect(p.status).toBe('queued');
    expect(p.runNo).toBe(2);
    expect(p.hasEarlierScan).toBe(true);
    advance(1000);
    p = await photo(SAMPLE_PHOTO_ID);
    expect(p.status).toBe('calling');
    expect(p.hasEarlierScan).toBe(true);
    advance(2000);
    p = await photo(SAMPLE_PHOTO_ID);
    expect(p.status).toBe('done');
    expect(p.spineCount).toBe(61);
    const after = await spines(SAMPLE_PHOTO_ID);
    expect(after.spines.map((s) => s.id)).toEqual(
      before.spines.map((s) => s.id),
    );
    expect(after.statusById).toEqual(before.statusById);
    expect((await status()).jobs.anthropic.running).toBe(0);
  });

  it('answers the real 409 while a run is in flight and 404 for an unknown photo', async () => {
    const id = await uploadedId();
    expect(await rescan(id)).toEqual({
      status: 409,
      body: {
        error: 'run_active',
        message: 'This photo is already being analyzed.',
      },
    });
    expect((await rescan(SAMPLE_PHOTO_ID)).status).toBe(201);
    expect((await rescan(SAMPLE_PHOTO_ID)).status).toBe(409);
    expect(await rescan('nope')).toEqual({
      status: 404,
      body: { error: 'not_found', message: 'This photo no longer exists.' },
    });
    advance(3000);
    const again = await rescan(id);
    expect(again.status).toBe(201);
    expect(again.body).toEqual({ runId: `${id}-run-2`, runNo: 2 });
  });

  it('answers the real 415 for a non-JSON request', async () => {
    expect(await rescan(SAMPLE_PHOTO_ID, 'text/plain')).toEqual({
      status: 415,
      body: { error: 'unsupported_type', message: 'Send application/json.' },
    });
    expect((await photo(SAMPLE_PHOTO_ID)).runNo).toBe(1);
  });
});
