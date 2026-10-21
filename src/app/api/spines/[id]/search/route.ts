import { connection } from 'next/server';
import { z } from 'zod';
import { MASTER_REFUSAL, parseDiscogsRef } from '@/lib/discogs-ref';
import { DIALOG_INPUT_MAX } from '@/lib/discogs-types';
import { getDb } from '@/server/db/client';
import { getDiscogsAuth } from '@/server/discogs/auth';
import {
  discogsReady,
  type ExplicitSearchInput,
  enqueueExplicitSearch,
} from '@/server/discogs/enqueue';

// Start an explicit Discogs search for one spine (DISC-05, DISC-06, D-14,
// D-15, D-06). mode 'again' is Search again and Retry search: a new search
// from the spine's current fields with a per-search dedupe key (RESEARCH
// Pitfall 1). Modes 'text' and 'ref' come from the Search Discogs dialog:
// the server re-runs parseDiscogsRef and its answer is authoritative
// (T-03-33). A master is refused with 400 before any request (Pitfall 5);
// text that reads as a release becomes a release search; ref text that is
// no release reference is a 400. Dialog searches work for active and
// orphaned spines of any media kind and are not blocked by a queued
// automatic search.
// T-03-29 / T-03-35: JSON only (forces a CORS preflight) with a strict,
// discriminated body capped at 500 characters; the proxy adds the
// same-origin check. T-03-30: 409 busy while an automatic or again search
// of the spine is queued or running, so repeated clicks never stack.

const Value = z.string().max(DIALOG_INPUT_MAX);

const Body = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('again') }),
  z.strictObject({ mode: z.literal('text'), value: Value }),
  z.strictObject({ mode: z.literal('ref'), value: Value }),
]);
type Body = z.infer<typeof Body>;

/** The enqueue input for a body, or the 400 answer that refuses it. */
function explicitInput(
  spineId: string,
  body: Body,
): ExplicitSearchInput | Response {
  if (body.mode === 'again') return { spineId, kind: 'again' };
  const value = body.value.trim();
  if (!value) {
    return Response.json(
      { error: 'invalid_body', message: 'Type something to search for.' },
      { status: 400 },
    );
  }
  const ref = parseDiscogsRef(value);
  switch (ref.kind) {
    case 'master':
      return Response.json(
        { error: 'master', message: MASTER_REFUSAL },
        { status: 400 },
      );
    case 'release':
      return {
        spineId,
        kind: 'release',
        releaseId: ref.id,
        queryText: value,
      };
    default:
      if (body.mode === 'ref') {
        return Response.json(
          {
            error: 'invalid_ref',
            message: 'That is not a Discogs release link or number.',
          },
          { status: 400 },
        );
      }
      return { spineId, kind: 'manual', queryText: ref.q };
  }
}

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
  const input = explicitInput(id, parsed.data);
  if (input instanceof Response) return input;
  const db = getDb().$client;
  const spine = db
    .prepare('SELECT state FROM spines WHERE id = @id')
    .get({ id }) as { state: string } | undefined;
  if (!spine) return Response.json(NOT_FOUND, { status: 404 });
  if (spine.state !== 'active' && spine.state !== 'orphaned') {
    return notSearchable();
  }
  if (!discogsReady()) {
    // WR-05: a stored sign-in that Discogs refused needs a reconnect.
    let signedIn = false;
    try {
      signedIn = getDiscogsAuth() !== null;
    } catch {
      signedIn = false;
    }
    return Response.json(
      {
        error: 'not_connected',
        message: signedIn
          ? 'Reconnect Discogs in Settings first'
          : 'Connect Discogs in Settings first',
      },
      { status: 409 },
    );
  }
  const result = enqueueExplicitSearch(db, input);
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
