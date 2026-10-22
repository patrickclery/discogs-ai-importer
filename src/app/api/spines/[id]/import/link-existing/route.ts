import { connection } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { linkExisting } from '@/server/imports/store';

// Link existing copy (D-05, T-04-30): the held import records the first copy
// Discogs listed that no other spine holds and the spine reads imported. It
// writes nothing to Discogs, so no sign-in is needed (A-04-18). T-04-31:
// JSON only (forces a CORS preflight) with an empty strict body; the proxy
// adds the same-origin check.

const Body = z.strictObject({});

function fail(status: number, error: string, message: string): Response {
  return Response.json({ error, message }, { status });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  const contentType = req.headers.get('content-type') ?? '';
  if (!/^application\/json\s*(;|$)/i.test(contentType)) {
    return fail(415, 'unsupported_type', 'Send application/json.');
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, 'invalid_body', 'The request body is not JSON.');
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return fail(400, 'invalid_body', z.prettifyError(parsed.error));
  }
  const { id } = await params;
  const result = linkExisting(getDb().$client, id);
  switch (result.status) {
    case 'not_found':
      return fail(404, 'not_found', 'This spine has no import to link.');
    case 'not_held':
      return fail(
        409,
        'not_held',
        'This spine is not waiting on that choice any more.',
      );
    case 'no_existing':
      return fail(
        409,
        'no_existing',
        'That copy is already linked to another spine.',
      );
    default:
      return Response.json(
        { importId: result.importId, instanceId: result.instanceId },
        { status: 200 },
      );
  }
}
