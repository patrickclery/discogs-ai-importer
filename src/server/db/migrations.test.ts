import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb, runMigrations } from './client';

// Migration 0004 (bulk import, T-06-08) is additive: applied to a copy of a
// Phase 5 database (migrations 0000-0003 with rows in it) it adds the two
// bulk tables and keeps every existing row, and booting twice is harmless.

const REPO_DRIZZLE = path.resolve(__dirname, '../../../drizzle');

describe('migration 0004_bulk_import', () => {
  let dir = '';
  let previous: string | undefined;

  beforeEach(() => {
    previous = process.env.DATA_DIR;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-migrate-'));
    process.env.DATA_DIR = path.join(dir, 'data');
    fs.mkdirSync(process.env.DATA_DIR);
    closeDb();
  });

  afterEach(() => {
    closeDb();
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** The repo's drizzle folder without migration 0004. */
  function phase5Migrations(): string {
    const copy = path.join(dir, 'drizzle-phase5');
    fs.cpSync(REPO_DRIZZLE, copy, { recursive: true });
    fs.rmSync(path.join(copy, '0004_bulk_import.sql'), { force: true });
    fs.rmSync(path.join(copy, 'meta', '0004_snapshot.json'), { force: true });
    const journalPath = path.join(copy, 'meta', '_journal.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as {
      entries: { idx: number }[];
    };
    journal.entries = journal.entries.filter((e) => e.idx < 4);
    fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2));
    return copy;
  }

  function seedPhase5Rows(): void {
    const db = getDb().$client;
    const now = 1_790_000_000_000;
    db.prepare(
      `INSERT INTO photos (id, sha256, original_name, mime, bytes,
         original_path, created_at, updated_at)
       VALUES ('p1', 'sha-1', 'shelf.jpg', 'image/jpeg', 10,
         'photos/sha-1.jpg', ?, ?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO spines (id, photo_id, state, created_at, updated_at)
       VALUES ('s1', 'p1', 'active', ?, ?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO discogs_searches (id, spine_id, kind, input_hash,
         inputs_json, status, created_at)
       VALUES ('q1', 's1', 'auto', 'h', '{}', 'done', ?)`,
    ).run(now);
    db.prepare(
      `INSERT INTO discogs_candidates (id, spine_id, search_id, source,
         release_id, rank, title, created_at)
       VALUES ('c1', 's1', 'q1', 'auto', 5001, 0, 'Nirvana - Nevermind', ?)`,
    ).run(now);
    db.prepare(
      `INSERT INTO imports (id, spine_id, candidate_id, release_id, folder_id,
         status, created_at, updated_at)
       VALUES ('i1', 's1', 'c1', 5001, 1, 'imported', ?, ?)`,
    ).run(now, now);
  }

  function rows(): string {
    const db = getDb().$client;
    return JSON.stringify(
      [
        'photos',
        'spines',
        'discogs_searches',
        'discogs_candidates',
        'imports',
      ].map((t) => db.prepare(`SELECT * FROM ${t} ORDER BY id`).all()),
    );
  }

  it('upgrades a Phase 5 database copy without touching its rows', () => {
    migrate(getDb(), { migrationsFolder: phase5Migrations() });
    seedPhase5Rows();
    const before = rows();

    runMigrations();

    const db = getDb().$client;
    const objects = db
      .prepare(
        `SELECT name, sql FROM sqlite_master
         WHERE name IN ('bulk_runs', 'bulk_items', 'bulk_items_spine_open_idx')`,
      )
      .all() as { name: string; sql: string }[];
    expect(
      objects
        .map((o) => o.name)
        .sort()
        .join(','),
    ).toBe('bulk_items,bulk_items_spine_open_idx,bulk_runs');
    const index = objects.find((o) => o.name === 'bulk_items_spine_open_idx');
    expect(index?.sql).toContain('queued');
    expect(rows()).toBe(before);
    const applied = db
      .prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations')
      .get() as { n: number };
    expect(applied.n).toBe(5);
    expect(() => runMigrations()).not.toThrow();
    expect(rows()).toBe(before);
  });

  it('applies to a fresh data folder', () => {
    runMigrations();
    const db = getDb().$client;
    const names = (
      db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type = 'table'
           AND name IN ('bulk_runs', 'bulk_items')`,
        )
        .all() as { name: string }[]
    ).map((r) => r.name);
    expect(names.sort()).toEqual(['bulk_items', 'bulk_runs']);
  });
});
