// Headless smoke check of a demo export (D-03, D-05, D-15).
// Serves <out> at /discogs-ai-importer/ on an ephemeral 127.0.0.1 port (never
// 3000 or 3001), loads every demo page in headless Chrome with --dump-dom and
// fails when a page lacks the banner or an --expect marker, or when any
// request reached /api/ or left /discogs-ai-importer/.
//   node scripts/demo/smoke.ts [--out <dir>] [--expect "spines/=No spines yet"]...
//   node scripts/demo/smoke.ts --url https://patrickclery.github.io/discogs-ai-importer/
// --out defaults to the export recorded by build-demo (<scratch>/LATEST_OUT).
// --url skips the local server and only checks DOM markers on a live site.
// CHROME_BIN overrides the browser. Node built-ins only.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const BASE = '/discogs-ai-importer';
const BANNER =
  'Demo — Claude and Discogs are simulated. Changes reset when you reload.';
const RESERVED_PORTS = new Set([3000, 3001]);

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

type LogEntry = { path: string; status: number };

function scratchRoot(): string {
  return path.resolve(
    process.env.DEMO_SCRATCH_DIR ||
      path.join(os.tmpdir(), 'discogs-demo-build'),
  );
}

/** Routes of every src/app/**\/page.demo.tsx: '/' for the root, else 'a/b/'. */
function demoPageRoutes(repoRoot: string): string[] {
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

function parseArgs(argv: string[]): {
  out: string | null;
  url: string | null;
  expects: Array<{ route: string; text: string }>;
} {
  let out: string | null = null;
  let url: string | null = null;
  const expects: Array<{ route: string; text: string }> = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--out') out = path.resolve(next());
    else if (a === '--url') url = next();
    else if (a === '--expect') {
      const v = next();
      const eq = v.indexOf('=');
      if (eq <= 0) throw new Error(`--expect wants "<route>=<text>", got ${v}`);
      expects.push({ route: v.slice(0, eq), text: v.slice(eq + 1) });
    } else throw new Error(`unknown argument ${a}`);
  }
  return { out, url, expects };
}

function defaultOut(): string {
  const latest = path.join(scratchRoot(), 'LATEST_OUT');
  if (!fs.existsSync(latest)) {
    throw new Error(
      `no --out given and ${latest} is missing; run scripts/demo/build-demo.ts first`,
    );
  }
  return fs.readFileSync(latest, 'utf8').trim();
}

function startStatic(
  outDir: string,
  logEntries: LogEntry[],
): Promise<http.Server> {
  const notFound = path.join(outDir, '404.html');
  const server = http.createServer((req, res) => {
    const reqPath = new URL(req.url ?? '/', 'http://x').pathname;
    const send = (status: number, file: string | null) => {
      logEntries.push({ path: reqPath, status });
      if (!file) {
        res.writeHead(status, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
      }
      res.writeHead(status, {
        'content-type':
          CONTENT_TYPES[path.extname(file).toLowerCase()] ??
          'application/octet-stream',
        'cache-control': 'no-store',
      });
      fs.createReadStream(file).pipe(res);
    };
    if (reqPath === BASE) {
      logEntries.push({ path: reqPath, status: 301 });
      res.writeHead(301, { location: `${BASE}/` });
      res.end();
      return;
    }
    if (!reqPath.startsWith(`${BASE}/`)) {
      send(404, null);
      return;
    }
    let rel: string;
    try {
      rel = decodeURIComponent(reqPath.slice(BASE.length + 1));
    } catch {
      send(400, null);
      return;
    }
    const target = path.resolve(outDir, rel);
    if (target !== outDir && !target.startsWith(`${outDir}${path.sep}`)) {
      send(404, null);
      return;
    }
    let file = target;
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      file = path.join(file, 'index.html');
    }
    if (fs.existsSync(file) && fs.statSync(file).isFile()) send(200, file);
    else send(404, fs.existsSync(notFound) ? notFound : null);
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function findChrome(): string {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const dirs = (process.env.PATH ?? '').split(path.delimiter);
  for (const name of ['google-chrome-stable', 'google-chrome', 'chromium']) {
    for (const d of dirs) {
      const p = path.join(d, name);
      try {
        fs.accessSync(p, fs.constants.X_OK);
        return p;
      } catch {}
    }
  }
  throw new Error(
    'no Chrome found (set CHROME_BIN or install google-chrome-stable/chromium)',
  );
}

const profiles = new Set<string>();

function cleanupProfiles(): void {
  for (const dir of profiles) fs.rmSync(dir, { recursive: true, force: true });
  profiles.clear();
}

function dumpDom(chrome: string, url: string): Promise<string> {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-smoke-chrome-'));
  profiles.add(profile);
  return new Promise((resolve, reject) => {
    execFile(
      chrome,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${profile}`,
        '--virtual-time-budget=10000',
        '--dump-dom',
        url,
      ],
      { timeout: 90_000, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        fs.rmSync(profile, { recursive: true, force: true });
        profiles.delete(profile);
        if (err)
          reject(
            new Error(`chrome failed on ${url}: ${err.message}\n${stderr}`),
          );
        else resolve(stdout);
      },
    );
  });
}

function pageUrl(base: string, route: string): string {
  const b = base.endsWith('/') ? base : `${base}/`;
  return route === '/' ? b : `${b}${route}`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const routes = demoPageRoutes(REPO);
  for (const e of args.expects) {
    if (!routes.includes(e.route)) {
      throw new Error(
        `--expect route ${e.route} is not a demo page (${routes.join(', ')})`,
      );
    }
  }
  const chrome = findChrome();
  const failures: string[] = [];
  const logEntries: LogEntry[] = [];
  let server: http.Server | null = null;
  let base: string;
  if (args.url) {
    base = args.url;
  } else {
    const outDir = args.out ?? defaultOut();
    if (!fs.existsSync(path.join(outDir, '404.html'))) {
      throw new Error(
        `${outDir} does not look like a demo export (no 404.html)`,
      );
    }
    server = await startStatic(outDir, logEntries);
    const { port } = server.address() as AddressInfo;
    if (RESERVED_PORTS.has(port)) {
      throw new Error(`refusing reserved port ${port}`);
    }
    base = `http://127.0.0.1:${port}${BASE}/`;
    console.log(`[smoke] serving ${outDir} at ${base}`);
  }
  try {
    for (const route of routes) {
      const url = pageUrl(base, route);
      const dom = await dumpDom(chrome, url);
      const missing: string[] = [];
      if (!dom.includes(BANNER)) missing.push('the demo banner');
      for (const e of args.expects) {
        if (e.route === route && !dom.includes(e.text))
          missing.push(`"${e.text}"`);
      }
      if (missing.length > 0) {
        failures.push(`${route}: DOM lacks ${missing.join(', ')}`);
      } else {
        console.log(`[smoke] ${route} OK`);
      }
    }
  } finally {
    server?.close();
    cleanupProfiles();
  }

  for (const e of logEntries) console.log(`[smoke] ${e.status} ${e.path}`);
  for (const e of logEntries) {
    if (e.path.startsWith('/api/')) {
      failures.push(`request reached the static host: ${e.path}`);
    } else if (
      !e.path.startsWith(`${BASE}/`) &&
      e.path !== BASE &&
      e.path !== '/favicon.ico'
    ) {
      failures.push(`request outside ${BASE}/: ${e.path}`);
    } else if (e.status === 404) {
      if (
        e.path.startsWith(`${BASE}/_next/`) ||
        e.path.startsWith(`${BASE}/demo-assets/`)
      ) {
        failures.push(`missing file: ${e.path}`);
      } else {
        console.warn(`[smoke] warning: 404 ${e.path}`);
      }
    }
  }
  if (failures.length > 0) {
    for (const f of failures) console.error(`[smoke] FAIL ${f}`);
    throw new Error(`${failures.length} smoke check(s) failed`);
  }
  console.log(`[smoke] PASS ${routes.length} page(s), zero /api requests`);
}

process.on('exit', cleanupProfiles);

main().catch((err) => {
  console.error(`[smoke] ${(err as Error).message}`);
  cleanupProfiles();
  process.exit(1);
});
