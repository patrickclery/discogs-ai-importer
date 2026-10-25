import { connection } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { getDiscogsAuth } from '@/server/discogs/auth';
import { discogsReady } from '@/server/discogs/enqueue';
import { retrySpine } from '@/server/imports/store';

// Retry one spine (REV-04, D-13): a failed pressing lookup of the spine's
// current bulk item runs again (BULK-11); else a failed import goes back in
// line on the same row, which reconciles before any POST (D-07); otherwise a
// failed search runs again with the current fields. Never a re-upload or
// re-scan, never a second job (the import and pressing dedupe keys,
// T-04-18). T-04-16: JSON only (forces a CORS preflight) with an empty
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
  const result = retrySpine(db, id);
  switch (result.status) {
    case 'not_found':
      return fail(404, 'not_found', 'This spine no longer exists.');
    case 'nothing_to_retry':
      return fail(409, 'nothing_to_retry', 'Nothing failed on this spine.');
    case 'busy':
      return fail(409, 'busy', "It's already waiting or running.");
    default:
      return Response.json(
        result.kind === 'import'
          ? { kind: 'import', importId: result.importId }
          : result.kind === 'lookup'
            ? { kind: 'lookup', itemId: result.itemId }
            : { kind: 'search', searchId: result.searchId },
        { status: 201 },
      );
  }
}
