import { connection } from 'next/server';
import { z } from 'zod';
import { startConnect } from '@/server/discogs/connect';
import { discogsGate } from '@/server/discogs/gate';
import { getSecret } from '@/server/secrets';

// Starts connecting Discogs (D-01, DISC-01): gets a request token and answers
// the discogs.com authorize URL for the browser to open. T-03-02: JSON only
// (forces a CORS preflight) behind the proxy's same-origin check. No body
// here ever carries a token, a secret or the verifier (D-02).

const Body = z.strictObject({});
const REASON_MAX = 160;

function shortReason(err: unknown): string {
  const name = (err as Error | null)?.name ?? '';
  // Only our own error classes have messages known to be secret-free.
  const safe =
    name.startsWith('Discogs') || name === 'SecretsFileError'
      ? (err as Error).message
      : 'Could not start connecting to Discogs.';
  return safe.slice(0, REASON_MAX);
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

  try {
    if (
      !getSecret('discogsConsumerKey') ||
      !getSecret('discogsConsumerSecret')
    ) {
      return Response.json({ error: 'credentials_missing' }, { status: 409 });
    }
    if (discogsGate().pausedUntil() !== null) {
      return Response.json({ error: 'busy' }, { status: 503 });
    }
    const { authorizeUrl } = await startConnect(req.headers.get('host'));
    return Response.json({ authorizeUrl });
  } catch (err) {
    const name = (err as Error | null)?.name;
    if (name === 'DiscogsAuthError') {
      return Response.json({ error: 'bad_credentials' }, { status: 401 });
    }
    if (name === 'DiscogsUnavailableError') {
      return Response.json({ error: 'unreachable' }, { status: 502 });
    }
    return Response.json(
      { error: 'failed', message: shortReason(err) },
      { status: 502 },
    );
  }
}
