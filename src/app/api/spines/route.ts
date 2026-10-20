import { connection } from 'next/server';
import type { SpinesResponse } from '@/lib/scan-types';
import { getSpines } from '@/server/scan/queries';

// Read-only list for the polled /spines view (REV-01). `?photo={id}` narrows
// it to one photo; an unknown id returns no photos. Loopback-only, single
// user (T-02-21).

export async function GET(request: Request) {
  await connection();
  const photoId = new URL(request.url).searchParams.get('photo') || undefined;
  const body: SpinesResponse = getSpines({ photoId });
  return Response.json(body);
}
