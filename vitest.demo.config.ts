import { defineConfig } from 'vitest/config';
import base from './vitest.config';

// Phase 5 demo fixture scripts (developer-run, never part of `pnpm test`).
// Spread like vitest.spike.config.ts so only scripts/demo/**/*.demo.ts run.
// setupFiles is empty on purpose: the base setup points SECRETS_FILE at an
// empty temp dir, and the Discogs recorder needs the owner's real sign-in
// (RESEARCH Pitfall 6).
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['scripts/demo/**/*.demo.ts'],
    setupFiles: [],
    testTimeout: 3_600_000,
    hookTimeout: 3_600_000,
    fileParallelism: false,
    reporters: ['default'],
  },
});
