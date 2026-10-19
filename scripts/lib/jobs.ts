// Job/status helpers over the dev hooks (GET/POST /api/dev/jobs, GET /api/status).
// Node built-ins only; imports nothing from src/.
import { httpRequest, waitFor } from './server.ts';

export type Status = {
  worker: {
    bootId: string;
    startedAt: number;
    starts: number;
    pid: number;
  } | null;
  jobs: Record<string, Record<string, number>>;
  lease: { bootId: string; pid: number; heartbeatAt: number } | null;
};

export type DevJob = {
  id: string;
  lane: string;
  type: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  runAfter: number;
  lastError: string | null;
  payload: Record<string, unknown>;
  createdAt: number;
  finishedAt: number | null;
};

export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export function step(label: string): void {
  console.log(`-- ${label}`);
}

export function check(label: string): void {
  console.log(`ok: ${label}`);
}

export async function getStatus(port: number): Promise<Status> {
  const res = await httpRequest({ port, path: '/api/status' });
  assert(res.status === 200, `/api/status on ${port} returned ${res.status}`);
  return JSON.parse(res.body) as Status;
}

export async function postJob(
  port: number,
  payload: Record<string, unknown>,
  lane: 'anthropic' | 'discogs' = 'anthropic',
): Promise<string> {
  const res = await httpRequest({
    port,
    method: 'POST',
    path: '/api/dev/jobs',
    headers: { origin: `http://127.0.0.1:${port}` },
    body: JSON.stringify({ lane, payload }),
  });
  assert(
    res.status === 201,
    `POST /api/dev/jobs on ${port} returned ${res.status}: ${res.body}`,
  );
  return (JSON.parse(res.body) as { id: string }).id;
}

export async function listJobs(port: number): Promise<DevJob[]> {
  const res = await httpRequest({ port, path: '/api/dev/jobs' });
  assert(
    res.status === 200,
    `GET /api/dev/jobs on ${port} returned ${res.status}`,
  );
  return (JSON.parse(res.body) as { jobs: DevJob[] }).jobs;
}

export async function getJob(port: number, id: string): Promise<DevJob> {
  const job = (await listJobs(port)).find((j) => j.id === id);
  assert(job, `job ${id} missing from GET /api/dev/jobs`);
  return job;
}

export function waitJob(
  port: number,
  id: string,
  label: string,
  pred: (j: DevJob) => boolean,
  timeoutMs = 20_000,
): Promise<DevJob> {
  return waitFor(
    `${label} (${id})`,
    async () => {
      const j = await getJob(port, id);
      return pred(j) ? j : undefined;
    },
    { timeoutMs, intervalMs: 200 },
  );
}

export const sleep = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));
