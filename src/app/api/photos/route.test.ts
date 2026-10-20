import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { MAX_UPLOAD_BYTES } from '@/lib/scan-types';
import { getDb } from '@/server/db/client';
import { useTempDataDir } from '../../../../test/helpers/temp-data-dir';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

import { POST } from './route';

// Upload refusals (T-02-14, edge INGEST-01): every refusal returns its code
// before anything is written, so an interrupted or bad upload leaves no
// photos row and no file behind.

const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0];

function upload(
  body: BodyInit | null,
  headers: Record<string, string>,
): Request {
  return new Request('http://127.0.0.1:3000/api/photos', {
    method: 'POST',
    headers,
    body,
    // Required by undici for a stream body.
    ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
  } as RequestInit);
}

describe('POST /api/photos refusals', () => {
  const dataDir = useTempDataDir();

  function nothingStored(): void {
    const n = (
      getDb().$client.prepare('SELECT COUNT(*) AS n FROM photos').get() as {
        n: number;
      }
    ).n;
    expect(n).toBe(0);
    const dir = path.join(dataDir(), 'photos');
    const files = fs.existsSync(dir)
      ? fs
          .readdirSync(dir, { recursive: true, withFileTypes: true })
          .filter((e) => e.isFile())
      : [];
    expect(files).toEqual([]);
  }

  async function expectRefusal(
    req: Request,
    status: number,
    error: string,
  ): Promise<void> {
    const res = await POST(req);
    expect(res.status).toBe(status);
    expect(((await res.json()) as { error: string }).error).toBe(error);
    nothingStored();
  }

  it('415 for text/plain, form and multipart content types', async () => {
    const bytes = new Uint8Array([...JPEG_HEAD, 1, 2, 3, 4]);
    for (const type of [
      'text/plain',
      'text/plain;charset=UTF-8',
      'application/x-www-form-urlencoded',
      'multipart/form-data; boundary=x',
    ]) {
      await expectRefusal(
        upload(bytes, {
          'content-type': type,
          'content-length': String(bytes.length),
        }),
        415,
        'unsupported_type',
      );
    }
  });

  it('415 for image/jpeg carrying text bytes', async () => {
    const bytes = new TextEncoder().encode('just some text, not a photo');
    await expectRefusal(
      upload(bytes, {
        'content-type': 'image/jpeg',
        'content-length': String(bytes.length),
      }),
      415,
      'unsupported_type',
    );
  });

  it('411 without Content-Length', async () => {
    const bytes = new Uint8Array([...JPEG_HEAD, 1, 2, 3, 4]);
    const req = upload(bytes, { 'content-type': 'image/jpeg' });
    expect(req.headers.get('content-length')).toBeNull();
    await expectRefusal(req, 411, 'length_required');
  });

  it('413 above 64 MB without reading the body', async () => {
    let pulled = false;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulled = true;
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    await expectRefusal(
      upload(body, {
        'content-type': 'image/jpeg',
        'content-length': String(MAX_UPLOAD_BYTES + 1),
      }),
      413,
      'too_large',
    );
    expect(pulled).toBe(false);
  });

  it('400 cut_off when the bytes received differ from Content-Length', async () => {
    const bytes = new Uint8Array([...JPEG_HEAD, ...new Array(46).fill(7)]);
    await expectRefusal(
      upload(bytes, {
        'content-type': 'image/jpeg',
        'content-length': '100',
      }),
      400,
      'cut_off',
    );
  });

  it('400 empty for zero bytes', async () => {
    await expectRefusal(
      upload(new Uint8Array(), {
        'content-type': 'image/jpeg',
        'content-length': '0',
      }),
      400,
      'empty',
    );
  });
});
