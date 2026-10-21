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
  /** Current worker_lease holder (any process on this DATA_DIR), or null. */
  lease: { bootId: string; pid: number; heartbeatAt: number } | null;
  /**
   * Discogs part (D-07): backlog is queued + running on the discogs lane,
   * failedSpines the active or orphaned spines whose latest automatic
   * search failed; the pause field is the epoch ms a 429 pause ends, or null.
   */
  discogs: {
    connected: boolean;
    backlog: number;
    pausedUntil: number | null;
    failedSpines: number;
  };
};
