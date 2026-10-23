// Checks a demo static export before it can be published (D-03, D-06, D-18,
// T-05-01..03, T-05-08). Every rule fails with a short message naming it and
// never prints a secret value.
//   node scripts/demo/verify-export.ts [--out ./out] [--next ./.next] [--secrets ./secrets.json]
// The secrets file defaults to $SECRETS_FILE or ./secrets.json, like the app.
// build-demo.ts calls verifyExport() after every build. Node built-ins only.
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const BASE = '/discogs-ai-importer';
const CROPS_MAX_BYTES = 1_650_000;
const FORBIDDEN_STRINGS = [
  'better-sqlite3',
  'drizzle-orm',
  'heic-decode',
  'child_process',
  'server-only',
  'node:fs',
  'node:child_process',
];
/**
 * A server action call in a client bundle, whatever the id or minifier
 * shape: `(0,x.createServerReference)("id",…)` or `createServerReference(…)`.
 * React's own definition (`createServerReference=function`) and re-export
 * getter (`createServerReference:function`) are not calls, so a clean demo
 * bundle never matches (WR-04).
 */
export const SERVER_ACTION_RE = /createServerReference\s*\)?\s*\(/;
const ASSET_ALLOW = [
  /^vision\.jpg$/,
  /^thumb\.webp$/,
  /^crops\/\d{2}\.webp$/,
  /^covers\/\d+\.svg$/,
];
const TEXT_EXT = new Set([
  '.html',
  '.js',
  '.mjs',
  '.css',
  '.json',
  '.txt',
  '.svg',
  '.map',
  '.xml',
  '.webmanifest',
]);
/** Same floor as the Discogs recorder's leak check (a short username). */
export const SECRET_MIN_LENGTH = 4;
/**
 * Env vars whose values must never ship: SECRET_ENV_NAMES in
 * src/server/secrets.ts plus the API key the Claude CLI wrapper strips.
 */
export const SECRET_ENV_VARS = [
  'DISCOGS_CONSUMER_KEY',
  'DISCOGS_CONSUMER_SECRET',
  'ANTHROPIC_API_KEY',
] as const;
/**
 * Well-known credential shapes (rule h). CI has no secrets file and no
 * DISCOGS_* values, so these keep the published build's scan meaningful.
 * Messages name the label only, never the match.
 */
export const SECRET_PATTERNS: ReadonlyArray<{ label: string; re: RegExp }> = [
  { label: 'Anthropic API key', re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  {
    label: 'GitHub token',
    re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/,
  },
  { label: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: 'Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  {
    label: 'Discogs OAuth PLAINTEXT signature',
    re: /oauth_signature="?[A-Za-z0-9]{10,}(?:&|%26)[A-Za-z0-9]{10,}/,
  },
];

export type EnvMap = Record<string, string | undefined>;

/** The secrets file the app reads: $SECRETS_FILE or <cwd>/secrets.json. */
export function resolveSecretsPath(
  cwd: string,
  env: EnvMap = process.env,
): string {
  return path.resolve(cwd, env.SECRETS_FILE || 'secrets.json');
}

/** Routes of every src/app/**\/page.demo.tsx: '/' for the root, else 'a/b/'. */
export function demoPageRoutes(repoRoot: string): string[] {
  const appDir = path.join(repoRoot, 'src', 'app');
  const routes: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === 'page.demo.tsx') {
        const segs = path
          .relative(appDir, dir)
          .split(path.sep)
          .filter((s) => s !== '' && !/^\(.*\)$/.test(s));
        routes.push(segs.length === 0 ? '/' : `${segs.join('/')}/`);
      }
    }
  };
  walk(appDir);
  return routes.sort();
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(dir);
  return out;
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function isEmptyObject(v: unknown): boolean {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    Object.keys(v).length === 0
  );
}

/** Every string value in a JSON tree, with its key path (never logged). */
function stringValues(v: unknown, at: string, out: Array<[string, string]>) {
  if (typeof v === 'string') out.push([at, v]);
  else if (Array.isArray(v)) {
    v.forEach((x, i) => {
      stringValues(x, `${at}[${i}]`, out);
    });
  } else if (typeof v === 'object' && v !== null) {
    for (const [k, x] of Object.entries(v)) {
      stringValues(x, at ? `${at}.${k}` : k, out);
    }
  }
}

export type VerifyResult = {
  ok: boolean;
  failures: string[];
  files: number;
  /** Known secret values scanned for (0 in CI; the patterns still run). */
  secretValues?: number;
};

export function verifyExport(opts: {
  outDir: string;
  nextDir: string;
  secretsPath: string | null;
  repoRoot?: string;
  /** Source of SECRET_ENV_VARS values; defaults to process.env. */
  env?: EnvMap;
}): VerifyResult {
  const failures: string[] = [];
  const fail = (rule: string, msg: string) => failures.push(`[${rule}] ${msg}`);
  const outDir = path.resolve(opts.outDir);
  if (!fs.existsSync(outDir) || !fs.statSync(outDir).isDirectory()) {
    fail('a', `export folder ${outDir} does not exist`);
    return { ok: false, failures, files: 0 };
  }
  const files = listFiles(outDir);
  const relOf = (f: string) =>
    path.relative(outDir, f).split(path.sep).join('/');

  // a. every demo page and the 404 page were exported
  for (const route of demoPageRoutes(opts.repoRoot ?? REPO)) {
    const page = route === '/' ? 'index.html' : `${route}index.html`;
    if (!fs.existsSync(path.join(outDir, page))) {
      fail('a', `missing page out/${page}`);
    }
  }
  if (!fs.existsSync(path.join(outDir, '404.html'))) {
    fail('a', 'missing out/404.html');
  }

  // b. no route handler output
  if (fs.existsSync(path.join(outDir, 'api'))) {
    fail('b', 'out/api exists (route handlers leaked into the export)');
  }

  // c. no server actions, no proxy/middleware (D-03)
  const serverDir = path.join(opts.nextDir, 'server');
  // A missing manifest fails like the middleware one: without it the
  // check would pass silently (WR-04).
  const srm = path.join(serverDir, 'server-reference-manifest.json');
  try {
    const m = readJson(srm) as Record<string, unknown>;
    if (!isEmptyObject(m.node) || !isEmptyObject(m.edge)) {
      fail(
        'c',
        'server-reference manifest not empty (server actions in the build)',
      );
    }
  } catch {
    fail('c', `server-reference manifest missing or unreadable at ${srm}`);
  }
  const mw = path.join(serverDir, 'middleware-manifest.json');
  try {
    const m = readJson(mw) as Record<string, unknown>;
    if (!isEmptyObject(m.middleware)) {
      fail('c', 'middleware manifest not empty (proxy in the build)');
    }
  } catch {
    fail('c', `middleware manifest missing or unreadable at ${mw}`);
  }

  // h. secrets-file and env secret values (key names only in messages),
  // plus secret-shaped patterns below
  const secrets: Array<[string, string]> = [];
  if (opts.secretsPath && fs.existsSync(opts.secretsPath)) {
    try {
      const found: Array<[string, string]> = [];
      stringValues(readJson(opts.secretsPath), '', found);
      for (const [k, v] of found) secrets.push([`key ${k}`, v]);
    } catch {
      fail('h', 'secrets file exists but is not readable JSON; cannot scan');
    }
  }
  const env = opts.env ?? process.env;
  for (const name of SECRET_ENV_VARS) {
    const v = env[name]?.trim();
    if (v) secrets.push([`env ${name}`, v]);
  }
  const secretValues = secrets
    .filter(([, v]) => v.length >= SECRET_MIN_LENGTH)
    .map(([key, v]) => ({ key, buf: Buffer.from(v, 'utf8') }));

  let cropBytes = 0;
  for (const file of files) {
    const rel = relOf(file);
    const ext = path.extname(file).toLowerCase();
    const buf = fs.readFileSync(file);
    const text = TEXT_EXT.has(ext) ? buf.toString('utf8') : null;

    // d. no server code in the bundle
    if (text !== null) {
      for (const s of FORBIDDEN_STRINGS) {
        if (text.includes(s)) fail('d', `out/${rel} contains '${s}'`);
      }
      if (SERVER_ACTION_RE.test(text)) {
        fail('d', `out/${rel} contains a server action reference`);
      }
    }

    // e. root-relative URLs carry the basePath (RESEARCH Pitfall 7)
    if (ext === '.html' && text !== null) {
      for (const m of text.matchAll(/\s(?:src|href)="(\/[^"]*)"/g)) {
        if (!m[1].startsWith(`${BASE}/`)) {
          fail('e', `out/${rel} has a URL without the basePath: ${m[1]}`);
        }
      }
    }

    // f. demo-assets allowlist and crop budget (D-18)
    if (rel.startsWith('demo-assets/')) {
      const a = rel.slice('demo-assets/'.length);
      if (!ASSET_ALLOW.some((re) => re.test(a))) {
        fail('f', `out/${rel} is not an allowed demo asset`);
      }
      if (a.startsWith('crops/')) cropBytes += buf.byteLength;
    }

    // g. never the HEIC original or the owner's mother's photos (D-06)
    if (ext === '.heic' || ext === '.heif') {
      fail('g', `out/${rel} is a HEIC/HEIF file`);
    }
    if (text !== null && (text.includes('IMG_35') || text.includes('img-35'))) {
      fail('g', `out/${rel} mentions a family photo (IMG_35/img-35)`);
    }

    // h. no secret value anywhere (binary files included), and no
    // secret-shaped string in any text file
    for (const s of secretValues) {
      if (buf.includes(s.buf)) {
        fail('h', `secret value of ${s.key} found in out/${rel}`);
      }
    }
    if (text !== null) {
      for (const p of SECRET_PATTERNS) {
        if (p.re.test(text))
          fail('h', `out/${rel} contains a secret-shaped string (${p.label})`);
      }
    }
  }
  if (cropBytes >= CROPS_MAX_BYTES) {
    fail(
      'f',
      `spine crops total ${cropBytes} bytes (limit ${CROPS_MAX_BYTES - 1})`,
    );
  }

  return {
    ok: failures.length === 0,
    failures,
    files: files.length,
    secretValues: secretValues.length,
  };
}

/** Print the result; true when every rule passed. */
export function reportVerify(r: VerifyResult): boolean {
  for (const f of r.failures) console.error(`[verify-export] FAIL ${f}`);
  if (r.ok) {
    const scanned =
      r.secretValues === undefined
        ? ''
        : ` (${r.secretValues} known secret values, ${SECRET_PATTERNS.length} secret patterns)`;
    console.log(`[verify-export] PASS: ${r.files} files, rules a-h${scanned}`);
  }
  return r.ok;
}

function parseArgs(argv: string[]) {
  const opts = {
    outDir: path.resolve('out'),
    nextDir: path.resolve('.next'),
    secretsPath: resolveSecretsPath(process.cwd()) as string | null,
  };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i + 1];
    if (v === undefined) throw new Error(`${argv[i]} needs a value`);
    if (argv[i] === '--out') opts.outDir = path.resolve(v);
    else if (argv[i] === '--next') opts.nextDir = path.resolve(v);
    else if (argv[i] === '--secrets') opts.secretsPath = path.resolve(v);
    else throw new Error(`unknown argument ${argv[i]}`);
    i++;
  }
  return opts;
}

if (import.meta.main) {
  try {
    if (!reportVerify(verifyExport(parseArgs(process.argv.slice(2))))) {
      process.exit(1);
    }
  } catch (err) {
    console.error(`[verify-export] ${(err as Error).message}`);
    process.exit(1);
  }
}
