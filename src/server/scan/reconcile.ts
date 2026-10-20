import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../db/client';
import { enqueue } from '../jobs/queue';
import { resolveData } from '../storage/paths';
import { markRunError } from './store';

// Reconciliation of vision runs whose job finished without a terminal run
// status (RESEARCH Pattern 4 steps 1-3, Pitfall 3). Runs on every lease tick
// of the worker holder, after job recovery. It never spawns the CLI and never
// enqueues anything that can (INGEST-04, T-02-11): a run that already has
// Claude's answer on disk gets a one-shot reparse job that reads raw.json
// only; every other stuck run is marked error so the UI never shows a photo
// as analyzing forever.

type StuckRun = {
  id: string;
  photo_id: string;
  run_no: number;
  status: 'queued' | 'preparing' | 'calling' | 'parsing';
  raw_path: string | null;
};

const FINISHED_JOB = "('succeeded', 'failed', 'cancelled')";

/** Where scan_photo writes a run's raw answer (before raw_path is set). */
export function rawPathFor(photoId: string, runNo: number): string {
  return path.posix.join('vision', photoId, `run-${runNo}`, 'raw.json');
}

function rawExists(rel: string): boolean {
  try {
    return fs.statSync(resolveData(rel)).isFile();
  } catch {
    return false;
  }
}

/** True while the job can still run (queued or running). */
function jobActive(jobId: string): boolean {
  const row = getDb()
    .$client.prepare('SELECT status FROM jobs WHERE id = ?')
    .get(jobId) as { status: string } | undefined;
  return row?.status === 'queued' || row?.status === 'running';
}

export function reconcileVisionRuns(now = Date.now()): {
  errored: number;
  reparsed: number;
} {
  const db = getDb().$client;
  const stuck = db
    .prepare(
      `SELECT r.id, r.photo_id, r.run_no, r.status, r.raw_path
       FROM vision_runs r LEFT JOIN jobs j ON j.id = r.job_id
       WHERE r.status IN ('queued', 'preparing', 'calling', 'parsing')
         AND (j.id IS NULL OR j.status IN ${FINISHED_JOB})`,
    )
    .all() as StuckRun[];

  let errored = 0;
  let reparsed = 0;
  for (const run of stuck) {
    const settle = db.transaction((): void => {
      if (run.status === 'queued' || run.status === 'preparing') {
        if (
          markRunError(
            run.id,
            'failed',
            'the app stopped before this photo was sent to Claude',
          )
        ) {
          errored += 1;
        }
        return;
      }

      const rawRel = run.raw_path ?? rawPathFor(run.photo_id, run.run_no);
      if (!rawExists(rawRel)) {
        if (markRunError(run.id, 'interrupted')) errored += 1;
        return;
      }

      // Claude already answered: finish from disk, never a second call.
      const job = enqueue({
        lane: 'anthropic',
        type: 'scan_photo',
        payload: { photoId: run.photo_id, runId: run.id, mode: 'reparse' },
        dedupeKey: `reparse:${run.id}`,
        maxAttempts: 1,
      });
      if (!job.created && !jobActive(job.id)) {
        // The one reparse already ran and still left the run unsettled.
        if (
          markRunError(run.id, 'failed', 'the saved answer could not be read')
        ) {
          errored += 1;
        }
        return;
      }
      db.prepare(
        'UPDATE vision_runs SET job_id = ?, updated_at = ? WHERE id = ? AND status = ?',
      ).run(job.id, now, run.id, run.status);
      if (job.created) reparsed += 1;
    });
    settle.immediate();
  }

  if (errored || reparsed) {
    console.log(
      `[scan] reconciled vision runs: ${errored} errored, ${reparsed} reparse job(s)`,
    );
  }
  return { errored, reparsed };
}
