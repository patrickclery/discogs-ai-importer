import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LAYOUTS,
  makeSyntheticShelf,
  structuredOutputFor,
} from '../../../test/fixtures/vision/synthetic-shelf.mjs';
import { useTempDataDir } from '../../../test/helpers/temp-data-dir';
import { getDb } from '../db/client';
import type { JobRow } from '../db/schema';
import { handlers } from '../jobs/handlers';
import { runScanPhoto } from '../jobs/handlers/scan-photo';
import type { JobContext } from '../jobs/types';
import { processNext } from '../jobs/worker';
import { reasonFor } from '../vision/reasons';
import { ingestUpload } from './ingest';
import { listSpines } from './queries';
import { reconcileVisionRuns } from './reconcile';

// Crash recovery for the run ledger (RESEARCH Pattern 4 steps 1-3, Pitfall
// 3): a run whose job finished without a terminal run status is either
// completed from its saved raw answer (zero calls) or marked error. Nothing
// here may ever spawn the CLI again (INGEST-04, T-02-11).

const FAKE = path.resolve(
  import.meta.dirname,
  '../../../test/fixtures/fake-claude.mjs',
);
const ENV_KEYS = [
  'CLAUDE_BIN',
  'FAKE_CLAUDE_MODE',
  'FAKE_CLAUDE_LOG',
  'FAKE_CLAUDE_VISION_FIXTURE',
] as const;
const layout = LAYOUTS.tracerShelf;
const STOPPED_BEFORE_SEND =
  'Scan failed: the app stopped before this photo was sent to Claude. Re-scan to try again.';

type RunDb = {
  id: string;
  photo_id: string;
  run_no: number;
  status: string;
  job_id: string | null;
  raw_path: string | null;
  error_kind: string | null;
  error_reason: string | null;
  cd_count: number | null;
};
type JobDb = {
  id: string;
  type: string;
  status: string;
  payload: string;
  max_attempts: number;
  dedupe_key: string | null;
};

describe('reconcileVisionRuns', () => {
  const dataDir = useTempDataDir();
  const saved: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};
  let photoId = '';
  let runId = '';
  let scanJobId = '';

  const db = () => getDb().$client;
  const run = () =>
    db().prepare('SELECT * FROM vision_runs WHERE id = ?').get(runId) as RunDb;
  const jobs = () =>
    db().prepare('SELECT * FROM jobs ORDER BY created_at').all() as JobDb[];
  const setRun = (status: string) =>
    db()
      .prepare('UPDATE vision_runs SET status = ? WHERE id = ?')
      .run(status, runId);
  const setJob = (id: string, status: string) =>
    db().prepare('UPDATE jobs SET status = ? WHERE id = ?').run(status, id);

  function calls(): number {
    const file = process.env.FAKE_CLAUDE_LOG as string;
    if (!fs.existsSync(file)) return 0;
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .filter((l) => (JSON.parse(l) as { argv: string[] }).argv[0] === '-p')
      .length;
  }

  /** A recorded fake vision run, saved where the handler would save it. */
  function writeRaw(): string {
    const rel = `vision/${photoId}/run-1/raw.json`;
    const abs = path.join(dataDir(), rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const stdout = JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: '',
      duration_ms: 2345,
      num_turns: 2,
      total_cost_usd: 0.0456,
      structured_output: structuredOutputFor(layout),
    });
    fs.writeFileSync(
      abs,
      JSON.stringify({
        runId,
        recordedAt: Date.now(),
        run: {
          exitCode: 0,
          signal: null,
          stdout,
          stderr: '',
          timedOut: false,
          aborted: false,
        },
      }),
    );
    return rel;
  }

  beforeEach(async () => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    const dir = dataDir();
    const fixture = path.join(dir, 'structured.json');
    fs.writeFileSync(fixture, JSON.stringify(structuredOutputFor(layout)));
    // Any spawn would succeed and be logged, so a re-send is visible.
    process.env.CLAUDE_BIN = FAKE;
    process.env.FAKE_CLAUDE_MODE = 'vision';
    process.env.FAKE_CLAUDE_VISION_FIXTURE = fixture;
    process.env.FAKE_CLAUDE_LOG = path.join(dir, 'log.jsonl');
    const { jpeg } = await makeSyntheticShelf(layout);
    ({ photoId } = await ingestUpload({
      bytes: new Uint8Array(jpeg),
      kind: 'jpeg',
      filename: 'tracer.jpg',
    }));
    const r = db()
      .prepare('SELECT id, job_id FROM vision_runs WHERE photo_id = ?')
      .get(photoId) as { id: string; job_id: string };
    runId = r.id;
    scanJobId = r.job_id;
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('errors a preparing run whose job failed with the stopped-before-send reason', () => {
    setRun('preparing');
    setJob(scanJobId, 'failed');
    expect(reconcileVisionRuns()).toEqual({ errored: 1, reparsed: 0 });
    expect(run().status).toBe('error');
    expect(run().error_kind).toBe('failed');
    expect(run().error_reason).toBe(STOPPED_BEFORE_SEND);
  });

  it('errors a queued run whose job is gone', () => {
    db().prepare('DELETE FROM jobs WHERE id = ?').run(scanJobId);
    reconcileVisionRuns();
    expect(run().status).toBe('error');
    expect(run().error_reason).toBe(STOPPED_BEFORE_SEND);
  });

  it('errors a calling run with no raw answer as interrupted', () => {
    setRun('calling');
    setJob(scanJobId, 'failed');
    expect(reconcileVisionRuns()).toEqual({ errored: 1, reparsed: 0 });
    expect(run().status).toBe('error');
    expect(run().error_kind).toBe('interrupted');
    expect(run().error_reason).toBe(
      'The app stopped while Claude was reading this photo. Re-scan to try again.',
    );
    expect(run().error_reason).toBe(reasonFor('interrupted'));
  });

  it('completes a calling run from its saved raw.json with zero calls', async () => {
    setRun('calling');
    setJob(scanJobId, 'failed');
    writeRaw();
    expect(reconcileVisionRuns()).toEqual({ errored: 0, reparsed: 1 });

    const reparse = jobs().find((j) => j.dedupe_key === `reparse:${runId}`);
    expect(reparse).toBeDefined();
    expect(reparse?.type).toBe('scan_photo');
    expect(reparse?.max_attempts).toBe(1);
    expect(JSON.parse(reparse?.payload ?? '{}')).toEqual({
      photoId,
      runId,
      mode: 'reparse',
    });
    expect(run().job_id).toBe(reparse?.id);
    expect(run().status).toBe('calling');

    expect(await processNext('anthropic', { handlers })).toBe('succeeded');
    expect(run().status).toBe('done');
    expect(run().cd_count).toBe(layout.spines.length);
    expect(listSpines()).toHaveLength(layout.spines.length);
    expect(calls()).toBe(0);
  });

  it('completes a parsing run from raw.json, and reconciling twice enqueues once', async () => {
    const rel = writeRaw();
    db()
      .prepare(
        "UPDATE vision_runs SET status = 'parsing', raw_path = ? WHERE id = ?",
      )
      .run(rel, runId);
    setJob(scanJobId, 'failed');
    reconcileVisionRuns();
    reconcileVisionRuns();
    expect(
      jobs().filter((j) => j.dedupe_key === `reparse:${runId}`),
    ).toHaveLength(1);

    expect(await processNext('anthropic', { handlers })).toBe('succeeded');
    expect(run().status).toBe('done');
    expect(calls()).toBe(0);
  });

  it('errors the run when its reparse job also finished without settling it', () => {
    setRun('calling');
    setJob(scanJobId, 'failed');
    writeRaw();
    reconcileVisionRuns();
    const reparse = jobs().find((j) => j.dedupe_key === `reparse:${runId}`);
    setJob(reparse?.id as string, 'failed');
    expect(reconcileVisionRuns()).toEqual({ errored: 1, reparsed: 0 });
    expect(run().status).toBe('error');
    expect(
      jobs().filter((j) => j.dedupe_key === `reparse:${runId}`),
    ).toHaveLength(1);
  });

  it('leaves a run alone while its job is queued or running', () => {
    setRun('calling');
    expect(reconcileVisionRuns()).toEqual({ errored: 0, reparsed: 0 });
    setJob(scanJobId, 'running');
    expect(reconcileVisionRuns()).toEqual({ errored: 0, reparsed: 0 });
    expect(run().status).toBe('calling');
    expect(jobs()).toHaveLength(1);
  });

  it('never enqueues anything but reparse jobs', () => {
    for (const status of ['queued', 'preparing', 'calling']) {
      setRun(status);
      setJob(scanJobId, 'failed');
      reconcileVisionRuns();
      db()
        .prepare(
          "UPDATE vision_runs SET status = 'queued', error_kind = NULL WHERE id = ?",
        )
        .run(runId);
    }
    expect(jobs().map((j) => j.id)).toEqual([scanJobId]);
  });
});

describe('runScanPhoto on an already started run', () => {
  const dataDir = useTempDataDir();

  it.each(['calling', 'parsing'])(
    'returns without spawning when the run is %s and mode is not reparse',
    async (status) => {
      const log = path.join(dataDir(), 'log.jsonl');
      const prev = {
        bin: process.env.CLAUDE_BIN,
        log: process.env.FAKE_CLAUDE_LOG,
      };
      process.env.CLAUDE_BIN = FAKE;
      process.env.FAKE_CLAUDE_LOG = log;
      try {
        const { jpeg } = await makeSyntheticShelf(layout);
        const { photoId } = await ingestUpload({
          bytes: new Uint8Array(jpeg),
          kind: 'jpeg',
          filename: 'tracer.jpg',
        });
        const db = getDb().$client;
        const { id: runId } = db
          .prepare('SELECT id FROM vision_runs WHERE photo_id = ?')
          .get(photoId) as { id: string };
        db.prepare('UPDATE vision_runs SET status = ? WHERE id = ?').run(
          status,
          runId,
        );
        const ctx: JobContext = {
          job: { id: 'job', attempts: 1 } as JobRow,
          signal: new AbortController().signal,
          isCurrent: () => true,
        };
        await runScanPhoto({ photoId, runId }, ctx);
        await runScanPhoto({ photoId, runId, mode: 'scan' }, ctx);
        const after = db
          .prepare('SELECT status FROM vision_runs WHERE id = ?')
          .get(runId) as { status: string };
        expect(after.status).toBe(status);
        expect(fs.existsSync(log)).toBe(false);
      } finally {
        if (prev.bin === undefined) delete process.env.CLAUDE_BIN;
        else process.env.CLAUDE_BIN = prev.bin;
        if (prev.log === undefined) delete process.env.FAKE_CLAUDE_LOG;
        else process.env.FAKE_CLAUDE_LOG = prev.log;
      }
    },
  );

  it('a reparse payload with no raw answer never spawns and errors the run', async () => {
    const log = path.join(dataDir(), 'log.jsonl');
    const prev = {
      bin: process.env.CLAUDE_BIN,
      log: process.env.FAKE_CLAUDE_LOG,
    };
    process.env.CLAUDE_BIN = FAKE;
    process.env.FAKE_CLAUDE_LOG = log;
    try {
      const { jpeg } = await makeSyntheticShelf(layout);
      const { photoId } = await ingestUpload({
        bytes: new Uint8Array(jpeg),
        kind: 'jpeg',
        filename: 'tracer.jpg',
      });
      const db = getDb().$client;
      const { id: runId } = db
        .prepare('SELECT id FROM vision_runs WHERE photo_id = ?')
        .get(photoId) as { id: string };
      db.prepare("UPDATE vision_runs SET status = 'calling' WHERE id = ?").run(
        runId,
      );
      await runScanPhoto(
        { photoId, runId, mode: 'reparse' },
        {
          job: { id: 'job', attempts: 1 } as JobRow,
          signal: new AbortController().signal,
          isCurrent: () => true,
        },
      );
      const after = db
        .prepare('SELECT status, error_kind FROM vision_runs WHERE id = ?')
        .get(runId) as { status: string; error_kind: string };
      expect(after).toEqual({ status: 'error', error_kind: 'interrupted' });
      expect(fs.existsSync(log)).toBe(false);
    } finally {
      if (prev.bin === undefined) delete process.env.CLAUDE_BIN;
      else process.env.CLAUDE_BIN = prev.bin;
      if (prev.log === undefined) delete process.env.FAKE_CLAUDE_LOG;
      else process.env.FAKE_CLAUDE_LOG = prev.log;
    }
  });
});
