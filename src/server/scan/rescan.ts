import 'server-only';
import { PROMPT_VERSION, SCHEMA_VERSION } from '@/lib/vision-contract';
import { getDb } from '../db/client';
import { newId } from '../ids';
import { enqueue } from '../jobs/queue';

// Explicit re-scan (CONTEXT D-17, INGEST-04): the only path that sends a
// photo to Claude again. The guard, the new run and its one-shot job are one
// IMMEDIATE transaction, so two concurrent requests can never queue two
// runs (T-02-22). Named parameters (better-sqlite3 rejects ?1).

export type StartRescanResult =
  | { status: 'started'; runId: string; runNo: number }
  | { status: 'not_found' }
  | { status: 'active' };

export function startRescan(photoId: string): StartRescanResult {
  const db = getDb().$client;
  const start = db.transaction((): StartRescanResult => {
    const photo = db
      .prepare('SELECT id FROM photos WHERE id = @photoId')
      .get({ photoId }) as { id: string } | undefined;
    if (!photo) return { status: 'not_found' };

    const latest = db
      .prepare(
        `SELECT status, run_no FROM vision_runs WHERE photo_id = @photoId
         ORDER BY run_no DESC LIMIT 1`,
      )
      .get({ photoId }) as { status: string; run_no: number } | undefined;
    if (
      latest &&
      ['queued', 'preparing', 'calling', 'parsing'].includes(latest.status)
    ) {
      return { status: 'active' };
    }

    const now = Date.now();
    const runNo = (latest?.run_no ?? 0) + 1;
    const runId = newId();
    db.prepare(
      `INSERT INTO vision_runs (id, photo_id, run_no, status, prompt_version,
         schema_version, created_at, updated_at)
       VALUES (@runId, @photoId, @runNo, 'queued', @promptVersion,
         @schemaVersion, @now, @now)`,
    ).run({
      runId,
      photoId,
      runNo,
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      now,
    });

    // One paid call per run: never retried (RESEARCH Pitfall 3, D-17).
    const job = enqueue({
      lane: 'anthropic',
      type: 'scan_photo',
      payload: { photoId, runId },
      dedupeKey: `scan:${photoId}:${runNo}`,
      maxAttempts: 1,
    });
    if (!job.created) {
      throw new Error(`startRescan: scan:${photoId}:${runNo} already queued`);
    }
    db.prepare('UPDATE vision_runs SET job_id = @jobId WHERE id = @runId').run({
      jobId: job.id,
      runId,
    });
    db.prepare(
      `UPDATE photos SET latest_run_id = @runId, updated_at = @now
       WHERE id = @photoId`,
    ).run({ runId, now, photoId });
    return { status: 'started', runId, runNo };
  });
  return start.immediate();
}
