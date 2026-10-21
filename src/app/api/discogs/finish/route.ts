import { connection } from 'next/server';
import { z } from 'zod';
import {
  noteRejectedCode,
  peekPendingConnect,
  readPendingConnect,
  takePendingConnect,
} from '@/server/discogs/auth';
import { completeConnect } from '@/server/discogs/connect';
import { discogsGate } from '@/server/discogs/gate';

// Finishes a connect with the code discogs.com showed instead of coming back
// (RESEARCH A1 fallback, D-01). It runs the same exchange as the callback
// against the one pending connect. T-03-38: JSON only (forces a CORS
// preflight) behind the proxy's same-origin check, a strict body with a
// 200-character cap, and the pending connect is dropped after 5 rejected
// codes. No body here ever echoes the code, a token or a secret (D-02).

const Body = z.strictObject({ code: z.string().max(200) });

export type FinishResult =
  | { username: string }
  | {
      error: 'empty' | 'expired' | 'rejected' | 'busy' | 'failed';
      message?: string;
    };

/** Plain-language reasons only: error messages can name request paths. */
function failedReason(err: unknown): string {
  const name = (err as Error | null)?.name;
  if (name === 'DiscogsUnavailableError') return "Couldn't reach Discogs";
  if (name === 'DiscogsRateLimitedError') {
    return "Discogs is busy with the app's lookups";
  }
  if (name === 'SecretsFileError') return "secrets.json couldn't be written";
  return "Discogs sent an answer the app didn't expect";
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
    // Fixed text: the parse error must not echo what was pasted.
    return Response.json(
      { error: 'invalid_body', message: 'The request body is not valid.' },
      { status: 400 },
    );
  }

  const code = parsed.data.code.trim();
  if (!code) return Response.json({ error: 'empty' }, { status: 400 });

  const peek = peekPendingConnect();
  const pending = peek ? readPendingConnect(peek.oauthToken) : null;
  if (!peek || !pending) {
    return Response.json({ error: 'expired' }, { status: 410 });
  }
  if (discogsGate().pausedUntil() !== null) {
    return Response.json(
      { error: 'busy', message: "Discogs is busy with the app's lookups" },
      { status: 503 },
    );
  }

  try {
    const { username } = await completeConnect({
      oauthToken: peek.oauthToken,
      verifier: code,
      pending,
      via: 'code',
    });
    takePendingConnect(peek.oauthToken);
    return Response.json({ username });
  } catch (err) {
    // Compare by name: HMR can leave two copies of the class alive.
    if ((err as Error | null)?.name === 'DiscogsAuthError') {
      noteRejectedCode(peek.oauthToken);
      return Response.json({ error: 'rejected' }, { status: 401 });
    }
    return Response.json(
      { error: 'failed', message: failedReason(err) },
      { status: 502 },
    );
  }
}
