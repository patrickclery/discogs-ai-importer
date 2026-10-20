import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PhotoStatus } from './scan-types';
import {
  createUploadQueue,
  type PhotoSnapshot,
  terminalAnnouncements,
  uploadErrorMessage,
  uploadPhoto,
} from './upload-queue';

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('uploadErrorMessage', () => {
  it('reads the cut-off copy', () => {
    expect(uploadErrorMessage('cut_off', 'a.jpg')).toBe(
      'The upload was cut off before it finished. Retry the upload.',
    );
  });

  it('reads the network copy', () => {
    expect(uploadErrorMessage('network', 'a.jpg')).toBe(
      "Couldn't reach the app. Check that it's still running, then retry the upload.",
    );
  });

  it('names the file for an unsupported type', () => {
    expect(uploadErrorMessage('unsupported_type', 'notes.pdf')).toBe(
      "notes.pdf isn't a supported photo. Use JPEG, PNG, WebP or HEIC.",
    );
  });

  it('names the file when it is too large', () => {
    expect(uploadErrorMessage('too_large', 'huge.tif')).toBe(
      'huge.tif is over 64 MB. Export a smaller JPEG and try again.',
    );
  });
});

describe('createUploadQueue', () => {
  it('starts tasks in insertion order with at most 2 in flight', async () => {
    const started: number[] = [];
    const release = new Map<number, () => void>();
    let inFlight = 0;
    let maxInFlight = 0;
    const queue = createUploadQueue<number>({
      concurrency: 2,
      run: (n) =>
        new Promise<void>((resolve) => {
          started.push(n);
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          release.set(n, () => {
            inFlight -= 1;
            resolve();
          });
        }),
    });
    for (const n of [1, 2, 3, 4, 5]) queue.add(n);
    expect(started).toEqual([1, 2]);

    for (const n of [2, 1, 3, 4, 5]) {
      await vi.waitFor(() => expect(release.has(n)).toBe(true));
      release.get(n)?.();
    }
    await vi.waitFor(() => expect(started).toHaveLength(5));
    expect(started).toEqual([1, 2, 3, 4, 5]);
    expect(maxInFlight).toBe(2);
  });

  it('keeps draining after a task rejects', async () => {
    const done: number[] = [];
    const queue = createUploadQueue<number>({
      concurrency: 1,
      run: async (n) => {
        if (n === 1) throw new Error('boom');
        done.push(n);
      },
    });
    queue.add(1);
    queue.add(2);
    await vi.waitFor(() => expect(done).toEqual([2]));
  });
});

describe('uploadPhoto', () => {
  const file = new File([new Uint8Array([1, 2, 3])], 'my shelf #1.jpg', {
    type: 'image/jpeg',
  });

  it('maps a 200 duplicate body to ok with duplicate true', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { photoId: 'p1', duplicate: true }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(uploadPhoto(file)).resolves.toEqual({
      ok: true,
      body: { photoId: 'p1', duplicate: true },
    });
  });

  it('sends the raw File as octet-stream with the encoded name (WR-04)', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify({ photoId: 'p2', duplicate: false }), {
          status: 201,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await uploadPhoto(file);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/photos');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(file);
    expect(init.headers).toEqual({
      'content-type': 'application/octet-stream',
      'x-filename': 'my%20shelf%20%231.jpg',
    });
  });

  it('ignores a browser type the server would refuse (WR-04)', async () => {
    const heic = new File([new Uint8Array([1])], 'IMG_1.HEIC', {
      type: 'image/heic-sequence',
    });
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify({ photoId: 'p3', duplicate: false }), {
          status: 201,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await uploadPhoto(heic);
    const headers = fetchMock.mock.calls[0][1].headers as Record<
      string,
      string
    >;
    expect(headers['content-type']).toBe('application/octet-stream');
  });

  it('maps a 415 body to unsupported_type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(415, {
          error: 'unsupported_type',
          message: 'Upload a JPEG, PNG, WebP or HEIC photo.',
        }),
      ),
    );
    await expect(uploadPhoto(file)).resolves.toEqual({
      ok: false,
      code: 'unsupported_type',
    });
  });

  it('maps a 400 cut_off body to cut_off', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(400, { error: 'cut_off', message: 'cut off' }),
      ),
    );
    await expect(uploadPhoto(file)).resolves.toEqual({
      ok: false,
      code: 'cut_off',
    });
  });

  it('maps a rejected fetch to network', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(uploadPhoto(file)).resolves.toEqual({
      ok: false,
      code: 'network',
    });
  });
});

describe('terminalAnnouncements', () => {
  function snap(over: Partial<PhotoSnapshot>): PhotoSnapshot {
    return {
      id: 'p1',
      filename: 'shelf.jpg',
      status: 'done',
      spineCount: 0,
      ...over,
    };
  }

  it('announces a photo that finished since the last poll', () => {
    const prev = new Map<string, PhotoStatus>([['p1', 'calling']]);
    expect(
      terminalAnnouncements(prev, [snap({ status: 'done', spineCount: 12 })]),
    ).toEqual(['shelf.jpg: done, 12 spines found']);
  });

  it('announces a scan failure', () => {
    const prev = new Map<string, PhotoStatus>([['p1', 'queued']]);
    const lines = terminalAnnouncements(prev, [snap({ status: 'error' })]);
    expect(lines.join('\n')).toBe('shelf.jpg: scan failed');
  });

  it('stays quiet for unchanged, unseen and non-terminal photos', () => {
    const prev = new Map<string, PhotoStatus>([
      ['p1', 'done'],
      ['p2', 'queued'],
    ]);
    expect(
      terminalAnnouncements(prev, [
        snap({ id: 'p1', status: 'done', spineCount: 3 }),
        snap({ id: 'p2', status: 'calling' }),
        snap({ id: 'p3', status: 'done', spineCount: 4 }),
      ]),
    ).toEqual([]);
  });
});
