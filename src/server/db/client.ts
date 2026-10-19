import 'server-only';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  type BetterSQLite3Database,
  drizzle,
} from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dbFile } from '../storage/paths';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema> & {
  $client: Database.Database;
};

// Module scope is duplicated across the instrumentation and route graphs,
// so the connection lives on globalThis (RESEARCH Pattern 2).
const g = globalThis as unknown as { __appDb?: Db };

export function getDb(): Db {
  if (g.__appDb) return g.__appDb;
  const sqlite = new Database(dbFile());
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  g.__appDb = drizzle(sqlite, { schema }) as Db;
  return g.__appDb;
}

export function runMigrations(): void {
  migrate(getDb(), {
    migrationsFolder: path.join(
      /* turbopackIgnore: true */ process.cwd(),
      'drizzle',
    ),
  });
}

export function closeDb(): void {
  const db = g.__appDb;
  if (!db) return;
  delete g.__appDb;
  db.$client.close();
}
