import { connection } from 'next/server';
import { z } from 'zod';
import {
  clearAuthInvalid,
  getDiscogsAuth,
  isAuthInvalid,
} from '@/server/discogs/auth';
import { discogsFetch } from '@/server/discogs/client';
import { enqueueMissingSearches } from '@/server/discogs/enqueue';
import { discogsGate } from '@/server/discogs/gate';

// Test connection (D-01; fulfils Phase 1 D-10). One signed GET
// /oauth/identity through the pacing gate with the stored sign-in. Results
// are always 200 JSON carrying ok, kind, the username or a short reason only
// (T-03-11): never a token, a secret or Discogs' response body. JSON only
// (forces a CORS preflight) behind the proxy's same-origin check (T-03-10).

const Body = z.strictObject({});
const Identity = z.object({ username: z.string().min(1) });
const REASON_MAX = 160;

export type TestDiscogsResult =
  | { ok: true; username: string }
  | { ok: false; kind: 'rejected' | 'unreachable' | 'busy' }
  | { ok: false; kind: 'other'; reason: string };

function shortReason(err: unknown): string {
  const name = (err as Error | null)?.name ?? '';
  // Only our own error classes have messages known to be secret-free.
  const safe =
    name.startsWith('Discogs') || name === 'SecretsFileError'
      ? (err as Error).message
      : 'the connection test failed';
  return safe.replace(/\.\s*$/, '').slice(0, REASON_MAX);
}

function result(body: TestDiscogsResult): Response {
  return Response.json(body);
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
    if (!getDiscogsAuth()) {
      return Response.json({ error: 'not_connected' }, { status: 409 });
    }
    // While Discogs has paused the app, a test would only wait in line.
    if (discogsGate().pausedUntil() !== null) {
      return result({ ok: false, kind: 'busy' });
    }
    const res = await discogsFetch({ path: '/oauth/identity', auth: 'oauth' });
    const identity = Identity.safeParse(res.json);
    if (!identity.success) {
      return result({
        ok: false,
        kind: 'other',
        reason: 'Discogs answered without a username',
      });
    }
    // The stored sign-in works again, so drop any Reconnect needed state
    // and queue the spines it left auth_failed, as a connect does (WR-04).
    if (isAuthInvalid()) {
      clearAuthInvalid();
      try {
        enqueueMissingSearches({ includeAuthFailed: true });
      } catch (err) {
        console.error('[discogs] test backfill failed:', err);
      }
    }
    return result({ ok: true, username: identity.data.username });
  } catch (err) {
    const name = (err as Error | null)?.name;
    // DiscogsAuthError: the client already marked the sign-in invalid.
    if (name === 'DiscogsAuthError') {
      return result({ ok: false, kind: 'rejected' });
    }
    if (name === 'DiscogsUnavailableError') {
      return result({ ok: false, kind: 'unreachable' });
    }
    if (name === 'DiscogsRateLimitedError') {
      return result({ ok: false, kind: 'busy' });
    }
    return result({ ok: false, kind: 'other', reason: shortReason(err) });
  }
}
