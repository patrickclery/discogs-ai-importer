// Read-only report of real Discogs imports (Plan 04-09, T-04-39), for the
// owner's own check that no copy was added twice (IMP-04, RESEARCH Pitfall 1).
// Run: node scripts/report-discogs-import-live.ts   (DATA_DIR picks the data
// folder, default data)
// Opens app.db read-only and prints counts and local ids only. It never
// opens secrets.json, never prints a username, token, URL or Discogs text,
// never writes, and never contacts Discogs.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const OPEN_IMPORT_WARN_MS = 5 * 60 * 1000;

const dataDir = path.resolve(process.cwd(), process.env.DATA_DIR || 'data');
const dbPath = path.join(dataDir, 'app.db');

if (!fs.existsSync(dbPath)) {
  console.log(`No database at ${dbPath}: start the app once first`);
  process.exit(0);
}

const db = new Database(dbPath, { readonly: true, fileMustExist: true });

function tableExists(name: string): boolean {
  return (
    db
      .prepare(
        "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(name) !== undefined
  );
}

function heading(label: string): void {
  console.log(`\n== ${label}`);
}

function line(label: string, value: string | number): void {
  console.log(`  ${label}: ${value}`);
}

function warn(text: string): void {
  console.log(`  WARN ${text}`);
}

function count(sql: string, params: Record<string, unknown> = {}): number {
  return (db.prepare(sql).get(params) as { n: number }).n;
}

/** Status and error kinds are short enum words; anything else is masked. */
function word(v: string | null): string {
  if (v === null) return 'none';
  return /^[a-z_]{1,40}$/.test(v) ? v : 'other';
}

function finish(): void {
  db.close();
  console.log('\nreport-discogs-import-live done');
}

if (
  !tableExists('imports') ||
  count('SELECT COUNT(*) AS n FROM imports') === 0
) {
  console.log('No imports yet');
  finish();
  process.exit(0);
}

heading('imports by status');
const byStatus = db
  .prepare(
    `SELECT status, COUNT(*) AS n FROM imports
     GROUP BY status ORDER BY status`,
  )
  .all() as { status: string; n: number }[];
for (const r of byStatus) line(word(r.status), r.n);
line('total', count('SELECT COUNT(*) AS n FROM imports'));

heading('failed imports by error kind');
const byKind = db
  .prepare(
    `SELECT error_kind, COUNT(*) AS n FROM imports WHERE status = 'failed'
     GROUP BY error_kind ORDER BY n DESC, error_kind`,
  )
  .all() as { error_kind: string | null; n: number }[];
if (byKind.length === 0) line('none', 0);
for (const r of byKind) line(word(r.error_kind), r.n);

heading('imported copies');
const copies = db
  .prepare(
    `SELECT
       SUM(CASE WHEN adopted = 0 AND linked = 0 THEN 1 ELSE 0 END) AS added,
       SUM(CASE WHEN adopted = 1 THEN 1 ELSE 0 END) AS adopted,
       SUM(CASE WHEN linked = 1 THEN 1 ELSE 0 END) AS linked,
       SUM(CASE WHEN instance_id IS NULL THEN 1 ELSE 0 END) AS no_instance
     FROM imports WHERE status = 'imported'`,
  )
  .get() as {
  added: number | null;
  adopted: number | null;
  linked: number | null;
  no_instance: number | null;
};
line('added by the app', copies.added ?? 0);
line('adopted after an unanswered add', copies.adopted ?? 0);
line('linked to a copy already owned', copies.linked ?? 0);
line('imported without a copy number', copies.no_instance ?? 0);

heading('warnings');
let warnings = 0;
const multiPost = db
  .prepare(
    `SELECT id, post_count FROM imports
     WHERE post_count > 1 AND adopted = 0 ORDER BY created_at, id`,
  )
  .all() as { id: string; post_count: number }[];
for (const r of multiPost) {
  warnings += 1;
  warn(`import ${r.id} sent ${r.post_count} adds and adopted none`);
}
const sharedInstance = db
  .prepare(
    `SELECT instance_id, COUNT(*) AS n FROM imports
     WHERE instance_id IS NOT NULL
     GROUP BY instance_id HAVING COUNT(*) > 1 ORDER BY instance_id`,
  )
  .all() as { instance_id: number; n: number }[];
for (const r of sharedInstance) {
  warnings += 1;
  warn(`copy number ${r.instance_id} is held by ${r.n} imports`);
}
const stale = db
  .prepare(
    `SELECT id, status, created_at FROM imports
     WHERE status IN ('pending', 'importing') AND created_at < @before
     ORDER BY created_at, id`,
  )
  .all({ before: Date.now() - OPEN_IMPORT_WARN_MS }) as {
  id: string;
  status: string;
  created_at: number;
}[];
for (const r of stale) {
  warnings += 1;
  const minutes = Math.floor((Date.now() - r.created_at) / 60_000);
  warn(`import ${r.id} is still ${word(r.status)} after ${minutes} minutes`);
}
if (warnings === 0) line('none', 0);

heading('add_to_collection jobs by status');
const jobs = db
  .prepare(
    `SELECT status, COUNT(*) AS n FROM jobs WHERE type = 'add_to_collection'
     GROUP BY status ORDER BY status`,
  )
  .all() as { status: string; n: number }[];
if (jobs.length === 0) line('jobs', 0);
for (const r of jobs) line(word(r.status), r.n);

finish();
