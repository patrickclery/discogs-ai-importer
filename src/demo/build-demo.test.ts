import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  claimScratch,
  pruneOuts,
  SCRATCH_MARKER,
} from '../../scripts/demo/build-demo.ts';

// WR-06: build-demo.ts deletes only inside a scratch root it owns.

let root: string;
let repo: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-build-demo-'));
  repo = path.join(root, 'checkout');
  fs.mkdirSync(repo);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const marked = (dir: string) => fs.existsSync(path.join(dir, SCRATCH_MARKER));

describe('claimScratch', () => {
  it('creates and marks a new scratch dir', () => {
    const scratch = path.join(root, 'new', 'scratch');
    claimScratch(scratch, repo);
    expect(marked(scratch)).toBe(true);
  });

  it('marks an existing empty dir and accepts a marked one', () => {
    const scratch = path.join(root, 'empty');
    fs.mkdirSync(scratch);
    claimScratch(scratch, repo);
    expect(marked(scratch)).toBe(true);
    fs.writeFileSync(path.join(scratch, 'anything'), 'x');
    expect(() => claimScratch(scratch, repo)).not.toThrow();
  });

  it('refuses a non-empty unmarked dir and leaves it untouched', () => {
    const scratch = path.join(root, 'home');
    fs.mkdirSync(path.join(scratch, 'repo'), { recursive: true });
    fs.writeFileSync(path.join(scratch, 'notes.txt'), 'keep me');
    expect(() => claimScratch(scratch, repo)).toThrow(
      /no \.discogs-demo-scratch marker/,
    );
    expect(marked(scratch)).toBe(false);
    expect(fs.readdirSync(scratch).sort()).toEqual(['notes.txt', 'repo']);
  });

  it('refuses a dir holding only an unrelated repo/ folder', () => {
    const scratch = path.join(root, 'projects');
    fs.mkdirSync(path.join(scratch, 'repo'), { recursive: true });
    expect(() => claimScratch(scratch, repo)).toThrow(/marker/);
  });

  it('adopts an unmarked dir with only an older build-demo layout', () => {
    const scratch = path.join(root, 'legacy');
    fs.mkdirSync(path.join(scratch, 'repo'), { recursive: true });
    fs.mkdirSync(path.join(scratch, 'out-123-1792751635827'));
    fs.writeFileSync(path.join(scratch, 'LATEST_OUT'), 'x\n');
    fs.writeFileSync(path.join(scratch, 'node_modules.sha256'), 'x\n');
    claimScratch(scratch, repo);
    expect(marked(scratch)).toBe(true);
  });

  it('refuses a marker that is not a regular file', () => {
    const scratch = path.join(root, 'odd');
    fs.mkdirSync(path.join(scratch, SCRATCH_MARKER), { recursive: true });
    expect(() => claimScratch(scratch, repo)).toThrow(/marker/);
  });

  it('refuses the repo, a dir inside it and an ancestor of it', () => {
    for (const scratch of [repo, path.join(repo, 'tmp'), root]) {
      expect(() => claimScratch(scratch, repo)).toThrow(/overlaps the repo/);
    }
    expect(marked(root)).toBe(false);
  });
});

describe('pruneOuts', () => {
  it('deletes only old out-<pid>-<time> entries', () => {
    const scratch = path.join(root, 'scratch');
    claimScratch(scratch, repo);
    const outs = ['out-1-1000', 'out-2-2000', 'out-3-3000', 'out-4-4000'];
    outs.forEach((name, i) => {
      const dir = path.join(scratch, name);
      fs.mkdirSync(dir);
      fs.utimesSync(dir, 1000 + i, 1000 + i);
    });
    fs.mkdirSync(path.join(scratch, 'out-of-band'));
    pruneOuts(scratch);
    expect(fs.readdirSync(scratch).sort()).toEqual(
      [
        SCRATCH_MARKER,
        'out-2-2000',
        'out-3-3000',
        'out-4-4000',
        'out-of-band',
      ].sort(),
    );
  });
});
