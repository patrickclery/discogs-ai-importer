import { connection } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { getDiscogsAuth } from '@/server/discogs/auth';
import { discogsReady } from '@/server/discogs/enqueue';
import { createImport } from '@/server/imports/store';

// Confirm one candidate of one spine (IMP-01, D-01, D-08): the only path that
// adds anything to the owner's Discogs collection. The body names a
// candidate, never a release: the server reads the release id from that
// spine's own candidate row (T-04-02). The import is written and its
// add_to_collection job queued in one IMMEDIATE transaction, so a double
// click or two tabs make one import and the second answers 409 (T-04-05).
// T-04-01: JSON only (forces a CORS preflight) with a strict body; the proxy
// adds the same-origin check.

const Body = z.strictObject({
  candidateId: z.string().min(1).max(40),
});

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
  const result = createImport(getDb().$client, {
    spineId: id,
    candidateId: parsed.data.candidateId,
  });
  switch (result.status) {
    case 'not_found':
      return fail(404, 'not_found', 'This spine no longer exists.');
    case 'no_candidate':
      return fail(
        404,
        'no_candidate',
        'That match is no longer listed for this spine.',
      );
    case 'not_importable':
      return fail(
        409,
        'not_importable',
        'This spine can no longer be imported.',
      );
    case 'not_on_discogs':
      return fail(
        409,
        'not_on_discogs',
        'This spine is marked not on Discogs. Unmark it first.',
      );
    case 'already_confirmed':
      return fail(
        409,
        'already_confirmed',
        'This spine already has a match being added. It will show here in a moment.',
      );
    default: {
      const body: { importId: string } = { importId: result.importId };
      return Response.json(body, { status: 201 });
    }
  }
}
