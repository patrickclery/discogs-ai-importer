import { connection } from 'next/server';
import { z } from 'zod';
import { clearDiscogsAuth, clearPendingConnect } from '@/server/discogs/auth';

// Disconnect Discogs (D-02). Discogs has no revoke endpoint, so this only
// forgets the sign-in on this computer: the token, its secret and the
// username, plus any connect still waiting for approval. JSON only (forces a
// CORS preflight) behind the proxy's same-origin check (T-03-10).

const Body = z.strictObject({});
const REASON_MAX = 160;

function shortReason(err: unknown): string {
  // SecretsFileError and Node system errors (EACCES, ENOSPC…) describe the
  // problem and the path, never the file content.
  const e = err as (Error & { code?: unknown }) | null;
  const safe =
    e?.name === 'SecretsFileError' || typeof e?.code === 'string'
      ? e.message
      : 'secrets.json could not be written';
  return safe.replace(/\.\s*$/, '').slice(0, REASON_MAX);
}

export async function POST(req: Request) {
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

  clearPendingConnect();
  try {
    clearDiscogsAuth();
  } catch (err) {
    return Response.json(
      { error: 'failed', message: shortReason(err) },
      { status: 500 },
    );
  }
  return Response.json({ ok: true });
}
