import { connection } from 'next/server';
import { z } from 'zod';
import { getDiscogsAuth } from '@/server/discogs/auth';
import {
  type FolderState,
  folderState,
  refreshFolders,
} from '@/server/discogs/folders';
import { discogsGate } from '@/server/discogs/gate';

// Settings "Collection folder" (D-03, IMP-02; RESEARCH Pattern 6, Open
// Question 1). GET answers the cached folder state from the settings table
// and never calls Discogs. POST { refresh: true } runs one signed GET of the
// owner's folders through the shared pacing gate, inline, like Test
// connection (A-04-13). Results carry the folder state, a kind or a short
// reason only, never Discogs' response body (T-04-25). JSON only (forces a
// CORS preflight) behind the proxy's same-origin check (T-04-26).

const Body = z.strictObject({ refresh: z.literal(true) });
const REASON_MAX = 160;

export type FoldersGetResult = FolderState & { connected: boolean };

export type FoldersRefreshResult =
  | ({ ok: true } & FolderState)
  | { ok: false; kind: 'rejected' | 'unreachable' | 'busy' }
  | { ok: false; kind: 'other'; reason: string };

function shortReason(err: unknown): string {
  const name = (err as Error | null)?.name ?? '';
  // Only our own error classes have messages known to be secret-free; the
  // client already writes the username in a path as :u.
  const safe =
    name.startsWith('Discogs') || name === 'SecretsFileError'
      ? (err as Error).message
      : 'the folder list could not be read';
  return safe.replace(/\.\s*$/, '').slice(0, REASON_MAX);
}

function result(body: FoldersRefreshResult): Response {
  return Response.json(body);
}

export async function GET() {
  await connection();
  let connected = false;
  try {
    connected = getDiscogsAuth() !== null;
  } catch {
    // An unreadable secrets file reads as not connected.
  }
  return Response.json({
    ...folderState(),
    connected,
  } satisfies FoldersGetResult);
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
    // While Discogs has paused the app, a read would only wait in line.
    if (discogsGate().pausedUntil() !== null) {
      return result({ ok: false, kind: 'busy' });
    }
    await refreshFolders();
    return result({ ok: true, ...folderState() });
  } catch (err) {
    const name = (err as Error | null)?.name;
    const status = (err as { status?: unknown } | null)?.status;
    if (
      name === 'DiscogsAuthError' ||
      (name === 'DiscogsRequestError' && status === 403)
    ) {
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
