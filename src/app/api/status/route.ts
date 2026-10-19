import { connection } from 'next/server';
import type { StatusResponse } from '@/lib/status-types';
import { readLease } from '@/server/jobs/lease';
import { countsByLaneStatus } from '@/server/jobs/queue';
import { getWorkerInfo } from '@/server/jobs/worker';

export async function GET() {
  await connection();
  const body: StatusResponse = {
    worker: getWorkerInfo(),
    jobs: countsByLaneStatus(),
    lease: readLease(),
  };
  return Response.json(body);
}
