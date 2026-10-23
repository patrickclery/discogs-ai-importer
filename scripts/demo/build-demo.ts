// Demo build (D-02, D-20): NEXT_PUBLIC_DEMO=1 next build → static export.
// A demo build always writes .next and would wipe the owner's real build, so
// by default it runs in a scratch copy of the repo outside the checkout:
//   node scripts/demo/build-demo.ts            (scratch copy; prints DEMO_OUT=)
//   CI=true node scripts/demo/build-demo.ts --in-place   (CI only: ./out)
// DEMO_SCRATCH_DIR overrides the scratch root (default <tmp>/discogs-demo-build).
// The script only deletes inside a scratch root it owns: one holding its
// .discogs-demo-scratch marker, or an empty one it then marks (WR-06).
// Node built-ins only. The copy holds only git-tracked or unignored files, so
// secrets.json, data/, fixtures/spike/, .env*, .next and out never enter it.
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  type EnvMap,
  reportVerify,
  resolveSecretsPath,
  verifyExport,
} from './verify-export.ts';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const LOCK_STALE_MS = 15 * 60 * 1000;
const KEEP_OUTS = 3;
export const SCRATCH_MARKER = '.discogs-demo-scratch';
/** Entries build-demo.ts itself creates in its scratch root. */
const SCRATCH_ENTRY =
  /^(repo|lock|LATEST_OUT|node_modules\.sha256|out-\d+-\d+)$/;
const OUT_ENTRY = /^out-\d+-\d+$/;

export function scratchRoot(): string {
  return path.resolve(
    process.env.DEMO_SCRATCH_DIR ||
      path.join(os.tmpdir(), 'discogs-demo-build'),
  );
}

function log(msg: string): void {
  console.log(`[build-demo] ${msg}`);
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Make sure `scratch` is safe to delete inside (WR-06): not the repo, inside
 * it or an ancestor of it, and either marked as ours, empty, or holding only
 * the entries an older unmarked build-demo.ts run left behind. Writes the
 * marker; throws (deleting nothing) otherwise.
 */
export function claimScratch(scratch: string, repo: string = REPO): void {
  if (isInside(scratch, repo) || isInside(repo, scratch)) {
    throw new Error(
      `scratch dir ${scratch} overlaps the repo ${repo}; pick a separate one (D-20)`,
    );
  }
  fs.mkdirSync(scratch, { recursive: true });
  const marker = path.join(scratch, SCRATCH_MARKER);
  const markerStat = fs.lstatSync(marker, { throwIfNoEntry: false });
  if (markerStat?.isFile()) return;
  const entries = fs.readdirSync(scratch);
  const legacy =
    entries.every((e) => SCRATCH_ENTRY.test(e)) &&
    entries.some((e) => e === 'LATEST_OUT' || e === 'node_modules.sha256');
  if (markerStat || (entries.length > 0 && !legacy)) {
    throw new Error(
      `refusing to use scratch dir ${scratch}: it is not empty and has no ` +
        `${SCRATCH_MARKER} marker, so it may hold unrelated files. ` +
        'Point DEMO_SCRATCH_DIR at a new or empty directory.',
    );
  }
  fs.writeFileSync(
    marker,
    'Scratch root of scripts/demo/build-demo.ts. Everything here is ' +
      'deleted and rebuilt on each demo build.\n',
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** mkdir-based exclusive lock; a lock older than 15 minutes is stale. */
async function acquireLock(lockDir: string): Promise<() => void> {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.mkdirSync(lockDir);
      fs.writeFileSync(path.join(lockDir, 'owner'), `${process.pid}\n`);
      return () => fs.rmSync(lockDir, { recursive: true, force: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      let age = 0;
      try {
        age = Date.now() - fs.statSync(lockDir).mtimeMs;
      } catch {
        continue; // released between mkdir and stat
      }
      if (age > LOCK_STALE_MS) {
        log(`removing stale lock (${Math.round(age / 1000)} s old)`);
        fs.rmSync(lockDir, { recursive: true, force: true });
        continue;
      }
      if (attempt % 30 === 0) log('waiting for another demo build to finish…');
      await sleep(1000);
    }
  }
}

function sha256File(file: string): string {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(file))
    .digest('hex');
}

/** Refresh <scratch>/repo from the checkout, keeping node_modules if current. */
function syncCopy(scratch: string, copy: string): void {
  if (fs.lstatSync(copy, { throwIfNoEntry: false })?.isSymbolicLink()) {
    throw new Error(`${copy} is a symlink; refusing to delete through it`);
  }
  fs.mkdirSync(copy, { recursive: true });
  for (const entry of fs.readdirSync(copy)) {
    if (entry === 'node_modules') continue;
    fs.rmSync(path.join(copy, entry), { recursive: true, force: true });
  }
  const listed = execFileSync(
    'git',
    ['ls-files', '-z', '-co', '--exclude-standard'],
    { cwd: REPO, maxBuffer: 64 * 1024 * 1024 },
  )
    .toString('utf8')
    .split('\0')
    .filter((f) => f !== '' && fs.existsSync(path.join(REPO, f)));
  execFileSync(
    'rsync',
    ['-a', '--from0', `--files-from=-`, `${REPO}/`, `${copy}/`],
    { input: `${listed.join('\0')}\0`, stdio: ['pipe', 'inherit', 'inherit'] },
  );
  log(`copied ${listed.length} files into ${copy}`);

  const lockHash = sha256File(path.join(REPO, 'pnpm-lock.yaml'));
  const hashFile = path.join(scratch, 'node_modules.sha256');
  const recorded = fs.existsSync(hashFile)
    ? fs.readFileSync(hashFile, 'utf8').trim()
    : null;
  const nm = path.join(copy, 'node_modules');
  if (!fs.existsSync(nm) || recorded !== lockHash) {
    log('copying node_modules (lockfile changed or first build)…');
    fs.rmSync(nm, { recursive: true, force: true });
    execFileSync('cp', [
      '-a',
      '--reflink=auto',
      path.join(REPO, 'node_modules'),
      nm,
    ]);
    fs.writeFileSync(hashFile, `${lockHash}\n`);
  }
}

/**
 * The env for the demo `next build`: the next.config.ts build marker, no
 * NEXT_DIST_DIR and no app secrets
 * (DISCOGS_*, ANTHROPIC_*, SECRETS_FILE), so nothing secret can be inlined.
 */
export function buildEnv(base: EnvMap): EnvMap {
  const env: EnvMap = {
    ...base,
    NEXT_PUBLIC_DEMO: '1',
    NEXT_TELEMETRY_DISABLED: '1',
    // next.config.ts refuses a demo config without this marker (WR-05).
    DEMO_BUILD_VIA_SCRIPT: '1',
  };
  for (const name of Object.keys(env)) {
    if (/^(DISCOGS_|ANTHROPIC_)/.test(name) || name === 'SECRETS_FILE') {
      delete env[name];
    }
  }
  delete env.NEXT_DIST_DIR;
  return env;
}

function runBuild(cwd: string): Promise<void> {
  const env = buildEnv(process.env) as NodeJS.ProcessEnv;
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build'],
      { cwd, env, stdio: 'inherit' },
    );
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`next build exited ${code}`));
    });
  });
}

/** Copy committed demo assets (when present) into out/demo-assets. */
function copyAssets(root: string, outDir: string): void {
  const assets = path.join(root, 'demo', 'assets');
  if (!fs.existsSync(assets)) {
    log('no demo/assets yet; skipping the asset copy');
    return;
  }
  fs.cpSync(assets, path.join(outDir, 'demo-assets'), { recursive: true });
  log('copied demo/assets → out/demo-assets');
}

/**
 * After each build: copy the assets, then run every verify-export rule.
 * The secrets scan reads the ORIGINAL checkout's secrets file ($SECRETS_FILE
 * or secrets.json, as the app resolves it; the scratch copy never has one)
 * and the DISCOGS_* and ANTHROPIC_API_KEY env values, so a leaked value fails
 * the build (T-05-01). In CI, where neither exists, the secret-shaped
 * patterns still run.
 */
async function afterBuild(root: string, outDir: string): Promise<void> {
  copyAssets(root, outDir);
  const ok = reportVerify(
    verifyExport({
      outDir,
      nextDir: path.join(root, '.next'),
      secretsPath: resolveSecretsPath(REPO),
      repoRoot: root,
    }),
  );
  if (!ok)
    throw new Error('verify-export failed; the export is not publishable');
}

export function pruneOuts(scratch: string): void {
  const outs = fs
    .readdirSync(scratch)
    .filter((e) => OUT_ENTRY.test(e))
    .map((e) => ({ e, t: fs.statSync(path.join(scratch, e)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { e } of outs.slice(KEEP_OUTS)) {
    fs.rmSync(path.join(scratch, e), { recursive: true, force: true });
  }
}

async function buildInPlace(): Promise<string> {
  if (process.env.CI !== 'true') {
    console.error(
      '[build-demo] refused: --in-place runs `next build` in this checkout, ' +
        "which wipes the owner's real .next build (D-20). It is only allowed " +
        'in CI (CI=true). Run without --in-place to build in a scratch copy.',
    );
    process.exit(1);
  }
  await runBuild(REPO);
  const outDir = path.join(REPO, 'out');
  await afterBuild(REPO, outDir);
  return outDir;
}

async function buildInScratch(): Promise<string> {
  const scratch = scratchRoot();
  claimScratch(scratch);
  const release = await acquireLock(path.join(scratch, 'lock'));
  try {
    const copy = path.join(scratch, 'repo');
    syncCopy(scratch, copy);
    await runBuild(copy);
    const built = path.join(copy, 'out');
    await afterBuild(copy, built);
    const outDir = path.join(scratch, `out-${process.pid}-${Date.now()}`);
    fs.cpSync(built, outDir, { recursive: true });
    fs.writeFileSync(path.join(scratch, 'LATEST_OUT'), `${outDir}\n`);
    pruneOuts(scratch);
    return outDir;
  } finally {
    release();
  }
}

async function main(): Promise<void> {
  const inPlace = process.argv.slice(2).includes('--in-place');
  const outDir = inPlace ? await buildInPlace() : await buildInScratch();
  console.log(`DEMO_OUT=${outDir}`);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`[build-demo] FAILED: ${(err as Error).message}`);
    process.exit(1);
  });
}
