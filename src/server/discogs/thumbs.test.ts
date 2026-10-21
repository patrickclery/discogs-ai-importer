import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';
import {
  ensureThumb,
  isAllowedImageUrl,
  THUMB_MAX_BYTES,
  thumbKey,
} from './thumbs';

// Cover cache (D-13, RESEARCH Pattern 6, T-03-24..T-03-26). fetchImpl is
// always a stub serving a JPEG rendered with sharp: never a live request.

const URL_A = 'https://i.discogs.com/abc/h:150/w:150/cover-a.jpeg';

let jpeg: Buffer;
beforeEach(async () => {
  jpeg = await sharp({
    create: {
      width: 300,
      height: 200,
      channels: 3,
      background: { r: 200, g: 40, b: 40 },
    },
  })
    .jpeg()
    .toBuffer();
});

let savedBase: string | undefined;
beforeEach(() => {
  savedBase = process.env.DISCOGS_IMAGE_BASE;
  delete process.env.DISCOGS_IMAGE_BASE;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  if (savedBase === undefined) delete process.env.DISCOGS_IMAGE_BASE;
  else process.env.DISCOGS_IMAGE_BASE = savedBase;
  vi.restoreAllMocks();
});

function bytes(buf: Buffer): Uint8Array<ArrayBuffer> {
  return new Uint8Array(buf);
}

function imageResponse(
  body: Buffer | ReadableStream<Uint8Array>,
  headers: Record<string, string> = {},
): Response {
  return new Response(Buffer.isBuffer(body) ? bytes(body) : body, {
    status: 200,
    headers: { 'content-type': 'image/jpeg', ...headers },
  });
}

function stubFetch(respond: (url: string) => Response | Promise<Response>) {
  const urls: string[] = [];
  const inits: RequestInit[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      urls.push(String(input));
      inits.push(init ?? {});
      return respond(String(input));
    },
  ) as unknown as typeof fetch;
  return { fetchImpl, urls, inits };
}

/** A body streamed in 64 KiB chunks with no Content-Length header. */
function streamOf(bytes: Buffer): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      const end = Math.min(offset + 65536, bytes.length);
      controller.enqueue(new Uint8Array(bytes.subarray(offset, end)));
      offset = end;
    },
  });
}

/** The test JPEG padded with trailing zeros to exactly n bytes. */
function paddedJpeg(n: number): Buffer {
  return Buffer.concat([jpeg, Buffer.alloc(n - jpeg.length)]);
}

describe('ensureThumb', () => {
  const root = useTempDataDir();

  function cacheFile(url: string): string {
    return path.join(root(), 'discogs-thumbs', `${thumbKey(url)}.webp`);
  }

  it('downloads once, stores a WebP of at most 128 px and then serves the cache', async () => {
    const { fetchImpl, urls, inits } = stubFetch(() => imageResponse(jpeg));
    const first = await ensureThumb(URL_A, { fetchImpl });
    expect(first).toEqual({ rel: `discogs-thumbs/${thumbKey(URL_A)}.webp` });
    expect(urls).toEqual([URL_A]);
    expect(inits[0].redirect).toBe('error');
    expect((inits[0].headers as Record<string, string>)['User-Agent']).toMatch(
      /^DiscogsAIImporter\//,
    );

    const meta = await sharp(fs.readFileSync(cacheFile(URL_A))).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(
      128,
    );

    const second = await ensureThumb(URL_A, { fetchImpl });
    expect(second).toEqual(first);
    expect(urls).toHaveLength(1);
  });

  it('shares one download between two concurrent first requests', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const { fetchImpl, urls } = stubFetch(async () => {
      await gate;
      return imageResponse(jpeg);
    });
    const a = ensureThumb(URL_A, { fetchImpl });
    const b = ensureThumb(URL_A, { fetchImpl });
    await vi.waitFor(() => expect(urls).toHaveLength(1));
    release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).not.toBeNull();
    expect(rb).toEqual(ra);
    expect(urls).toHaveLength(1);
  });

  it('runs at most 4 downloads at once: a fifth waits for a slot', async () => {
    const releases = new Map<string, () => void>();
    const { fetchImpl, urls } = stubFetch(
      (url) =>
        new Promise<Response>((resolve) => {
          releases.set(url, () => resolve(imageResponse(jpeg)));
        }),
    );
    const all = [1, 2, 3, 4, 5].map((n) =>
      ensureThumb(`https://i.discogs.com/c/${n}.jpeg`, { fetchImpl }),
    );
    await vi.waitFor(() => expect(urls).toHaveLength(4));
    await new Promise((r) => setTimeout(r, 50));
    expect(urls).toHaveLength(4);

    releases.get(urls[0])?.();
    await vi.waitFor(() => expect(urls).toHaveLength(5));
    for (const url of urls.slice(1)) releases.get(url)?.();
    const results = await Promise.all(all);
    expect(results.every((r) => r !== null)).toBe(true);
  });

  it.each([
    ['http://i.discogs.com/x.jpg'],
    ['https://evil.example/x.jpg'],
    ['https://i.discogs.com.evil.example/x.jpg'],
    ['https://user:pw@i.discogs.com/x.jpg'],
    ['https://i.discogs.com:8443/x.jpg'],
    ['data:image/jpeg;base64,/9j/4AAQ'],
    ['not a url'],
  ])('refuses %s without a fetch', async (url) => {
    const { fetchImpl, urls } = stubFetch(() => imageResponse(jpeg));
    expect(isAllowedImageUrl(url)).toBe(false);
    expect(await ensureThumb(url, { fetchImpl })).toBeNull();
    expect(urls).toEqual([]);
  });

  it('allows only the override host while DISCOGS_IMAGE_BASE is set', async () => {
    process.env.DISCOGS_IMAGE_BASE = 'http://127.0.0.1:4567';
    expect(isAllowedImageUrl('http://127.0.0.1:4567/img/1.jpeg')).toBe(true);
    expect(isAllowedImageUrl('http://127.0.0.1:4568/img/1.jpeg')).toBe(false);
    expect(isAllowedImageUrl(URL_A)).toBe(false);
  });

  it('refuses a text/html answer after the fetch and caches nothing', async () => {
    const { fetchImpl, urls } = stubFetch(
      () =>
        new Response('<html></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    );
    expect(await ensureThumb(URL_A, { fetchImpl })).toBeNull();
    expect(urls).toHaveLength(1);
    expect(fs.existsSync(cacheFile(URL_A))).toBe(false);
  });

  it('refuses a non-200 answer', async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(bytes(jpeg), {
          status: 404,
          headers: { 'content-type': 'image/jpeg' },
        }),
    );
    expect(await ensureThumb(URL_A, { fetchImpl })).toBeNull();
  });

  it('refuses a declared Content-Length one byte over the limit before reading', async () => {
    const { fetchImpl } = stubFetch(() =>
      imageResponse(jpeg, { 'content-length': String(THUMB_MAX_BYTES + 1) }),
    );
    expect(await ensureThumb(URL_A, { fetchImpl })).toBeNull();
    expect(fs.existsSync(cacheFile(URL_A))).toBe(false);
  });

  it('refuses a streamed body one byte over the limit', async () => {
    const { fetchImpl } = stubFetch(() =>
      imageResponse(streamOf(paddedJpeg(THUMB_MAX_BYTES + 1))),
    );
    expect(await ensureThumb(URL_A, { fetchImpl })).toBeNull();
    expect(fs.existsSync(cacheFile(URL_A))).toBe(false);
  });

  it('accepts a streamed body of exactly the limit that decodes', async () => {
    expect(THUMB_MAX_BYTES).toBe(2_097_152);
    const { fetchImpl } = stubFetch(() =>
      imageResponse(streamOf(paddedJpeg(THUMB_MAX_BYTES))),
    );
    expect(await ensureThumb(URL_A, { fetchImpl })).not.toBeNull();
    expect(fs.existsSync(cacheFile(URL_A))).toBe(true);
  });

  it('accepts a declared Content-Length of exactly the limit', async () => {
    const body = paddedJpeg(THUMB_MAX_BYTES);
    const { fetchImpl } = stubFetch(() =>
      imageResponse(body, { 'content-length': String(body.length) }),
    );
    expect(await ensureThumb(URL_A, { fetchImpl })).not.toBeNull();
  });

  it('refuses bytes sharp cannot decode', async () => {
    const { fetchImpl } = stubFetch(() =>
      imageResponse(Buffer.from('definitely not a jpeg')),
    );
    expect(await ensureThumb(URL_A, { fetchImpl })).toBeNull();
    expect(fs.existsSync(cacheFile(URL_A))).toBe(false);
  });

  it('a thrown fetch (refused redirect, timeout, network) gives null', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    expect(await ensureThumb(URL_A, { fetchImpl })).toBeNull();
    const warn = vi.mocked(console.warn);
    expect(warn).toHaveBeenCalledWith(
      '[discogs-thumbs] cover from i.discogs.com refused: network',
    );
  });

  it('logs the host and the failure kind only, never the body', async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response('SECRET-BODY-CANARY', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    );
    await ensureThumb(URL_A, { fetchImpl });
    const lines = vi.mocked(console.warn).mock.calls.map((c) => c.join(' '));
    expect(lines).toEqual([
      '[discogs-thumbs] cover from i.discogs.com refused: content_type',
    ]);
  });
});
