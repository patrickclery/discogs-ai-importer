import { connection } from 'next/server';
import type { StatusResponse } from '@/lib/status-types';
import { countsByLaneStatus } from '@/server/jobs/queue';
import { getWorkerInfo } from '@/server/jobs/worker';

export async function GET() {
  await connection();
  const body: StatusResponse = {
    worker: getWorkerInfo(),
    jobs: countsByLaneStatus(),
  };
  return Response.json(body);
}
