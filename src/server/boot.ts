import 'server-only';
import { runMigrations } from './db/client';
import { startWorker } from './jobs/worker';
import { ensureDataDirs } from './storage/paths';

export async function bootServer(): Promise<void> {
  ensureDataDirs();
  runMigrations();
  startWorker();
}
