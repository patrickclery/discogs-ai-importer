import 'server-only';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { newId } from '../ids';
import { resolveData } from '../storage/paths';
import { DISCOGS_USER_AGENT, imageBase } from './config';

// Candidate cover cache (D-13, RESEARCH Pattern 6). A cover is downloaded
// once from Discogs' image host, re-encoded as a small WebP and kept under
// DATA_DIR/discogs-thumbs, so a copied data folder shows already-seen covers
// with no network. The URL always comes from the database, never the client.
//
// T-03-24 (SSRF): only the protocol and host of imageBase() (https://i.discogs.com
// unless the loopback test override is set) are fetched, and redirects are
// refused. T-03-25: 2 MB cap on the declared and the streamed size, image/*
// content type, sharp decode and re-encode. T-03-26: one download per URL at
// a time and at most MAX_CONCURRENT in total, 10 s timeout.
//
// Image downloads skip the API pacing gate: i.discogs.com is not counted
// against the 60/min budget (RESEARCH, live probe; A-03-18).

export const THUMB_MAX_BYTES = 2 * 1024 * 1024;
export const THUMB_EDGE = 128;
const MAX_CONCURRENT = 4;
const TIMEOUT_MS = 10_000;
const ROOT = 'discogs-thumbs';

export type ThumbDeps = { fetchImpl?: typeof fetch };
export type ThumbResult = { rel: string };

type ThumbState = {
  inflight: Map<string, Promise<ThumbResult | null>>;
  active: number;
  waiting: (() => void)[];
};

const g = globalThis as { __daiDiscogsThumbs?: ThumbState };

function state(): ThumbState {
  g.__daiDiscogsThumbs ??= { inflight: new Map(), active: 0, waiting: [] };
  return g.__daiDiscogsThumbs;
}

/** Cache file name: the sha256 hex of the cover URL. */
export function thumbKey(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

/** Same protocol and host (hostname and port) as imageBase(), no userinfo. */
export function isAllowedImageUrl(url: string): boolean {
  let target: URL;
  let base: URL;
  try {
    target = new URL(url);
    base = new URL(imageBase());
  } catch {
    return false;
  }
  return (
    target.protocol === base.protocol &&
    target.host === base.host &&
    !target.username &&
    !target.password
  );
}

async function acquire(): Promise<void> {
  const s = state();
  if (s.active < MAX_CONCURRENT) {
    s.active += 1;
    return;
  }
  await new Promise<void>((resolve) => s.waiting.push(resolve));
}

/** Hands the slot to the next waiter, or frees it. */
function release(): void {
  const s = state();
  const next = s.waiting.shift();
  if (next) next();
  else s.active -= 1;
}

async function exists(rel: string): Promise<boolean> {
  try {
    return (await fs.stat(resolveData(rel))).isFile();
  } catch {
    return false;
  }
}

/** Temp file in the cache folder, then rename (copy of scan-photo's helper). */
async function writeAtomic(rel: string, bytes: Buffer): Promise<void> {
  const abs = resolveData(rel);
  const dir = path.dirname(abs);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${newId()}.tmp`);
  try {
    await fs.writeFile(tmp, bytes, { flag: 'wx' });
    await fs.rename(tmp, abs);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

class ThumbFailure extends Error {
  constructor(readonly kind: string) {
    super(kind);
  }
}

/** The whole body, or ThumbFailure('too_large') past max bytes. */
async function readCapped(res: Response, max: number): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new ThumbFailure('too_large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}

async function download(
  url: string,
  rel: string,
  fetchImpl: typeof fetch,
): Promise<ThumbResult> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { 'User-Agent': DISCOGS_USER_AGENT, Accept: 'image/*' },
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ThumbFailure('network');
  }
  try {
    if (res.status !== 200) throw new ThumbFailure(`status_${res.status}`);
    const type = (res.headers.get('content-type') ?? '').toLowerCase();
    if (!type.startsWith('image/')) throw new ThumbFailure('content_type');
    const declared = Number(res.headers.get('content-length') ?? '');
    if (declared > THUMB_MAX_BYTES) throw new ThumbFailure('too_large');
    let body: Buffer;
    try {
      body = await readCapped(res, THUMB_MAX_BYTES);
    } catch (err) {
      if (err instanceof ThumbFailure) throw err;
      throw new ThumbFailure('read');
    }
    let webp: Buffer;
    try {
      webp = await sharp(body)
        .rotate()
        .resize(THUMB_EDGE, THUMB_EDGE, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp()
        .toBuffer();
    } catch {
      throw new ThumbFailure('decode');
    }
    try {
      await writeAtomic(rel, webp);
    } catch {
      throw new ThumbFailure('write');
    }
    return { rel };
  } finally {
    if (res.body && !res.bodyUsed) await res.body.cancel().catch(() => {});
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host || '(none)';
  } catch {
    return '(unparseable)';
  }
}

/** One line with the host and the failure kind, never the response body. */
function logFailure(url: string, kind: string): null {
  console.warn(`[discogs-thumbs] cover from ${hostOf(url)} refused: ${kind}`);
  return null;
}

/**
 * The cached cover for url as a DATA_DIR-relative path, downloading it on
 * first use; null when the URL is not allowed or the download fails.
 */
export async function ensureThumb(
  url: string,
  deps: ThumbDeps = {},
): Promise<ThumbResult | null> {
  if (!isAllowedImageUrl(url)) return logFailure(url, 'host');
  const key = thumbKey(url);
  const rel = `${ROOT}/${key}.webp`;
  if (await exists(rel)) return { rel };

  const s = state();
  const pending = s.inflight.get(key);
  if (pending) return pending;

  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const run = (async (): Promise<ThumbResult | null> => {
    await acquire();
    try {
      if (await exists(rel)) return { rel };
      return await download(url, rel, fetchImpl);
    } catch (err) {
      return logFailure(url, err instanceof ThumbFailure ? err.kind : 'error');
    } finally {
      release();
    }
  })().finally(() => {
    s.inflight.delete(key);
  });
  s.inflight.set(key, run);
  return run;
}
