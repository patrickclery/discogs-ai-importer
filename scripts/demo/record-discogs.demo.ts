// Phase 5 Discogs recorder (D-10, D-13). Developer-run, one time, with the
// owner's connected account; never part of `pnpm test`:
//
//   pnpm demo:record      (sets DEMO_RECORD=1)
//
// For every spine of demo/fixtures/shelf.json it runs the app's real search
// cascade (searchInputs -> runCascade -> toCandidateFromSearch ->
// rankCandidates, exactly as search-spine.ts wires them) through
// discogsFetch and its paced gate (~1 request/s), and keeps text fields only.
// Resumable: spines already in discogs.json are skipped. Only GET
// /database/search and GET /releases/{id} are ever sent (T-05-10).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CandidateFormat, SearchStage } from '@/lib/discogs-types';
import { getDiscogsAuth } from '@/server/discogs/auth';
import { discogsFetch } from '@/server/discogs/client';
import {
  type FieldValues,
  type SearchInputs,
  searchInputs,
} from '@/server/discogs/inputs';
import {
  type Candidate,
  type CascadeSearch,
  parseSearchResponse,
  ReleaseSchema,
  rankCandidates,
  runCascade,
  toCandidateFromRelease,
  toCandidateFromSearch,
} from '@/server/discogs/search';
import { updateSecretsFile } from '@/server/secrets';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SHELF = path.join(ROOT, 'demo/fixtures/shelf.json');
const OUT = path.join(ROOT, 'demo/fixtures/discogs.json');
/** Shorter secret values are too likely to match ordinary text. */
const SECRET_MIN_LENGTH = 4;

type ShelfSpine = {
  key: string;
  fields: Array<{ field: string; value: string | null }>;
};

type RecordedCandidate = {
  releaseId: number;
  title: string;
  year: number | null;
  country: string | null;
  labels: string[];
  catno: string | null;
  formats: CandidateFormat[];
  catnoMatch: boolean;
  stage: SearchStage | null;
};

type Recording = {
  inputs: SearchInputs;
  stage: SearchStage | null;
  total: number;
  outcome: 'done' | 'no_match';
  candidates: RecordedCandidate[];
};

type Recordings = {
  recordedAt: string;
  spines: Record<string, Recording>;
  canned?: RecordedCandidate;
};

/** T-05-10: the recorder only ever reads search results and releases. */
function assertReadOnly(method: string, apiPath: string): void {
  if (method !== 'GET') {
    throw new Error(`recorder refused ${method}: GET only`);
  }
  if (
    !apiPath.startsWith('/database/search') &&
    !/^\/releases\/[1-9]\d*$/.test(apiPath)
  ) {
    throw new Error(
      'recorder refused a path outside /database/search and /releases/',
    );
  }
}

async function get(
  apiPath: string,
  query?: Record<string, string | number>,
): Promise<unknown> {
  assertReadOnly('GET', apiPath);
  const res = await discogsFetch({
    method: 'GET',
    path: apiPath,
    query,
    auth: 'oauth',
  });
  return res.json;
}

/** The RecordedCandidate keys only: no thumbUrl, masterId or URL (T-05-09). */
function toRecorded(c: Candidate): RecordedCandidate {
  return {
    releaseId: c.releaseId,
    title: c.title,
    year: c.year,
    country: c.country,
    labels: [...c.labels],
    catno: c.catno,
    formats: c.formats.map((f) => ({
      name: f.name,
      qty: f.qty,
      descriptions: [...f.descriptions],
      text: f.text,
    })),
    catnoMatch: c.catnoMatch,
    stage: c.stage,
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function load(): Recordings {
  if (!fs.existsSync(OUT)) return { recordedAt: today(), spines: {} };
  return JSON.parse(fs.readFileSync(OUT, 'utf8')) as Recordings;
}

/** Deterministic order: shelf order, then canned last. */
function serialize(rec: Recordings, order: string[]): string {
  const spines: Record<string, Recording> = {};
  for (const key of order) if (rec.spines[key]) spines[key] = rec.spines[key];
  const out: Recordings = { recordedAt: rec.recordedAt, spines };
  if (rec.canned) out.canned = rec.canned;
  return `${JSON.stringify(out, null, 2)}\n`;
}

/** Temp file + rename, so a stopped run never leaves half a file. */
function writeAtomic(text: string): void {
  const tmp = `${OUT}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, OUT);
}

/**
 * T-05-09: the JSON holds no value of the owner's secrets file (compared in
 * memory; only key names are reported), no URL and no thumb key.
 */
function leakCheck(text: string): string[] {
  const problems: string[] = [];
  let secrets: Record<string, string> = {};
  // Read-only: returning null writes nothing.
  updateSecretsFile((current) => {
    secrets = current;
    return null;
  });
  for (const [name, value] of Object.entries(secrets)) {
    if (value.length >= SECRET_MIN_LENGTH && text.includes(value)) {
      problems.push(`contains the value of ${name}`);
    }
  }
  if (text.includes('http')) problems.push("contains 'http'");
  if (text.includes('"thumb')) problems.push('contains a thumb key');
  if (text.includes('"uri')) problems.push('contains a uri key');
  return problems;
}

describe.skipIf(process.env.DEMO_RECORD !== '1')('record Discogs', () => {
  it('records the cascade candidates of every shelf spine', async () => {
    if (!getDiscogsAuth()) {
      throw new Error(
        'Discogs is not connected: connect it on the Settings page, then rerun',
      );
    }
    const shelf = JSON.parse(fs.readFileSync(SHELF, 'utf8')) as {
      spines: ShelfSpine[];
    };
    const order = shelf.spines.map((s) => s.key);
    const rec = load();
    rec.recordedAt = today();

    const api: CascadeSearch = {
      async search(params) {
        return parseSearchResponse(await get('/database/search', params));
      },
    };

    let searched = 0;
    for (const spine of shelf.spines) {
      if (rec.spines[spine.key]) continue;
      const fields: FieldValues = {};
      for (const f of spine.fields) {
        if (
          f.field === 'artist' ||
          f.field === 'title' ||
          f.field === 'catalog_number' ||
          f.field === 'raw_text'
        ) {
          fields[f.field] = f.value;
        }
      }
      const inputs = searchInputs(fields);
      const out = await runCascade(inputs, api);
      const candidates = rankCandidates(
        out.results.map((r, rank) =>
          toCandidateFromSearch(r, out.stage ?? 'text', rank),
        ),
        inputs.catno,
      );
      rec.spines[spine.key] = {
        inputs,
        stage: out.stage,
        total: out.total,
        outcome: candidates.length > 0 ? 'done' : 'no_match',
        candidates: candidates.map(toRecorded),
      };
      writeAtomic(serialize(rec, order));
      searched += 1;
      console.log(
        `demo:record ${spine.key} ${out.stage ?? 'no_match'} ${candidates.length}`,
      );
    }

    if (!rec.canned) {
      const first = order.flatMap((k) => rec.spines[k]?.candidates ?? []).at(0);
      if (!first) throw new Error('no recorded candidate to base canned on');
      const release = ReleaseSchema.parse(
        await get(`/releases/${first.releaseId}`),
      );
      rec.canned = toRecorded(toCandidateFromRelease(release));
    }

    const text = serialize(rec, order);
    const problems = leakCheck(text);
    if (problems.length) {
      // A file holding a secret value is never kept.
      if (problems.some((p) => p.startsWith('contains the value of'))) {
        fs.rmSync(OUT, { force: true });
      }
      throw new Error(`discogs.json rejected: ${problems.join('; ')}`);
    }
    writeAtomic(text);
    console.log(
      `demo:record ${searched} spines searched, ${Object.keys(rec.spines).length} recorded, canned ${rec.canned.releaseId}`,
    );
    expect(Object.keys(rec.spines)).toHaveLength(order.length);
  });
});
