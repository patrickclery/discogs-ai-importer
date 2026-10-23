import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SECRET_ENV_NAMES } from '@/server/secrets';
import { buildEnv } from '../../scripts/demo/build-demo.ts';
import {
  resolveSecretsPath,
  SECRET_ENV_VARS,
  SERVER_ACTION_RE,
  verifyExport,
} from '../../scripts/demo/verify-export.ts';

// verify-export rules on a tiny synthetic export (WR-03): the secret scan
// covers the secrets file, env values and secret-shaped patterns, and never
// prints a value.

let root: string;
let outDir: string;
let nextDir: string;
let repoRoot: string;

function write(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function run(extra: Partial<Parameters<typeof verifyExport>[0]> = {}) {
  return verifyExport({
    outDir,
    nextDir,
    secretsPath: null,
    repoRoot,
    env: {},
    ...extra,
  });
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-verify-export-'));
  outDir = path.join(root, 'out');
  nextDir = path.join(root, '.next');
  repoRoot = path.join(root, 'repo');
  fs.mkdirSync(path.join(repoRoot, 'src', 'app'), { recursive: true });
  write(path.join(outDir, '404.html'), '<html></html>');
  write(path.join(outDir, '_next', 'app.js'), 'console.log("demo");');
  write(
    path.join(nextDir, 'server', 'middleware-manifest.json'),
    JSON.stringify({ middleware: {} }),
  );
  write(
    path.join(nextDir, 'server', 'server-reference-manifest.json'),
    JSON.stringify({ node: {}, edge: {} }),
  );
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('verifyExport rule h (secrets)', () => {
  it('passes a clean export and reports how many values it scanned', () => {
    const r = run();
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.secretValues).toBe(0);
  });

  it('fails on a secret-shaped string without printing it (CI path)', () => {
    const token = `sk-ant-${'Ab3_'.repeat(8)}`;
    write(path.join(outDir, '_next', 'leak.js'), `const k="${token}";`);
    const r = run();
    expect(r.ok).toBe(false);
    expect(r.failures).toEqual([
      '[h] out/_next/leak.js contains a secret-shaped string (Anthropic API key)',
    ]);
    expect(r.failures.join('\n')).not.toContain(token);
  });

  it('fails on a DISCOGS_* env value found in the export', () => {
    const secret = 'zq9consumersecret';
    write(path.join(outDir, '_next', 'leak.js'), `x="${secret}"`);
    const r = run({ env: { DISCOGS_CONSUMER_SECRET: secret } });
    expect(r.ok).toBe(false);
    expect(r.failures).toEqual([
      '[h] secret value of env DISCOGS_CONSUMER_SECRET found in out/_next/leak.js',
    ]);
    expect(r.failures.join('\n')).not.toContain(secret);
  });

  it('scans secrets-file values down to 4 characters', () => {
    const secrets = path.join(root, 'elsewhere', 'my-secrets.json');
    write(secrets, JSON.stringify({ discogsAuth: { username: 'qzxw' } }));
    write(path.join(outDir, '_next', 'leak.js'), 'u="qzxw"');
    const r = run({ secretsPath: secrets });
    expect(r.failures).toEqual([
      '[h] secret value of key discogsAuth.username found in out/_next/leak.js',
    ]);
  });
});

describe('secret sources', () => {
  it('lists every app secret env var', () => {
    for (const name of Object.values(SECRET_ENV_NAMES)) {
      expect(SECRET_ENV_VARS).toContain(name);
    }
  });

  it('resolves the secrets file like the app (SECRETS_FILE first)', () => {
    expect(resolveSecretsPath('/repo', {})).toBe('/repo/secrets.json');
    expect(resolveSecretsPath('/repo', { SECRETS_FILE: 'conf/s.json' })).toBe(
      '/repo/conf/s.json',
    );
    expect(resolveSecretsPath('/repo', { SECRETS_FILE: '/etc/s.json' })).toBe(
      '/etc/s.json',
    );
  });

  it('keeps app secrets out of the demo next build env', () => {
    const env = buildEnv({
      PATH: '/bin',
      DISCOGS_CONSUMER_KEY: 'k',
      DISCOGS_CONSUMER_SECRET: 's',
      ANTHROPIC_API_KEY: 'a',
      SECRETS_FILE: '/x.json',
      NEXT_DIST_DIR: '.next/verify',
    });
    expect(env).toMatchObject({
      PATH: '/bin',
      NEXT_PUBLIC_DEMO: '1',
      NEXT_TELEMETRY_DISABLED: '1',
    });
    for (const k of [
      'DISCOGS_CONSUMER_KEY',
      'DISCOGS_CONSUMER_SECRET',
      'ANTHROPIC_API_KEY',
      'SECRETS_FILE',
      'NEXT_DIST_DIR',
    ]) {
      expect(env).not.toHaveProperty(k);
    }
  });
});

describe('verifyExport rules c and d (server code, WR-04)', () => {
  it('fails when the server-reference manifest is missing', () => {
    fs.rmSync(path.join(nextDir, 'server', 'server-reference-manifest.json'));
    const r = run();
    expect(r.ok).toBe(false);
    expect(r.failures).toEqual([
      expect.stringMatching(
        /^\[c\] server-reference manifest missing or unreadable at /,
      ),
    ]);
  });

  it('fails when the server-reference manifest lists an action', () => {
    write(
      path.join(nextDir, 'server', 'server-reference-manifest.json'),
      JSON.stringify({ node: { abc: {} }, edge: {} }),
    );
    expect(run().failures).toEqual([
      '[c] server-reference manifest not empty (server actions in the build)',
    ]);
  });

  it('flags server action calls in any minifier shape', () => {
    for (const code of [
      '(0,i.createServerReference)("405aa61632f785417f94a0fff395184c014029b196",i.callServer)',
      "(0, u.createServerReference)( 'abc', u.callServer)",
      'createServerReference(id,callServer,void 0,findSourceMapURL,"save")',
      '(0,x.createServerReference) (actionId)',
    ]) {
      expect(SERVER_ACTION_RE.test(code), code).toBe(true);
    }
  });

  it("ignores React's own definition and re-export of createServerReference", () => {
    for (const code of [
      'n.createServerReference=function(e,t){function n(){}}',
      'createServerReference:function(){return l.createServerReference},findSourceMapURL',
    ]) {
      expect(SERVER_ACTION_RE.test(code), code).toBe(false);
    }
  });

  it('fails a bundle with a server action call or server-only imports', () => {
    write(
      path.join(outDir, '_next', 'action.js'),
      '(0,i.createServerReference)("405aa61632f785417f94a0fff395184c014029b196",i.callServer)',
    );
    write(path.join(outDir, '_next', 'server.js'), 'require("node:fs")');
    write(path.join(outDir, '_next', 'only.js'), 'import "server-only"');
    expect(run().failures.sort()).toEqual(
      [
        "[d] out/_next/only.js contains 'server-only'",
        "[d] out/_next/server.js contains 'node:fs'",
        '[d] out/_next/action.js contains a server action reference',
      ].sort(),
    );
  });
});
