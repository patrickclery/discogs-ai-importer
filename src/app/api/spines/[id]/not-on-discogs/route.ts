import { connection } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { setNotOnDiscogs } from '@/server/scan/not-on-discogs';

// Mark or unmark a spine "not on Discogs" (REV-05, D-14). Reversible, so no
// confirm; only spines.not_on_discogs changes, the crop, fields, searches
// and candidates stay. A mark is refused on an imported spine (D-14) and
// while an import is open (A-04-19). T-04-35: JSON only (forces a CORS
// preflight) with a strict body; the proxy adds the same-origin check.

const Body = z.strictObject({ flag: z.boolean() });

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
  const result = setNotOnDiscogs(getDb().$client, id, parsed.data.flag);
  switch (result.status) {
    case 'not_found':
      return fail(404, 'not_found', 'This spine no longer exists.');
    case 'not_markable':
      return fail(
        409,
        'not_markable',
        "This spine is no longer in the list, so it can't be marked.",
      );
    case 'imported':
      return fail(
        409,
        'imported',
        "This spine is already in your collection, so it can't be marked.",
      );
    case 'import_open':
      return fail(
        409,
        'import_open',
        'This spine has a match being added. Change the match first.',
      );
    default: {
      const body: { id: string; notOnDiscogs: boolean } = {
        id,
        notOnDiscogs: result.notOnDiscogs,
      };
      return Response.json(body);
    }
  }
}
