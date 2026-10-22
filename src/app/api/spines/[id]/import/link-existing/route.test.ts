import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { orphanScenario } from '../../../../../../../test/helpers/scan-runs';
import { useTempDataDir } from '../../../../../../../test/helpers/temp-data-dir';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

import { getDb } from '@/server/db/client';
import { createSearch } from '@/server/discogs/store';
import { newId } from '@/server/ids';
import { createImport } from '@/server/imports/store';
import { SECRET_ENV_NAMES, saveSecrets } from '@/server/secrets';
import { POST } from './route';

// POST /api/spines/{id}/import/link-existing (D-05, T-04-30): records the
// first copy Discogs listed that no import holds and marks the spine
// imported; no Discogs request, so no sign-in is needed (A-04-18).

function useTempSecrets(): void {
  let dir = '';
  const names = ['SECRETS_FILE', ...Object.values(SECRET_ENV_NAMES)];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const n of names) {
      saved[n] = process.env[n];
      delete process.env[n];
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-link-route-'));
    process.env.SECRETS_FILE = path.join(dir, 'secrets.json');
    saveSecrets({
      discogsConsumerKey: 'CANARYDISCOGSKEY-0123456789wxyz',
      discogsConsumerSecret: 'CANARYDISCOGSSECRET-0123456789abcd',
    });
  });
  afterEach(() => {
    for (const n of names) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

function db() {
  return getDb().$client;
}

function link(id: string, body: unknown, contentType = 'application/json') {
  return POST(
    new Request(`http://127.0.0.1:3001/api/spines/${id}/import/link-existing`, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

/** A confirmed import of releaseId; its id. */
function confirmed(spineId: string, releaseId: number): string {
  const searchId = createSearch(db(), {
    spineId,
    kind: 'manual',
    inputs: { artist: null, title: null, catno: null, rawText: 'x' },
    inputHash: null,
  });
  const candidateId = newId();
  db()
    .prepare(
      `INSERT INTO discogs_candidates (id, spine_id, search_id, source,
         release_id, rank, title, labels_json, formats_json, thumb_url,
         catno_match, created_at)
       VALUES (@id, @spineId, @searchId, 'manual', @releaseId, 0, 'A - T',
         '[]', '[]', NULL, 0, @now)`,
    )
    .run({ id: candidateId, spineId, searchId, releaseId, now: Date.now() });
  const res = createImport(db(), { spineId, candidateId });
  if (res.status !== 'ok') throw new Error(res.status);
  db()
    .prepare(`UPDATE jobs SET status = 'succeeded' WHERE id = ?`)
    .run(res.jobId);
  return res.importId;
}

/** A held import (already_in_collection) listing the copies. */
function held(
  spineId: string,
  instanceIds: number[],
  releaseId = 1031,
): string {
  const importId = confirmed(spineId, releaseId);
  db()
    .prepare(
      `UPDATE imports SET status = 'already_in_collection', existing_json = ?
       WHERE id = ?`,
    )
    .run(
      JSON.stringify(
        instanceIds.map((instanceId) => ({
          instanceId,
          folderId: 1,
          dateAdded: '2015-11-30T10:54:13-08:00',
        })),
      ),
      importId,
    );
  return importId;
}

function rows(): string {
  return JSON.stringify([
    db().prepare('SELECT * FROM imports ORDER BY id').all(),
    db().prepare('SELECT * FROM jobs ORDER BY id').all(),
  ]);
}

describe('POST /api/spines/{id}/import/link-existing', () => {
  useTempDataDir();
  useTempSecrets();

  it('415 for text/plain and 400 for any key, and nothing changes', async () => {
    const { spineIds } = await orphanScenario();
    held(spineIds[0], [7001]);
    const before = rows();
    expect((await link(spineIds[0], {}, 'text/plain')).status).toBe(415);
    const extra = await link(spineIds[0], { instanceId: 7001 });
    expect(extra.status).toBe(400);
    expect(((await extra.json()) as { error: string }).error).toBe(
      'invalid_body',
    );
    expect(rows()).toBe(before);
  });

  it('404 for an unknown spine and for a spine with no import', async () => {
    const { spineIds } = await orphanScenario();
    for (const id of ['no-such-spine', spineIds[0]]) {
      const res = await link(id, {});
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: string }).error).toBe('not_found');
    }
  });

  it('200 { importId, instanceId } with no Discogs sign-in, and the row is linked', async () => {
    const { spineIds } = await orphanScenario();
    const importId = held(spineIds[0], [7001, 7002]);
    const res = await link(spineIds[0], {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ importId, instanceId: 7001 });
    expect(
      db()
        .prepare('SELECT status, instance_id, linked FROM imports WHERE id = ?')
        .get(importId),
    ).toEqual({ status: 'imported', instance_id: 7001, linked: 1 });
  });

  it('409 not_held when the import is not waiting on that choice', async () => {
    const { spineIds } = await orphanScenario();
    confirmed(spineIds[0], 1031);
    const before = rows();
    const res = await link(spineIds[0], {});
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'not_held',
      message: 'This spine is not waiting on that choice any more.',
    });
    expect(rows()).toBe(before);
  });

  it('409 no_existing when every listed copy is linked to another spine', async () => {
    const { spineIds } = await orphanScenario();
    held(spineIds[1], [7001], 2042);
    expect((await link(spineIds[1], {})).status).toBe(200);
    held(spineIds[0], [7001]);
    const before = rows();
    const res = await link(spineIds[0], {});
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'no_existing',
      message: 'That copy is already linked to another spine.',
    });
    expect(rows()).toBe(before);
  });
});
