// Shared with client components: no server-only import here.
export type StatusLane = 'anthropic' | 'discogs';
export type StatusJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type StatusResponse = {
  worker: {
    bootId: string;
    startedAt: number;
    starts: number;
    pid: number;
  } | null;
  jobs: Record<StatusLane, Record<StatusJobStatus, number>>;
};
