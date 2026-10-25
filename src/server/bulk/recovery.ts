import 'server-only';

// RED stub (Plan 06-05 Task 2).

export const INTERRUPTED_LOOKUP_REASON =
  'The lookup was interrupted when the app stopped. Retry runs it again.';

export function markInterruptedLookups(_now = Date.now()): { failed: number } {
  return { failed: 0 };
}
