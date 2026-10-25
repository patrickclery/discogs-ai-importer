import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import type { CandidateFormat } from '@/lib/discogs-types';
import { getDb } from '@/server/db/client';
import type { JobRow } from '@/server/db/schema';
import { clearAuthInvalid, saveDiscogsAuth } from '@/server/discogs/auth';
import type { DiscogsFetchDeps } from '@/server/discogs/client';
import { resetDiscogsGateForTests } from '@/server/discogs/gate';
import { createSearch, finishSearch } from '@/server/discogs/store';
import { newId } from '@/server/ids';
import type { JobContext } from '@/server/jobs/types';
import { ingestUpload } from '@/server/scan/ingest';
import { SECRET_ENV_NAMES, saveSecrets } from '@/server/secrets';
import {
  makeSyntheticShelf,
  structuredOutputFor,
} from '../fixtures/vision/synthetic-shelf.mjs';
import { layout, parsingRun, persist, spineByDetection } from './scan-runs';

// Shared seeding for every Phase 6 server test (Plan 06-02). Later plans
// import these and keep their own extra helpers in their test files. Call
// inside a useTempDataDir() block. Never a live API, never a real sleep.

/** Fake-clock start for the Discogs gate. */
export const FAKE_START = 1_800_000_000_000;

/**
 * A temp SECRETS_FILE with canary consumer credentials for each test; the
 * env and the auth-invalid flag are restored afterwards.
 */
export function useBulkSecrets(): void {
  let dir = '';
  const names = [
    'SECRETS_FILE',
    'DISCOGS_API_BASE',
    ...Object.values(SECRET_ENV_NAMES),
  ];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const n of names) {
      saved[n] = process.env[n];
      delete process.env[n];
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-bulk-'));
    process.env.SECRETS_FILE = path.join(dir, 'secrets.json');
    saveSecrets({
      discogsConsumerKey: 'CANARYDISCOGSKEY-0123456789wxyz',
      discogsConsumerSecret: 'CANARYDISCOGSSECRET-0123456789abcd',
    });
  });
  afterEach(() => {
    clearAuthInvalid();
    for (const n of names) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

/** A stored Discogs sign-in with canary token values. */
export function connectDiscogs(username = 'fake-owner'): void {
  saveDiscogsAuth({
    token: 'CANARYTOKEN-0123456789efgh',
    tokenSecret: 'CANARYTOKENSECRET-0123456789ijkl',
    username,
  });
}

/** One synthetic shelf photo scanned once; spine ids in detection order. */
export async function bulkShelf(
  filename = 'shelf.jpg',
): Promise<{ photoId: string; spineIds: string[] }> {
  const { jpeg } = await makeSyntheticShelf(layout);
  const { photoId } = await ingestUpload({
    bytes: new Uint8Array(jpeg),
    kind: 'jpeg',
    filename,
  });
  const run = parsingRun(photoId, 1);
  const detections = persist(run, structuredOutputFor(layout));
  return {
    photoId,
    spineIds: detections.map((d) => spineByDetection(d.id).id),
  };
}

export type TopCandidateSeed = {
  releaseId: number;
  title: string;
  artist: string | null;
  country: string | null;
  masterId: number | null;
  labels: string[];
  formats: CandidateFormat[];
  thumbUrl: string | null;
  year: number | null;
};

const TOP_DEFAULTS: TopCandidateSeed = {
  releaseId: 5001,
  title: 'Nirvana - Nevermind',
  artist: 'Nirvana',
  country: 'US',
  masterId: 13814,
  labels: ['DGC'],
  formats: [{ name: 'CD', qty: '1', descriptions: ['Album'], text: null }],
  thumbUrl: null,
  year: 1991,
};

/**
 * A done auto search for the spine with one rank-0 auto candidate: the
 * spine's top match. Defaults are Nevermind's US DGC CD (master 13814).
 */
export function seedTopCandidate(
  spineId: string,
  over: Partial<TopCandidateSeed> = {},
): { candidateId: string; searchId: string } {
  const db = getDb().$client;
  const c = { ...TOP_DEFAULTS, ...over };
  const raw = db
    .prepare(
      `SELECT value FROM spine_fields
       WHERE spine_id = ? AND field = 'raw_text'`,
    )
    .get(spineId) as { value: string | null } | undefined;
  const searchId = createSearch(db, {
    spineId,
    kind: 'auto',
    inputs: {
      artist: null,
      title: null,
      catno: null,
      rawText: raw?.value ?? null,
    },
    inputHash: 'seed',
  });
  finishSearch(db, searchId, {
    status: 'done',
    stage: 'artist_title',
    resultCount: 1,
    totalCount: 1,
    resultsJson: '[]',
  });
  const candidateId = newId();
  db.prepare(
    `INSERT INTO discogs_candidates (id, spine_id, search_id, source,
       release_id, rank, title, artist, year, country, labels_json, catno,
       formats_json, thumb_url, master_id, stage, catno_match, created_at)
     VALUES (@id, @spineId, @searchId, 'auto', @releaseId, 0, @title,
       @artist, @year, @country, @labelsJson, NULL, @formatsJson, @thumbUrl,
       @masterId, 'artist_title', 0, @now)`,
  ).run({
    id: candidateId,
    spineId,
    searchId,
    releaseId: c.releaseId,
    title: c.title,
    artist: c.artist,
    year: c.year,
    country: c.country,
    labelsJson: JSON.stringify(c.labels),
    formatsJson: JSON.stringify(c.formats),
    thumbUrl: c.thumbUrl,
    masterId: c.masterId,
    now: Date.now(),
  });
  return { candidateId, searchId };
}

export type FakeAnswer = {
  status: number;
  /** A string is sent verbatim; anything else as JSON. */
  body: unknown;
  headers?: Record<string, string>;
};

/**
 * Discogs fetch deps with a stubbed fetchImpl that records every URL and a
 * gate on a fake clock (no real sleep).
 */
export function fakeDiscogsDeps(respond: (url: URL) => FakeAnswer): {
  deps: DiscogsFetchDeps;
  calls: URL[];
  clock: { t: number; now(): number; sleep(ms: number): Promise<void> };
} {
  const clock = {
    t: FAKE_START,
    now: () => clock.t,
    sleep: async (ms: number) => {
      clock.t += ms;
    },
  };
  const gate = resetDiscogsGateForTests(clock);
  const calls: URL[] = [];
  const fetchImpl = (async (input: string | URL) => {
    const url = new URL(String(input));
    calls.push(url);
    const a = respond(url);
    const text = typeof a.body === 'string' ? a.body : JSON.stringify(a.body);
    return new Response(text, { status: a.status, headers: a.headers });
  }) as unknown as typeof fetch;
  return { deps: { fetchImpl, gate }, calls, clock };
}

/** A JobContext for a claimed job; current decides isCurrent(). */
export function jobCtx(job: JobRow, current = () => true): JobContext {
  return {
    job,
    signal: new AbortController().signal,
    isCurrent: current,
  };
}
