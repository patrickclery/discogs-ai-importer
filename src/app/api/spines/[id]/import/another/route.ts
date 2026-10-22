import { connection } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { getDiscogsAuth } from '@/server/discogs/auth';
import { discogsReady } from '@/server/discogs/enqueue';
import { addAnotherCopy } from '@/server/imports/store';

// Add another copy (D-05, the remote decision; T-04-31): the owner owns two,
// so the held import is re-enqueued with allow_duplicate on the same row and
// its next attempt adds instead of holding. It writes to Discogs, so it needs
// a working sign-in. JSON only (forces a CORS preflight) with an empty
// strict body; the proxy adds the same-origin check.

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
  const db = getDb().$client;
  const spine = db.prepare('SELECT 1 FROM spines WHERE id = @id').get({ id });
  if (!spine) return fail(404, 'not_found', 'This spine no longer exists.');
  if (!discogsReady()) {
    // A stored sign-in that Discogs refused needs a reconnect.
    let signedIn = false;
    try {
      signedIn = getDiscogsAuth() !== null;
    } catch {
      signedIn = false;
    }
    return fail(
      409,
      'not_connected',
      signedIn
        ? 'Reconnect Discogs in Settings first'
        : 'Connect Discogs in Settings first',
    );
  }
  const result = addAnotherCopy(db, id);
  switch (result.status) {
    case 'not_found':
      return fail(404, 'not_found', 'This spine has no import to add.');
    case 'not_held':
      return fail(
        409,
        'not_held',
        'This spine is not waiting on that choice any more.',
      );
    default:
      return Response.json({ importId: result.importId }, { status: 201 });
  }
}
