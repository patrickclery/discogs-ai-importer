import { connection } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { discogsReady } from '@/server/discogs/enqueue';
import { retrySpine } from '@/server/imports/store';
import { getSpines } from '@/server/scan/queries';

// Retry all failed (REV-04, D-13, A-04-21): one bulk request for the photo
// filter in view, looping over the per-spine Retry rule in /spines order
// (newest photo first, detection order, then orphaned), so each spine's job
// is claimed in that order. A failed import goes back in line on its own
// row (it reconciles first, D-07); otherwise a failed search runs again
// with the current fields. Never a re-upload or re-scan, never a second job
// (dedupe keys, T-04-38), and never an import the owner did not confirm:
// only existing imports rows are retried (T-04-37). While Discogs is not
// connected nothing is enqueued and every failed spine counts as skipped.
// T-04-40: JSON only (forces a CORS preflight) with a strict body; the
// proxy adds the same-origin check.

const Body = z.strictObject({
  photoId: z.string().min(1).max(40).optional(),
});

function fail(status: number, error: string, message: string): Response {
  return Response.json({ error, message }, { status });
}

export async function POST(req: Request) {
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
  const failed = getSpines({
    photoId: parsed.data.photoId,
    status: 'failed',
  }).spines;
  if (!discogsReady()) {
    return Response.json({ retried: 0, skipped: failed.length });
  }
  const db = getDb().$client;
  let retried = 0;
  for (const spine of failed) {
    // A waiting or running import is already in line and is left as it
    // is. Such a spine no longer reads failed for an older failed search
    // (WR-06); this guard stays as the bulk rule's own fence.
    const phase = spine.import?.phase;
    if (phase === 'waiting' || phase === 'importing') continue;
    if (retrySpine(db, spine.id).status === 'ok') retried += 1;
  }
  return Response.json({ retried, skipped: 0 });
}
