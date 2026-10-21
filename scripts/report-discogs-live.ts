// Read-only report of the live Discogs run (Plan 03-13, T-03-36).
// Run: node scripts/report-discogs-live.ts   (DATA_DIR picks the data folder)
// Opens app.db read-only and prints counts plus the two non-secret connect
// settings. It never opens the sign-in file, never prints a username, token,
// query text or URL, never writes, and never contacts Discogs.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

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

function count(sql: string): number {
  return (db.prepare(sql).get() as { n: number }).n;
}

if (!tableExists('discogs_searches') || !tableExists('discogs_candidates')) {
  console.log(
    'Discogs tables not created yet: start the app once with the new build',
  );
  db.close();
  process.exit(0);
}

// Only these two keys are ever read: both hold short enum strings.
const CONNECT_KEYS = ['discogs_connect_via', 'discogs_exchange_form'] as const;
const ALLOWED: Record<(typeof CONNECT_KEYS)[number], string[]> = {
  discogs_connect_via: ['callback', 'code'],
  discogs_exchange_form: ['standard', 'docs'],
};

heading('connect settings');
for (const key of CONNECT_KEYS) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  let value = 'not recorded';
  if (row) {
    try {
      const parsed: unknown = JSON.parse(row.value);
      value =
        typeof parsed === 'string' && ALLOWED[key].includes(parsed)
          ? parsed
          : 'unexpected value';
    } catch {
      value = 'unreadable';
    }
  }
  line(key, value);
}

heading('discogs_searches by kind and status');
const byKind = db
  .prepare(
    `SELECT kind, status, COUNT(*) AS n FROM discogs_searches
     GROUP BY kind, status ORDER BY kind, status`,
  )
  .all() as { kind: string; status: string; n: number }[];
if (byKind.length === 0) line('searches', 0);
for (const r of byKind) line(`${r.kind} / ${r.status}`, r.n);
line('total', count('SELECT COUNT(*) AS n FROM discogs_searches'));

const failedKinds = db
  .prepare(
    `SELECT COALESCE(error_kind, 'none') AS kind, COUNT(*) AS n
     FROM discogs_searches
     WHERE status IN ('failed', 'auth_failed', 'not_connected', 'not_found')
     GROUP BY error_kind ORDER BY n DESC`,
  )
  .all() as { kind: string; n: number }[];
heading('searches that ended in an error, by error kind');
if (failedKinds.length === 0) line('none', 0);
for (const r of failedKinds) line(r.kind, r.n);

heading('CD spines');
line(
  'active CD spines',
  count(
    `SELECT COUNT(*) AS n FROM spines s
     JOIN spine_detections d ON d.id = s.current_detection_id
     WHERE s.state = 'active' AND d.media_kind = 'cd'`,
  ),
);
line(
  'active CD spines with no search yet',
  count(
    `SELECT COUNT(*) AS n FROM spines s
     JOIN spine_detections d ON d.id = s.current_detection_id
     WHERE s.state = 'active' AND d.media_kind = 'cd'
       AND NOT EXISTS (SELECT 1 FROM discogs_searches x WHERE x.spine_id = s.id)`,
  ),
);
line(
  'active CD spines with at least one candidate',
  count(
    `SELECT COUNT(*) AS n FROM spines s
     JOIN spine_detections d ON d.id = s.current_detection_id
     WHERE s.state = 'active' AND d.media_kind = 'cd'
       AND EXISTS (SELECT 1 FROM discogs_candidates c WHERE c.spine_id = s.id)`,
  ),
);

heading('candidates and covers');
const total = count('SELECT COUNT(*) AS n FROM discogs_candidates');
const withThumb = count(
  `SELECT COUNT(*) AS n FROM discogs_candidates
   WHERE thumb_url IS NOT NULL AND thumb_url <> ''`,
);
line('candidates', total);
line('candidates with a cover link', withThumb);
line(
  'share with a cover link',
  total === 0 ? 'n/a' : `${((withThumb / total) * 100).toFixed(1)}%`,
);
const thumbDir = path.join(dataDir, 'discogs-thumbs');
const cached = fs.existsSync(thumbDir)
  ? fs.readdirSync(thumbDir).filter((f) => f.endsWith('.webp')).length
  : 0;
line('cached cover files', cached);

heading('discogs-lane jobs');
const jobsByStatus = db
  .prepare(
    `SELECT status, COUNT(*) AS n FROM jobs WHERE lane = 'discogs'
     GROUP BY status ORDER BY status`,
  )
  .all() as { status: string; n: number }[];
if (jobsByStatus.length === 0) line('jobs', 0);
for (const r of jobsByStatus) line(r.status, r.n);
line(
  'jobs with attempts above 1',
  count(
    "SELECT COUNT(*) AS n FROM jobs WHERE lane = 'discogs' AND attempts > 1",
  ),
);
line(
  'jobs paused by rate limiting (deferred)',
  count(
    `SELECT COUNT(*) AS n FROM jobs WHERE lane = 'discogs'
     AND last_error LIKE 'deferred%'`,
  ),
);

heading('failed discogs jobs by first word of last_error');
const failedJobs = db
  .prepare(
    `SELECT last_error FROM jobs WHERE lane = 'discogs' AND status = 'failed'`,
  )
  .all() as { last_error: string | null }[];
const groups = new Map<string, number>();
for (const j of failedJobs) {
  const word =
    (j.last_error ?? '')
      .trim()
      .split(/[\s:]+/)[0]
      ?.replace(/[^A-Za-z0-9_-]/g, '') || '(empty)';
  groups.set(word, (groups.get(word) ?? 0) + 1);
}
if (groups.size === 0) line('none', 0);
for (const [word, n] of [...groups].sort((a, b) => b[1] - a[1])) {
  line(word, n);
}

db.close();
