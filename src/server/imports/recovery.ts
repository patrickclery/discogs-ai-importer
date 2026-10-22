import 'server-only';

// RED stub (Plan 04-02 Task 2): the maintenance hook is implemented in the
// GREEN commit.
export function markInterruptedImports(_now = Date.now()): { failed: number } {
  return { failed: 0 };
}
