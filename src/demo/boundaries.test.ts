import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// DEMO-02 / T-05-02 / T-05-05 / D-04: the demo runtime never value-imports
// server code, real code never imports the demo runtime, and demo state is
// never persisted.

const SRC = path.resolve(import.meta.dirname, '..');
const DEMO_DIR = path.join(SRC, 'demo');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|mts|js|jsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

const isTest = (f: string) => /\.test\.(ts|tsx)$/.test(f);
const isDemoRoute = (f: string) => /\.demo\.(ts|tsx)$/.test(f);
const inDemoDir = (f: string) => f.startsWith(`${DEMO_DIR}${path.sep}`);

const ALL = walk(SRC);
const DEMO_FILES = ALL.filter(
  (f) => !isTest(f) && (inDemoDir(f) || isDemoRoute(f)),
);
const REAL_FILES = ALL.filter(
  (f) => !isTest(f) && !inDemoDir(f) && !isDemoRoute(f),
);

type Imp = { spec: string; typeOnly: boolean };

/** Import/export-from specifiers, multi-line clauses included. */
function importsOf(code: string): Imp[] {
  const out: Imp[] = [];
  const fromRe =
    /(?:^|\n)\s*(import|export)\s+([^'";]*?)\s*from\s*['"]([^'"]+)['"]/g;
  for (const m of code.matchAll(fromRe)) {
    out.push({ spec: m[3], typeOnly: /^type\s/.test(m[2]) });
  }
  for (const m of code.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g)) {
    out.push({ spec: m[1], typeOnly: false });
  }
  for (const m of code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    out.push({ spec: m[1], typeOnly: false });
  }
  return out;
}

/** The src-relative target of an '@/…' or relative specifier, else null. */
function srcTarget(file: string, spec: string): string | null {
  if (spec.startsWith('@/')) return path.join(SRC, spec.slice(2));
  if (spec.startsWith('.')) return path.resolve(path.dirname(file), spec);
  return null;
}

const FORBIDDEN_PACKAGES = [
  'better-sqlite3',
  'sharp',
  'drizzle-orm',
  'heic-decode',
];
const FORBIDDEN_SRC = [
  path.join(SRC, 'server'),
  path.join(SRC, 'app', 'api'),
  path.join(SRC, 'app', 'settings', 'actions'),
];

function under(target: string, base: string): boolean {
  return (
    target === base ||
    target.startsWith(`${base}${path.sep}`) ||
    target.startsWith(`${base}.`)
  );
}

function forbiddenForDemo(file: string, spec: string): boolean {
  if (spec.startsWith('node:')) return true;
  if (FORBIDDEN_PACKAGES.some((p) => spec === p || spec.startsWith(`${p}/`))) {
    return true;
  }
  const target = srcTarget(file, spec);
  return target !== null && FORBIDDEN_SRC.some((b) => under(target, b));
}

const rel = (f: string) => path.relative(SRC, f);

describe('demo import boundaries', () => {
  it('finds the demo runtime and its imports (the scan is not vacuous)', () => {
    expect(DEMO_FILES.map(rel)).toEqual(
      expect.arrayContaining([
        path.join('demo', 'fetch-shim.ts'),
        path.join('demo', 'demo-root.tsx'),
        path.join('app', 'layout.demo.tsx'),
        path.join('app', 'spines', 'page.demo.tsx'),
      ]),
    );
    const root = fs.readFileSync(path.join(DEMO_DIR, 'demo-root.tsx'), 'utf8');
    expect(importsOf(root).map((i) => i.spec)).toContain('./fetch-shim');
    const multi =
      "import {\n  a,\n  b,\n} from '@/server/x';\nimport type { T } from '@/server/y';";
    expect(importsOf(multi)).toEqual([
      { spec: '@/server/x', typeOnly: false },
      { spec: '@/server/y', typeOnly: true },
    ]);
  });

  it('demo files never value-import server modules, native packages or node:', () => {
    const bad: string[] = [];
    for (const f of DEMO_FILES) {
      for (const imp of importsOf(fs.readFileSync(f, 'utf8'))) {
        if (!imp.typeOnly && forbiddenForDemo(f, imp.spec)) {
          bad.push(`${rel(f)} imports ${imp.spec}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('real files never import the demo runtime', () => {
    const bad: string[] = [];
    for (const f of REAL_FILES) {
      for (const imp of importsOf(fs.readFileSync(f, 'utf8'))) {
        const target = srcTarget(f, imp.spec);
        if (target !== null && under(target, DEMO_DIR)) {
          bad.push(`${rel(f)} imports ${imp.spec}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('demo state is never persisted (D-04)', () => {
    const bad = DEMO_FILES.filter(inDemoDir).filter((f) =>
      /\b(localStorage|sessionStorage|indexedDB)\b/.test(
        fs.readFileSync(f, 'utf8'),
      ),
    );
    expect(bad.map(rel)).toEqual([]);
  });
});
