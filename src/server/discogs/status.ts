import 'server-only';
import type Database from 'better-sqlite3';

// RED skeleton (03-06 Task 2): signature only, implementation follows.

export function discogsStatus(_db: Database.Database): {
  connected: boolean;
  backlog: number;
  pausedUntil: number | null;
  failedSpines: number;
} {
  return { connected: true, backlog: -1, pausedUntil: -1, failedSpines: -1 };
}
