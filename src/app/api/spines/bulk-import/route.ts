import { connection } from 'next/server';
import { z } from 'zod';
import { BULK_START_BODY, type BulkStartResponse } from '@/lib/bulk-types';
import { eligiblePicks } from '@/server/bulk/picks';
import { latestBulkRun } from '@/server/bulk/queries';
import { openBulkItemCount, startBulkRun } from '@/server/bulk/store';
import { getDb } from '@/server/db/client';
import { getDiscogsAuth } from '@/server/discogs/auth';
import { discogsReady } from '@/server/discogs/enqueue';
import { getCollectionFolderId } from '@/server/discogs/folders';
import { getPreferredCountry } from '@/server/settings';

// Start a bulk import (D-07, D-08, BULK-05): the owner's picks, as spine and
// candidate ids only (never a release id or a country, T-06-17), are
// re-checked on the server and become one run whose resolve_pressing jobs
// are paced on the Discogs lane. The route itself never calls Discogs
// (Phase 4 rule: all work is queued). One run at a time: while any lookup
// is still waiting, or the latest run's adds are still going, the answer is
// 409 bulk_running (T-06-16). The rule is latestBulkRun's busy flag, the
// same one the Import button reads (WR-03). The check,
// the pick validation and the run are one IMMEDIATE transaction.
// T-06-15: the app binds loopback only, src/proxy.ts refuses a foreign
// Origin on non-GET, and the JSON-only body forces a CORS preflight.

function fail(status: number, error: string, message: string): Response {
  return Response.json({ error, message }, { status });
}

/** JSON only (415 otherwise), parsed against a strict schema (400). */
async function readBody<T>(
  req: Request,
  schema: z.ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  const contentType = req.headers.get('content-type') ?? '';
  if (!/^application\/json\s*(;|$)/i.test(contentType)) {
    return {
      ok: false,
      response: fail(415, 'unsupported_type', 'Send application/json.'),
    };
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: fail(400, 'invalid_body', 'The request body is not JSON.'),
    };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: fail(400, 'invalid_body', z.prettifyError(parsed.error)),
    };
  }
  return { ok: true, data: parsed.data };
}

const BUSY = () =>
  fail(409, 'bulk_running', 'Wait for the current bulk import to finish');

type StartOutcome =
  | { status: 'busy' }
  | { status: 'nothing' }
  | { status: 'ok'; body: BulkStartResponse };

export async function POST(req: Request) {
  await connection();
  const parsed = await readBody(req, BULK_START_BODY);
  if (!parsed.ok) return parsed.response;
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
  const db = getDb().$client;
  const tx = db.transaction((): StartOutcome => {
    if (openBulkItemCount(db) > 0 || latestBulkRun(db)?.busy) {
      return { status: 'busy' };
    }
    const picks = eligiblePicks(db, parsed.data.items);
    if (picks.accepted.length === 0) return { status: 'nothing' };
    const run = startBulkRun(db, {
      items: picks.accepted,
      country: getPreferredCountry(),
      folderId: getCollectionFolderId(),
    });
    if (run.status === 'busy') return { status: 'busy' };
    return {
      status: 'ok',
      body: {
        runId: run.runId,
        started: run.started,
        skipped: picks.skipped + run.skipped,
      },
    };
  });
  const outcome = tx.immediate();
  switch (outcome.status) {
    case 'busy':
      return BUSY();
    case 'nothing':
      return fail(
        409,
        'nothing_to_import',
        'None of the picked spines can be imported now',
      );
    default:
      return Response.json(outcome.body, { status: 201 });
  }
}
