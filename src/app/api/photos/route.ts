import { connection } from 'next/server';
import {
  ACCEPTED_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
  type PhotosResponse,
  type UploadErrorBody,
  type UploadErrorCode,
  type UploadResponse,
} from '@/lib/scan-types';
import { detectImageKind } from '@/server/images/detect';
import { ingestUpload } from '@/server/scan/ingest';
import { listPhotos } from '@/server/scan/queries';

// One file per request, raw body (RESEARCH Pattern 1). A Route Handler, never
// a Server Action: actions cap bodies at 1 MB and phone photos are 3-12 MB.

const ACCEPTED_CONTENT_TYPES = new Set<string>([
  ...Object.keys(ACCEPTED_UPLOAD_TYPES),
  'application/octet-stream',
]);

function fail(
  status: number,
  error: UploadErrorCode,
  message: string,
): Response {
  const body: UploadErrorBody = { error, message };
  return Response.json(body, { status });
}

export async function GET() {
  await connection();
  const body: PhotosResponse = { photos: listPhotos() };
  return Response.json(body);
}

export async function POST(request: Request) {
  await connection();
  // Image and octet-stream types force a CORS preflight, so a no-preflight
  // cross-site form or text/plain POST never reaches the body (T-02-07).
  const mediaType = (request.headers.get('content-type') ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!ACCEPTED_CONTENT_TYPES.has(mediaType)) {
    return fail(
      415,
      'unsupported_type',
      'Upload a JPEG, PNG, WebP or HEIC photo.',
    );
  }

  const lengthHeader = request.headers.get('content-length') ?? '';
  if (!/^\d+$/.test(lengthHeader)) {
    return fail(411, 'length_required', 'The upload has no Content-Length.');
  }
  const declared = Number(lengthHeader);
  if (declared > MAX_UPLOAD_BYTES) {
    return fail(413, 'too_large', 'Photos must be 64 MB or smaller.');
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength !== declared) {
    return fail(
      400,
      'cut_off',
      `The upload was cut off (${bytes.byteLength} of ${declared} bytes).`,
    );
  }
  if (bytes.byteLength === 0) {
    return fail(400, 'empty', 'The file is empty.');
  }
  const kind = detectImageKind(bytes);
  if (!kind) {
    return fail(
      415,
      'unsupported_type',
      'This file is not a JPEG, PNG, WebP or HEIC photo.',
    );
  }

  // Every refusal above returns before anything is written.
  const result: UploadResponse = await ingestUpload({
    bytes,
    kind,
    filename: request.headers.get('x-filename'),
  });
  return Response.json(result, { status: result.duplicate ? 200 : 201 });
}
