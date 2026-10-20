import { describe, expect, it, vi } from 'vitest';
import { getDb } from '@/server/db/client';
import { ingestUpload } from '@/server/scan/ingest';
import { useTempDataDir } from '../../../../../../test/helpers/temp-data-dir';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

import { POST } from './route';

// Explicit re-scan (D-17, T-02-22, T-02-23): JSON only, 404 for an unknown
// photo, 409 while any run is active, and one queued one-shot run per
// accepted request.

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

function rescan(id: string, contentType = 'application/json') {
  const req = new Request(`http://127.0.0.1:3000/api/photos/${id}/rescan`, {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: '{}',
  });
  return POST(req, { params: Promise.resolve({ id }) });
}

type JobDb = {
  id: string;
  status: string;
  max_attempts: number;
  dedupe_key: string;
  payload: string;
};

function scanJobs(): JobDb[] {
  return getDb()
    .$client.prepare(
      "SELECT * FROM jobs WHERE type = 'scan_photo' ORDER BY created_at, id",
    )
    .all() as JobDb[];
}

function setRun1(photoId: string, status: string): void {
  getDb()
    .$client.prepare(
      'UPDATE vision_runs SET status = ? WHERE photo_id = ? AND run_no = 1',
    )
    .run(status, photoId);
}

describe('POST /api/photos/{id}/rescan', () => {
  useTempDataDir();

  async function photo(): Promise<string> {
    const { photoId } = await ingestUpload({
      bytes: JPEG,
      kind: 'jpeg',
      filename: 'shelf.jpg',
    });
    return photoId;
  }

  it('415 for text/plain, and nothing is queued', async () => {
    const id = await photo();
    setRun1(id, 'done');
    const res = await rescan(id, 'text/plain');
    expect(res.status).toBe(415);
    expect(scanJobs()).toHaveLength(1);
  });

  it('404 not_found for an unknown photo', async () => {
    const res = await rescan('no-such-photo');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'not_found' });
  });

  it('409 run_active while the latest run is calling', async () => {
    const id = await photo();
    setRun1(id, 'calling');
    const res = await rescan(id);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'run_active',
      message: 'This photo is already being analyzed.',
    });
    expect(scanJobs()).toHaveLength(1);
  });

  it('201 runNo 2 for a done photo, with one queued one-shot scan job', async () => {
    const id = await photo();
    setRun1(id, 'done');
    const res = await rescan(id);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { runId: string; runNo: number };
    expect(body.runNo).toBe(2);

    const jobs = scanJobs().filter((j) => j.dedupe_key !== `scan:${id}:1`);
    expect(jobs).toHaveLength(1);
    const [job] = jobs;
    expect(job).toMatchObject({
      status: 'queued',
      max_attempts: 1,
      dedupe_key: `scan:${id}:2`,
    });
    expect(JSON.parse(job.payload)).toEqual({ photoId: id, runId: body.runId });

    const db = getDb().$client;
    const run = db
      .prepare('SELECT * FROM vision_runs WHERE id = ?')
      .get(body.runId) as {
      photo_id: string;
      run_no: number;
      status: string;
      job_id: string;
    };
    expect(run).toMatchObject({
      photo_id: id,
      run_no: 2,
      status: 'queued',
      job_id: job.id,
    });
    const latest = db
      .prepare('SELECT latest_run_id FROM photos WHERE id = ?')
      .get(id) as { latest_run_id: string };
    expect(latest.latest_run_id).toBe(body.runId);
  });

  it('a second POST while the re-scan is queued is 409', async () => {
    const id = await photo();
    setRun1(id, 'done');
    expect((await rescan(id)).status).toBe(201);
    const again = await rescan(id);
    expect(again.status).toBe(409);
    expect(scanJobs()).toHaveLength(2);
  });

  it('201 after a failed run (error is not active)', async () => {
    const id = await photo();
    setRun1(id, 'error');
    const res = await rescan(id);
    expect(res.status).toBe(201);
    expect(((await res.json()) as { runNo: number }).runNo).toBe(2);
  });
});
