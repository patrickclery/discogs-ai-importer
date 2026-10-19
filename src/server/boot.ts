import 'server-only';
import { closeDb, runMigrations } from './db/client';
import { startWorker, stopWorker } from './jobs/worker';
import { ensureDataDirs } from './storage/paths';

const g = globalThis as unknown as { __appExitHook?: boolean };

export async function bootServer(): Promise<void> {
  ensureDataDirs();
  runMigrations();
  startWorker();
  if (!g.__appExitHook) {
    g.__appExitHook = true;
    // Closing the handle checkpoints the WAL, so a stopped app leaves only
    // app.db and the data folder is safe to copy (D-07, RESEARCH Pitfall 4).
    process.once('exit', () => {
      try {
        stopWorker();
      } catch (err) {
        console.error('[boot] stopWorker on exit failed:', err);
      }
      try {
        closeDb();
      } catch (err) {
        console.error('[boot] closeDb on exit failed:', err);
      }
    });
  }
}
