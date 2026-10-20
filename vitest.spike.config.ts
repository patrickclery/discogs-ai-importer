import { defineConfig } from 'vitest/config';
import base from './vitest.config';

// D-01 spike runner: live Claude calls, never part of `pnpm test`. Spread (not
// mergeConfig, which concatenates include arrays) so only spike files run.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['scripts/spike/**/*.spike.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 3_600_000,
    fileParallelism: false,
  },
});
