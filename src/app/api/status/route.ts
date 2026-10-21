import { connection } from 'next/server';
import type { StatusResponse } from '@/lib/status-types';
import { getDb } from '@/server/db/client';
import { discogsStatus } from '@/server/discogs/status';
import { readLease } from '@/server/jobs/lease';
import { countsByLaneStatus } from '@/server/jobs/queue';
import { getWorkerInfo } from '@/server/jobs/worker';

export async function GET() {
  await connection();
  const body: StatusResponse = {
    worker: getWorkerInfo(),
    jobs: countsByLaneStatus(),
    lease: readLease(),
    discogs: discogsStatus(getDb().$client),
  };
  return Response.json(body);
}
