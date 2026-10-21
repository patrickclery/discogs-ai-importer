import { connection } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { discogsReady, enqueueExplicitSearch } from '@/server/discogs/enqueue';

// Start an explicit Discogs search for one spine (DISC-05, D-14, D-06).
// mode 'again' is Search again and Retry search: a new search from the
// spine's current fields with a per-search dedupe key (RESEARCH Pitfall 1).
// Plan 03-11 turns Body into a discriminated union with text and ref modes.
// T-03-29: JSON only (forces a CORS preflight) with a strict body; the proxy
// adds the same-origin check. T-03-30: 409 busy while a search of the spine
// is queued or running, so repeated clicks never stack searches.

const Body = z.strictObject({ mode: z.literal('again') });

const NOT_FOUND = {
  error: 'not_found',
  message: 'This spine no longer exists.',
};

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
  const spine = db
    .prepare('SELECT state FROM spines WHERE id = @id')
    .get({ id }) as { state: string } | undefined;
  if (!spine) return Response.json(NOT_FOUND, { status: 404 });
  if (spine.state !== 'active' && spine.state !== 'orphaned') {
    return notSearchable();
  }
  if (!discogsReady()) {
    return Response.json(
      { error: 'not_connected', message: 'Connect Discogs in Settings first' },
      { status: 409 },
    );
  }
  const result = enqueueExplicitSearch(db, { spineId: id, kind: 'again' });
  switch (result.status) {
    case 'not_found':
      return Response.json(NOT_FOUND, { status: 404 });
    case 'not_searchable':
      return notSearchable();
    case 'busy':
      return Response.json(
        {
          error: 'busy',
          message: 'A search for this spine is already waiting or running',
        },
        { status: 409 },
      );
    default: {
      const body: { searchId: string } = { searchId: result.searchId };
      return Response.json(body, { status: 201 });
    }
  }
}

function notSearchable(): Response {
  return Response.json(
    {
      error: 'not_searchable',
      message: 'This spine can no longer be searched.',
    },
    { status: 409 },
  );
}
