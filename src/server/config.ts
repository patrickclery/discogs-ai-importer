import 'server-only';

/** Dev-only routes (D-15): on in dev, or under `next start` with APP_TEST_HOOKS=1. */
export function devHooksEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' || process.env.APP_TEST_HOOKS === '1'
  );
}
