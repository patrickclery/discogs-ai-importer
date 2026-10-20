import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';
import { getDb } from '../db/client';
import { ingestUpload, originalPathFor, sanitizeFilename } from './ingest';
import { listPhotos } from './queries';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

function count(table: string): number {
  return (
    getDb().$client.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
      n: number;
    }
  ).n;
}

describe('sanitizeFilename (T-02-08)', () => {
  it('decodes, strips controls and path separators, and trims', () => {
    expect(sanitizeFilename('..%2F..%2Fetc%2Fpasswd', 'jpeg')).toBe(
      '....etcpasswd',
    );
    expect(sanitizeFilename('  shelf\u0000\n\u202e1.jpg  ', 'jpeg')).toBe(
      'shelf1.jpg',
    );
    expect(sanitizeFilename('a\\b/c.png', 'png')).toBe('abc.png');
  });

  it('keeps undecodable text, caps at 255 characters, defaults by kind', () => {
    expect(sanitizeFilename('100%.jpg', 'jpeg')).toBe('100%.jpg');
    expect(Array.from(sanitizeFilename('é'.repeat(400), 'jpeg'))).toHaveLength(
      255,
    );
    expect(sanitizeFilename(null, 'jpeg')).toBe('photo.jpg');
    expect(sanitizeFilename('/\u0001/', 'heic')).toBe('photo.heic');
  });
});

describe('ingestUpload (INGEST-01, INGEST-03)', () => {
  const dataDir = useTempDataDir();

  it('stores the file by sha256 and queues one non-retryable scan job', async () => {
    const res = await ingestUpload({
      bytes: JPEG,
      kind: 'jpeg',
      filename: 'shelf.jpg',
    });
    expect(res.duplicate).toBe(false);

    const sha = createHash('sha256').update(JPEG).digest('hex');
    const rel = originalPathFor(sha, 'jpeg');
    expect(rel).toBe(`photos/${sha.slice(0, 2)}/${sha}.jpg`);
    expect(fs.readFileSync(path.join(dataDir(), rel))).toEqual(
      Buffer.from(JPEG),
    );

    const db = getDb().$client;
    const run = db
      .prepare('SELECT * FROM vision_runs WHERE photo_id = ?')
      .get(res.photoId) as Record<string, unknown>;
    expect(run).toMatchObject({ run_no: 1, status: 'queued' });
    const job = db.prepare('SELECT * FROM jobs').get() as Record<
      string,
      unknown
    >;
    expect(job).toMatchObject({
      id: run.job_id,
      type: 'scan_photo',
      lane: 'anthropic',
      max_attempts: 1,
      dedupe_key: `scan:${res.photoId}:1`,
    });
    expect(JSON.parse(job.payload as string)).toEqual({
      photoId: res.photoId,
      runId: run.id,
    });

    const [photo] = listPhotos();
    expect(photo).toMatchObject({
      id: res.photoId,
      filename: 'shelf.jpg',
      status: 'queued',
      runNo: 1,
      spineCount: 0,
      truncated: false,
      densityFlags: [],
      hasEarlierScan: false,
    });
  });

  it('identical bytes, sequential or concurrent, create no second photo, run or job', async () => {
    const [a, b] = await Promise.all([
      ingestUpload({ bytes: JPEG, kind: 'jpeg' }),
      ingestUpload({ bytes: JPEG, kind: 'jpeg' }),
    ]);
    const c = await ingestUpload({ bytes: JPEG, kind: 'jpeg' });
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
    expect(b.photoId).toBe(a.photoId);
    expect(c).toEqual({ photoId: a.photoId, duplicate: true });
    expect(count('photos')).toBe(1);
    expect(count('vision_runs')).toBe(1);
    expect(count('jobs')).toBe(1);
  });
});
