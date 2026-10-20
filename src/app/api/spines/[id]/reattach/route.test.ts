import { describe, expect, it, vi } from 'vitest';
import {
  orphanScenario,
  spineRow,
} from '../../../../../../test/helpers/scan-runs';
import { useTempDataDir } from '../../../../../../test/helpers/temp-data-dir';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

import { POST as DISMISS } from '../dismiss/route';
import { GET, POST } from './route';

// D-16 orphan routes (T-02-25..T-02-27): JSON only (415), 404 for an unknown
// spine, 409 for a refused re-attach or dismiss, 200 on success.

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function post(
  path: string,
  body: unknown,
  contentType = 'application/json',
): Request {
  return new Request(`http://127.0.0.1:3000${path}`, {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: JSON.stringify(body),
  });
}

function reattach(id: string, body: unknown, contentType?: string) {
  return POST(post(`/api/spines/${id}/reattach`, body, contentType), ctx(id));
}

function dismiss(id: string, contentType?: string) {
  return DISMISS(post(`/api/spines/${id}/dismiss`, {}, contentType), ctx(id));
}

describe('GET /api/spines/{id}/reattach', () => {
  useTempDataDir();

  it('200 with the candidates of an orphan', async () => {
    const { orphanId, vId } = await orphanScenario();
    const res = await GET(
      new Request('http://127.0.0.1:3000/x'),
      ctx(orphanId),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { candidates: { id: string }[] };
    expect(body.candidates.map((c) => c.id)).toEqual([vId]);
  });

  it('404 for an unknown spine', async () => {
    const res = await GET(new Request('http://127.0.0.1:3000/x'), ctx('nope'));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/spines/{id}/reattach', () => {
  useTempDataDir();

  it('415 for text/plain, and nothing changes', async () => {
    const { orphanId, vId } = await orphanScenario();
    const res = await reattach(orphanId, { targetSpineId: vId }, 'text/plain');
    expect(res.status).toBe(415);
    expect(spineRow(orphanId).state).toBe('orphaned');
  });

  it('400 for a body without targetSpineId', async () => {
    const { orphanId } = await orphanScenario();
    expect((await reattach(orphanId, {})).status).toBe(400);
  });

  it('404 for an unknown orphan', async () => {
    const { vId } = await orphanScenario();
    const res = await reattach('no-such-spine', { targetSpineId: vId });
    expect(res.status).toBe(404);
  });

  it('409 conflict for a target that is not a candidate', async () => {
    const { orphanId, spineIds } = await orphanScenario();
    const res = await reattach(orphanId, { targetSpineId: spineIds[0] });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'conflict' });
  });

  it('200 with the re-attached spine, then 409 on a repeat', async () => {
    const { orphanId, vId } = await orphanScenario();
    const res = await reattach(orphanId, { targetSpineId: vId });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: orphanId, state: 'active' });
    expect(spineRow(vId).state).toBe('superseded');
    expect((await reattach(orphanId, { targetSpineId: vId })).status).toBe(409);
  });
});

describe('POST /api/spines/{id}/dismiss', () => {
  useTempDataDir();

  it('415 for text/plain, and nothing changes', async () => {
    const { orphanId } = await orphanScenario();
    expect((await dismiss(orphanId, 'text/plain')).status).toBe(415);
    expect(spineRow(orphanId).state).toBe('orphaned');
  });

  it('404 for an unknown spine', async () => {
    expect((await dismiss('no-such-spine')).status).toBe(404);
  });

  it('409 for an active spine', async () => {
    const { spineIds } = await orphanScenario();
    const res = await dismiss(spineIds[0]);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'conflict' });
  });

  it('200 for an orphan, then 409 on a repeat', async () => {
    const { orphanId } = await orphanScenario();
    const res = await dismiss(orphanId);
    expect(res.status).toBe(200);
    expect(spineRow(orphanId).state).toBe('dismissed');
    expect((await dismiss(orphanId)).status).toBe(409);
  });
});
