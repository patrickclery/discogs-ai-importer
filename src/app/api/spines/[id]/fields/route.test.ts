import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTempDataDir } from '../../../../../../test/helpers/temp-data-dir';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

import { getDb } from '@/server/db/client';
import { PATCH } from './route';

// REV-02 / D-10 / T-02-18 / T-02-19: edits land in `value`, Claude's read in
// `ai_value` is never written, and only JSON edits to editable spines pass.

const SPINE = 'spine-1';
// Non-ASCII on purpose: "byte-identical" means exactly this string.
const AI_TITLE = 'Ágætis byrjun';

type Row = {
  ai_value: string | null;
  value: string | null;
  edit_base_ai_value: string | null;
  confidence: number;
};

function seed(state = 'active') {
  const db = getDb().$client;
  const now = Date.now();
  db.prepare(
    `INSERT INTO photos (id, sha256, original_name, mime, bytes, original_path,
       created_at, updated_at)
     VALUES ('photo-1', 'abc', 'shelf.jpg', 'image/jpeg', 1, 'photos/x.jpg', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO spines (id, photo_id, state, created_at, updated_at)
     VALUES (?, 'photo-1', ?, ?, ?)`,
  ).run(SPINE, state, now, now);
  db.prepare(
    `INSERT INTO spine_fields (spine_id, field, ai_value, value, confidence,
       edit_base_ai_value, updated_at)
     VALUES (?, 'title', ?, ?, 0.41, NULL, ?)`,
  ).run(SPINE, AI_TITLE, AI_TITLE, now);
}

function row(field = 'title'): Row {
  return getDb()
    .$client.prepare(
      `SELECT ai_value, value, edit_base_ai_value, confidence
       FROM spine_fields WHERE spine_id = ? AND field = ?`,
    )
    .get(SPINE, field) as Row;
}

function patch(
  body: unknown,
  opts: { contentType?: string; id?: string; raw?: string } = {},
) {
  const req = new Request(
    `http://127.0.0.1:3000/api/spines/${opts.id ?? SPINE}/fields`,
    {
      method: 'PATCH',
      headers: { 'content-type': opts.contentType ?? 'application/json' },
      body: opts.raw ?? JSON.stringify(body),
    },
  );
  return PATCH(req, { params: Promise.resolve({ id: opts.id ?? SPINE }) });
}

describe('PATCH /api/spines/[id]/fields', () => {
  useTempDataDir();
  beforeEach(() => seed());

  it('edit then revert leaves ai_value byte-identical (D-10)', async () => {
    const edit = await patch({ field: 'title', value: 'Agaetis Byrjun' });
    expect(edit.status).toBe(200);
    expect(await edit.json()).toMatchObject({
      field: 'title',
      value: 'Agaetis Byrjun',
      aiValue: AI_TITLE,
    });
    expect(row().ai_value).toBe(AI_TITLE);
    expect(row().value).toBe('Agaetis Byrjun');

    const revert = await patch({ field: 'title', revert: true });
    expect(revert.status).toBe(200);
    expect(row().ai_value).toBe(AI_TITLE);
    expect(row().value).toBe(AI_TITLE);
    expect(row().confidence).toBe(0.41);
  });

  it('records the edit base after an edit and clears it on revert', async () => {
    await patch({ field: 'title', value: 'Other' });
    expect(row().edit_base_ai_value).toBe(AI_TITLE);
    await patch({ field: 'title', revert: true });
    expect(row().edit_base_ai_value).toBeNull();
  });

  it('clears the edit base when the value is set back to the AI read', async () => {
    await patch({ field: 'title', value: 'Other' });
    // Typed back with padding: trimmed, it equals the AI read again.
    await patch({ field: 'title', value: `  ${AI_TITLE} ` });
    expect(row().value).toBe(AI_TITLE);
    expect(row().edit_base_ai_value).toBeNull();
  });

  it('saving the trimmed form of a padded AI read is not an edit (CR-01)', async () => {
    const padded = ` ${AI_TITLE}\n`;
    getDb()
      .$client.prepare(
        'UPDATE spine_fields SET ai_value = ?, value = ? WHERE spine_id = ?',
      )
      .run(padded, padded, SPINE);
    const res = await patch({ field: 'title', value: AI_TITLE });
    expect(res.status).toBe(200);
    expect(row()).toMatchObject({
      ai_value: padded,
      value: padded,
      edit_base_ai_value: null,
    });
  });

  it('stores an empty value as null (not read)', async () => {
    const res = await patch({ field: 'title', value: '   ' });
    expect(res.status).toBe(200);
    expect(row().value).toBeNull();
    expect(row().ai_value).toBe(AI_TITLE);
  });

  it('refuses a value over 500 characters with 400', async () => {
    const res = await patch({ field: 'title', value: 'x'.repeat(501) });
    expect(res.status).toBe(400);
    expect(row().value).toBe(AI_TITLE);
  });

  it('refuses an unknown field with 400', async () => {
    const res = await patch({ field: 'ai_value', value: 'x' });
    expect(res.status).toBe(400);
  });

  it('refuses a body that is both an edit and a revert, or not JSON', async () => {
    expect(
      (await patch({ field: 'title', value: 'x', revert: true })).status,
    ).toBe(400);
    expect((await patch(null, { raw: '{not json' })).status).toBe(400);
  });

  it('refuses text/plain with 415 (no-preflight form POST)', async () => {
    for (const contentType of [
      'text/plain',
      'application/x-www-form-urlencoded',
    ]) {
      const res = await patch({ field: 'title', value: 'x' }, { contentType });
      expect(res.status, contentType).toBe(415);
    }
    expect(row().value).toBe(AI_TITLE);
  });

  it('returns 404 for a missing spine', async () => {
    const res = await patch({ field: 'title', value: 'x' }, { id: 'nope' });
    expect(res.status).toBe(404);
  });

  it('returns 409 for a dismissed or superseded spine', async () => {
    for (const state of ['dismissed', 'superseded']) {
      getDb()
        .$client.prepare('UPDATE spines SET state = ? WHERE id = ?')
        .run(state, SPINE);
      const res = await patch({ field: 'title', value: 'x' });
      expect(res.status, state).toBe(409);
      const rev = await patch({ field: 'title', revert: true });
      expect(rev.status, state).toBe(409);
    }
    expect(row().value).toBe(AI_TITLE);
  });

  it('still edits an orphaned spine (UI-SPEC: fields stay editable)', async () => {
    getDb()
      .$client.prepare("UPDATE spines SET state = 'orphaned' WHERE id = ?")
      .run(SPINE);
    const res = await patch({ field: 'title', value: 'Kept' });
    expect(res.status).toBe(200);
    expect(row().value).toBe('Kept');
  });
});
