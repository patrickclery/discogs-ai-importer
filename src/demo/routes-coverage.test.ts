import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { type DemoRoute, matchRoute } from './routes';

// DEMO-03 / D-03 mock-coverage gate: every real /api route a component can
// call and every fetch('/api/...') call site in the UI resolves to a demo
// route, and the demo invents no endpoint the real app does not have.

const SRC = path.resolve(import.meta.dirname, '..');
const API_DIR = path.join(SRC, 'app', 'api');
const GROUP_DIR = path.join(SRC, 'demo', 'routes');
const SAMPLE = 'sample-1';

/** Real routes no demo page can call: dev tooling, OAuth redirect, images. */
const EXCLUDED_ROUTES = new Set([
  '/api/dev/jobs',
  '/api/discogs/callback',
  '/api/files/[...path]',
  '/api/discogs/thumb/[id]',
  '/api/discogs/searches/[id]/thumb/[releaseId]',
]);

/** Developer-only component no demo page renders. */
const EXCLUDED_CALLS = [
  { file: 'components/dev-job-trigger.tsx', path: '/api/dev/jobs' },
];

const METHODS = ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'] as const;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const rel = (f: string) => path.relative(SRC, f).split(path.sep).join('/');

type RealRoute = { method: string; route: string; file: string };

/** (method, '/api/...' with [x] segments) for every real route file. */
function realRoutes(): RealRoute[] {
  const out: RealRoute[] = [];
  for (const file of walk(API_DIR)) {
    if (path.basename(file) !== 'route.ts') continue;
    const dir = path.relative(API_DIR, path.dirname(file));
    const route = `/api/${dir.split(path.sep).join('/')}`;
    const code = fs.readFileSync(file, 'utf8');
    const re =
      /export\s+(?:async\s+function\s+|const\s+)(GET|POST|PATCH|DELETE|PUT)\b/g;
    for (const m of code.matchAll(re)) {
      out.push({ method: m[1], route, file: rel(file) });
    }
  }
  return out;
}

/** '/api/spines/[id]' and '/api/spines/:id' both become '/api/spines/:_'. */
function shape(p: string): string {
  return p
    .split('/')
    .map((s) => (/^\[.*\]$/.test(s) || s.startsWith(':') ? ':_' : s))
    .join('/');
}

function sampleFromBrackets(route: string): string {
  return route
    .split('/')
    .map((s) => (/^\[.*\]$/.test(s) ? SAMPLE : s))
    .join('/');
}

function sampleFromPattern(pattern: string): string {
  return pattern
    .split('/')
    .map((s) => (s.startsWith(':') ? SAMPLE : s))
    .join('/');
}

type Group = { file: string; routes: DemoRoute[] };

async function demoGroups(): Promise<Group[]> {
  const out: Group[] = [];
  for (const name of fs.readdirSync(GROUP_DIR).sort()) {
    if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue;
    const mod = (await import(path.join(GROUP_DIR, name))) as {
      routes?: DemoRoute[];
    };
    if (mod.routes)
      out.push({ file: `demo/routes/${name}`, routes: mod.routes });
  }
  return out;
}

// ---- fetch call-site parsing -------------------------------------------

/** Index just past the ')' that closes the '(' at `open`; skips strings. */
function closeParen(code: string, open: number): number {
  let depth = 0;
  let i = open;
  while (i < code.length) {
    const c = code[i];
    if (c === "'" || c === '"' || c === '`') {
      i = skipString(code, i);
      continue;
    }
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return code.length;
}

/** Index just past the string literal starting at `start`. */
function skipString(code: string, start: number): number {
  const q = code[start];
  let i = start + 1;
  while (i < code.length) {
    const c = code[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === q) return i + 1;
    if (q === '`' && c === '$' && code[i + 1] === '{') {
      i = closeParen(code, i + 1);
      continue;
    }
    i++;
  }
  return code.length;
}

/** Split a call's argument text on top-level commas. */
function splitArgs(args: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let last = 0;
  let i = 0;
  while (i < args.length) {
    const c = args[i];
    if (c === "'" || c === '"' || c === '`') {
      i = skipString(args, i);
      continue;
    }
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      out.push(args.slice(last, i));
      last = i + 1;
    }
    i++;
  }
  out.push(args.slice(last));
  return out.map((a) => a.trim()).filter((a) => a.length > 0);
}

/** `cond ? A : B` at top level, or null. */
function ternary(expr: string): { cond: string; alts: string[] } | null {
  let depth = 0;
  let q = -1;
  let colon = -1;
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === "'" || c === '"' || c === '`') {
      i = skipString(expr, i);
      continue;
    }
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (depth === 0 && c === '?' && q < 0) q = i;
    else if (depth === 0 && c === ':' && q >= 0 && colon < 0) colon = i;
    i++;
  }
  if (q < 0 || colon < 0) return null;
  return {
    cond: expr.slice(0, q).trim(),
    alts: [expr.slice(q + 1, colon).trim(), expr.slice(colon + 1).trim()],
  };
}

/** String values a literal expression can take (template slots expanded). */
function literalValues(expr: string): string[] | null {
  const t = ternary(expr);
  if (t) {
    const a = t.alts.map(literalValues);
    if (a.some((v) => v === null)) return null;
    return a.flat() as string[];
  }
  const e = expr.trim();
  if (/^'[^']*'$/.test(e) || /^"[^"]*"$/.test(e)) return [e.slice(1, -1)];
  if (!/^`[\s\S]*`$/.test(e)) return null;
  // Template literal: expand each ${...} slot.
  const body = e.slice(1, -1);
  let variants = [''];
  let i = 0;
  while (i < body.length) {
    if (body[i] === '$' && body[i + 1] === '{') {
      const end = closeParen(body, i + 1);
      const slot = body.slice(i + 2, end - 1).trim();
      const before = variants[0];
      const precededBySlash = before.endsWith('/');
      const atEnd = end >= body.length;
      let fills: string[];
      const lit = literalValues(slot);
      if (lit) fills = lit;
      else if (atEnd && !precededBySlash)
        fills = ['']; // query-string suffix
      else fills = [SAMPLE];
      variants = variants.flatMap((v) => fills.map((f) => v + f));
      i = end;
      continue;
    }
    variants = variants.map((v) => v + body[i]);
    i++;
  }
  return variants;
}

type CallSite = { where: string; method: string; path: string };

/** Every fetch('/api/...') in non-test src/components and src/lib files. */
function callSites(): CallSite[] {
  const out: CallSite[] = [];
  const files = [
    ...walk(path.join(SRC, 'components')),
    ...walk(path.join(SRC, 'lib')),
  ].filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f));
  for (const file of files) {
    const code = fs.readFileSync(file, 'utf8');
    for (const m of code.matchAll(/(?<![\w.$])fetch\s*\(/g)) {
      const open = (m.index ?? 0) + m[0].length - 1;
      const close = closeParen(code, open);
      const [urlArg, initArg] = splitArgs(code.slice(open + 1, close - 1));
      if (!urlArg) continue;
      const line = code.slice(0, m.index).split('\n').length;
      const where = `${rel(file)}:${line}`;

      const urlT = ternary(urlArg);
      const urls = literalValues(urlArg);
      if (!urls?.some((u) => u.startsWith('/api/'))) continue;

      const methodExpr = initArg?.match(
        /\bmethod\s*:\s*((?:[^,}'"`]|'[^']*'|"[^"]*")+)/,
      )?.[1];
      const methodT = methodExpr ? ternary(methodExpr) : null;
      const methods = methodExpr
        ? (literalValues(methodExpr) ?? [`<dynamic:${methodExpr.trim()}>`])
        : ['GET'];

      // `c ? urlA : urlB` paired with `c ? 'M1' : 'M2'` on the same condition.
      const paired =
        urlT &&
        methodT &&
        urlT.cond === methodT.cond &&
        urls.length === methods.length;
      const pairs = paired
        ? urls.map((u, i) => [methods[i], u] as const)
        : methods.flatMap((mm) => urls.map((u) => [mm, u] as const));

      for (const [method, url] of pairs) {
        if (!url.startsWith('/api/')) continue;
        out.push({ where, method, path: url.split('?')[0] });
      }
    }
  }
  return out;
}

// ---- the gate -----------------------------------------------------------

describe('demo route coverage (D-03)', () => {
  const REAL = realRoutes();
  const CALLS = callSites();

  it('finds the real routes and UI call sites it is meant to check', () => {
    expect(REAL.length).toBeGreaterThan(20);
    expect(CALLS.length).toBeGreaterThan(20);
  });

  it('answers every callable real route with the same method', () => {
    const missing = REAL.filter((r) => !EXCLUDED_ROUTES.has(r.route))
      .filter((r) => !matchRoute(r.method, sampleFromBrackets(r.route)))
      .map((r) => `${r.method} ${r.route} (${r.file})`);
    expect(missing).toEqual([]);
  });

  it('answers every fetch("/api/...") call site in components and lib', () => {
    const missing = CALLS.filter(
      (c) =>
        !EXCLUDED_CALLS.some(
          (x) => c.where.startsWith(`${x.file}:`) && c.path === x.path,
        ),
    )
      .filter((c) => !matchRoute(c.method, c.path))
      .map((c) => `${c.method} ${c.path} (${c.where})`);
    expect(missing).toEqual([]);
  });

  it('invents no endpoint: every demo route has a real route and method', async () => {
    const real = new Set(REAL.map((r) => `${r.method} ${shape(r.route)}`));
    const phantom: string[] = [];
    for (const g of await demoGroups()) {
      for (const r of g.routes) {
        if (!real.has(`${r.method} ${shape(r.pattern)}`)) {
          phantom.push(`${r.method} ${r.pattern} (${g.file})`);
        }
      }
    }
    expect(phantom).toEqual([]);
  });

  it('dispatches every demo route group (no group left out of the table)', async () => {
    const unreachable: string[] = [];
    for (const g of await demoGroups()) {
      for (const r of g.routes) {
        const hit = matchRoute(r.method, sampleFromPattern(r.pattern));
        if (hit?.route !== r)
          unreachable.push(`${r.method} ${r.pattern} (${g.file})`);
      }
    }
    expect(unreachable).toEqual([]);
  });

  it('parses call-site URLs and methods (self-check)', () => {
    const find = (p: string, m: string) =>
      CALLS.some((c) => c.path === p && c.method === m);
    // query-string template suffix dropped
    expect(find('/api/spines', 'GET')).toBe(true);
    // ternary URL paired with ternary method on the same condition
    expect(find(`/api/spines/${SAMPLE}/import`, 'DELETE')).toBe(true);
    expect(find(`/api/spines/${SAMPLE}/retry`, 'POST')).toBe(true);
    expect(find(`/api/spines/${SAMPLE}/retry`, 'DELETE')).toBe(false);
    // ternary inside a template slot expands to both literals
    expect(find(`/api/spines/${SAMPLE}/import/link-existing`, 'POST')).toBe(
      true,
    );
    expect(find(`/api/spines/${SAMPLE}/import/another`, 'POST')).toBe(true);
    expect(
      CALLS.every((c) => (METHODS as readonly string[]).includes(c.method)),
    ).toBe(true);
  });
});
