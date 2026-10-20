import 'server-only';

// Reconciliation of vision runs whose job finished without a terminal run
// status (RESEARCH Pattern 4 steps 1-3, Pitfall 3). Not implemented yet.

export function reconcileVisionRuns(_now = Date.now()): {
  errored: number;
  reparsed: number;
} {
  return { errored: 0, reparsed: 0 };
}
