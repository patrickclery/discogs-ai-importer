import { connection } from 'next/server';
import { z } from 'zod';
import type { CandidateDto, CandidatesResponse } from '@/lib/discogs-types';
import { getDb } from '@/server/db/client';
import { listCandidates } from '@/server/discogs/queries';
import { addManualCandidate } from '@/server/discogs/store';

// GET: every stored Discogs candidate of one spine in D-10 order, for the
// card's "Show all {n}" (D-12). POST: pin the release the owner picked in
// the Search Discogs dialog as a manual candidate (D-15, D-16).
// T-03-41: the id is only a named parameter; an unknown, superseded or
// dismissed spine answers 404. T-03-31: the POST body is { searchId,
// releaseId } only (JSON, strict); the candidate is copied from that
// spine's own done manual or release search, never from the request.

const NOT_FOUND = {
  error: 'not_found',
  message: 'This spine no longer exists.',
};

const LISTED_SQL = `SELECT 1 FROM spines
  WHERE id = @id AND state IN ('active', 'orphaned')`;

const Body = z.strictObject({
  searchId: z.string().min(1).max(100),
  releaseId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await params;
  const db = getDb().$client;
  if (!db.prepare(LISTED_SQL).get({ id })) {
    return Response.json(NOT_FOUND, { status: 404 });
  }
  const body: CandidatesResponse = { candidates: listCandidates(db, id) };
  return Response.json(body);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  const contentType = req.headers.get('content-type') ?? '';
  if (!/^application\/json\s*(;|$)/i.test(contentType)) {
    return Response.json(
      { error: 'unsupported_type', message: 'Send application/json.' },
      { status: 415 },
    );
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json(
      { error: 'invalid_body', message: 'The request body is not JSON.' },
      { status: 400 },
    );
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_body', message: z.prettifyError(parsed.error) },
      { status: 400 },
    );
  }
  const { id } = await params;
  const db = getDb().$client;
  if (!db.prepare(LISTED_SQL).get({ id })) {
    return Response.json(NOT_FOUND, { status: 404 });
  }
  const result = addManualCandidate(db, {
    spineId: id,
    searchId: parsed.data.searchId,
    releaseId: parsed.data.releaseId,
  });
  switch (result.status) {
    case 'search_not_found':
      return Response.json(
        {
          error: 'search_not_found',
          message: 'That search is not a Search Discogs search of this spine.',
        },
        { status: 404 },
      );
    case 'release_not_found':
      return Response.json(
        {
          error: 'release_not_found',
          message: "That release isn't among the search's results.",
        },
        { status: 404 },
      );
    case 'not_done':
      return Response.json(
        {
          error: 'not_done',
          message: "The search hasn't finished with results yet.",
        },
        { status: 409 },
      );
    default: {
      const candidate = listCandidates(db, id).find(
        (c) => c.id === result.candidateId,
      );
      if (!candidate) return Response.json(NOT_FOUND, { status: 404 });
      const body: { candidate: CandidateDto } = { candidate };
      return Response.json(body, { status: 201 });
    }
  }
}
