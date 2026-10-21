import { connection } from 'next/server';
import type { CandidatesResponse } from '@/lib/discogs-types';
import { getDb } from '@/server/db/client';
import { listCandidates } from '@/server/discogs/queries';

// Every stored Discogs candidate of one spine in D-10 order, for the card's
// "Show all {n}" (D-12). T-03-41: the id is only a named parameter; an
// unknown, superseded or dismissed spine answers 404.

const NOT_FOUND = {
  error: 'not_found',
  message: 'This spine no longer exists.',
};

const LISTED_SQL = `SELECT 1 FROM spines
  WHERE id = @id AND state IN ('active', 'orphaned')`;

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
