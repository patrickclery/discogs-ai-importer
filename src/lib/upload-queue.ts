// Client upload helpers (RESEARCH Pattern 1, D-12). Pure and client-safe:
// one POST per File, the UI-SPEC upload-error copy, and a small FIFO queue.

import { pluralize } from './photo-status';
import {
  type PhotoDto,
  type PhotoStatus,
  UPLOAD_ERROR_CODES,
  type UploadErrorCode,
  type UploadResponse,
} from './scan-types';

export type UploadFailureCode = UploadErrorCode | 'network';

export type UploadResult =
  | { ok: true; body: UploadResponse }
  | { ok: false; code: UploadFailureCode };

/** Network-failure copy (UI-SPEC "Upload error: network"). */
const NETWORK_MESSAGE =
  "Couldn't reach the app. Check that it's still running, then retry the upload.";

/** The documented copy for an upload failure (UI-SPEC upload errors). */
export function uploadErrorMessage(
  code: UploadFailureCode,
  filename: string,
): string {
  switch (code) {
    case 'unsupported_type':
      return `${filename} isn't a supported photo. Use JPEG, PNG, WebP or HEIC.`;
    case 'too_large':
      return `${filename} is over 64 MB. Export a smaller JPEG and try again.`;
    // A missing Content-Length is a transport fault, like a truncated body.
    case 'cut_off':
    case 'length_required':
      return 'The upload was cut off before it finished. Retry the upload.';
    case 'empty':
      return "This file couldn't be read as an image. Export it again as JPEG and upload it.";
    case 'network':
      return NETWORK_MESSAGE;
  }
}

function isUploadErrorCode(value: unknown): value is UploadErrorCode {
  return (
    typeof value === 'string' &&
    (UPLOAD_ERROR_CODES as readonly string[]).includes(value)
  );
}

/** Failure code from a non-2xx response: the body's code, else the status. */
async function failureCode(res: Response): Promise<UploadFailureCode> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (isUploadErrorCode(body.error)) return body.error;
  } catch {
    // not JSON: fall back to the status code
  }
  if (res.status === 413) return 'too_large';
  if (res.status === 415) return 'unsupported_type';
  if (res.status === 411) return 'length_required';
  // Anything else (proxy refusal, 5xx) reads as "couldn't reach the app":
  // the only useful action is the same, retry once the app is healthy.
  return 'network';
}

/**
 * POST one File as the raw body to /api/photos (Plan 02-03 contract). Always
 * application/octet-stream (WR-04): the browser's file.type varies
 * (image/jpg, image/heic-sequence, empty) and the server detects the format
 * from the magic bytes anyway. It still forces the CORS preflight.
 */
export async function uploadPhoto(file: File): Promise<UploadResult> {
  let res: Response;
  try {
    res = await fetch('/api/photos', {
      method: 'POST',
      body: file,
      headers: {
        'content-type': 'application/octet-stream',
        'x-filename': encodeURIComponent(file.name),
      },
    });
  } catch {
    return { ok: false, code: 'network' };
  }
  if (!res.ok) return { ok: false, code: await failureCode(res) };
  try {
    const body = (await res.json()) as UploadResponse;
    if (typeof body.photoId !== 'string') return { ok: false, code: 'network' };
    return {
      ok: true,
      body: { photoId: body.photoId, duplicate: !!body.duplicate },
    };
  } catch {
    return { ok: false, code: 'network' };
  }
}

export type UploadQueue<T> = {
  /** Queue an item; it starts once fewer than `concurrency` are in flight. */
  add(item: T): void;
};

/** FIFO runner with at most `concurrency` tasks in flight. */
export function createUploadQueue<T>({
  concurrency,
  run,
}: {
  concurrency: number;
  run: (item: T) => Promise<unknown>;
}): UploadQueue<T> {
  const pending: T[] = [];
  let active = 0;

  function pump() {
    while (active < concurrency && pending.length > 0) {
      const item = pending.shift() as T;
      active += 1;
      let task: Promise<unknown>;
      try {
        task = Promise.resolve(run(item));
      } catch (err) {
        task = Promise.reject(err);
      }
      task
        .catch(() => {
          // run() owns its error reporting; the queue keeps draining
        })
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  }

  return {
    add(item) {
      pending.push(item);
      pump();
    },
  };
}

export type PhotoSnapshot = Pick<
  PhotoDto,
  'id' | 'filename' | 'status' | 'spineCount'
>;

/**
 * Live-region lines for photos that reached done or error since the last
 * poll (UI-SPEC live region, A-12). Only terminal transitions are announced.
 */
export function terminalAnnouncements(
  previous: ReadonlyMap<string, PhotoStatus>,
  photos: readonly PhotoSnapshot[],
): string[] {
  const lines: string[] = [];
  for (const photo of photos) {
    const before = previous.get(photo.id);
    // Unseen photos (first poll, or a duplicate already finished) and photos
    // that were already terminal stay quiet.
    if (before === undefined || before === 'done' || before === 'error') {
      continue;
    }
    if (photo.status === 'done') {
      lines.push(
        `${photo.filename}: done, ${pluralize(photo.spineCount, 'spine', 'spines')} found`,
      );
    } else if (photo.status === 'error') {
      lines.push(`${photo.filename}: scan failed`);
    }
  }
  return lines;
}
