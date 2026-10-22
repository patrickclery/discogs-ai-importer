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
   * imports (Plan 04-09): left is queued + running add_to_collection jobs (a
   * part of backlog), failed the active or orphaned spines whose latest
   * import reads failed. Counts only, never a username or release data.
   */
  discogs: {
    connected: boolean;
    backlog: number;
    pausedUntil: number | null;
    failedSpines: number;
    imports: { left: number; failed: number };
  };
};
