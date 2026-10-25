import { connection } from 'next/server';
import { parseStatusParam } from '@/lib/review-status';
import type { SpinesResponse } from '@/lib/scan-types';
import {
  getSpines,
  parseFallbackParam,
  parseReviewParam,
} from '@/server/scan/queries';

// Read-only list for the polled /spines view (REV-01). `?photo={id}` narrows
// it to one photo; an unknown id returns no photos. `?review=1` (exactly 1,
// T-02-28) lists only the spines that need review. `?status=` (one of the
// six review statuses exactly, T-04-19; anything else is All) lists only
// spines with that status; it ANDs with review. `?fallback=1` (exactly 1,
// T-06-12) lists only spines bulk-imported from another country than the
// preferred one; it ANDs with the others. Loopback-only, single user
// (T-02-21).

export async function GET(request: Request) {
  await connection();
  const params = new URL(request.url).searchParams;
  const photoId = params.get('photo') || undefined;
  const review = parseReviewParam(params.get('review'));
  const status = parseStatusParam(params.get('status'));
  const fallback = parseFallbackParam(params.get('fallback'));
  const body: SpinesResponse = getSpines({ photoId, review, status, fallback });
  return Response.json(body);
}
