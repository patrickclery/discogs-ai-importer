import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import { closeDb, runMigrations } from '@/server/db/client';

/**
 * Gives every test its own migrated DATA_DIR.
 *
 * Call once at the top of a describe block (or file). beforeEach creates a
 * fresh temp dir, points DATA_DIR at it, drops any open DB handle and runs
 * the migrations; afterEach closes the DB, restores DATA_DIR and removes the
 * dir. Returns a getter for the current temp root.
 */
export function useTempDataDir(): () => string {
  let dir = '';
  let previous: string | undefined;

  beforeEach(() => {
    previous = process.env.DATA_DIR;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-test-'));
    process.env.DATA_DIR = dir;
    closeDb();
    runMigrations();
  });

  afterEach(() => {
    closeDb();
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
    dir = '';
  });

  return () => {
    if (!dir) throw new Error('useTempDataDir: no temp dir outside a test');
    return dir;
  };
}
