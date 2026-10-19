import path from 'node:path';
import { defineConfig } from 'vitest/config';

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` throws outside Next (RESEARCH Pitfall 3): stub it.
      'server-only': path.join(root, 'test/stubs/server-only.ts'),
      '@': path.join(root, 'src'),
    },
  },
  test: {
    environment: 'node',
    // better-sqlite3 is a native addon; forks isolate each file's handle.
    pool: 'forks',
    include: ['src/**/*.test.ts'],
  },
});
