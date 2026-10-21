import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dataRoot, ensureDataDirs, resolveData, SUBDIRS } from './paths';

let previous: string | undefined;
beforeEach(() => {
  previous = process.env.DATA_DIR;
});
afterEach(() => {
  if (previous === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previous;
});

describe('dataRoot', () => {
  it('DATA_DIR unset resolves to <cwd>/data', () => {
    delete process.env.DATA_DIR;
    expect(dataRoot()).toBe(path.join(process.cwd(), 'data'));
  });

  it("DATA_DIR '' resolves to <cwd>/data", () => {
    process.env.DATA_DIR = '';
    expect(dataRoot()).toBe(path.join(process.cwd(), 'data'));
  });

  it('a relative DATA_DIR resolves against cwd', () => {
    process.env.DATA_DIR = 'tmp/my-data';
    expect(dataRoot()).toBe(path.join(process.cwd(), 'tmp', 'my-data'));
  });

  it('an absolute DATA_DIR is kept', () => {
    process.env.DATA_DIR = '/srv/discs/data';
    expect(dataRoot()).toBe('/srv/discs/data');
  });
});

describe('resolveData (D-05 traversal guard)', () => {
  beforeEach(() => {
    process.env.DATA_DIR = '/srv/discs/data';
  });

  it("'photos/a.jpg' resolves under the root", () => {
    expect(resolveData('photos/a.jpg')).toBe('/srv/discs/data/photos/a.jpg');
  });

  it("'.' returns the root itself", () => {
    expect(resolveData('.')).toBe('/srv/discs/data');
  });

  it("'photos/../crops/a' stays inside and is allowed", () => {
    expect(resolveData('photos/../crops/a')).toBe('/srv/discs/data/crops/a');
  });

  it.each([
    ['../x'],
    ['/etc/passwd'],
    ['../data-evil/f'],
    ['photos/../../data-evil'],
  ])('%s throws "path escapes DATA_DIR"', (rel) => {
    expect(() => resolveData(rel)).toThrow('path escapes DATA_DIR');
  });
});

describe('ensureDataDirs', () => {
  it('creates every SUBDIRS folder on a missing root and is idempotent', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-paths-'));
    try {
      const root = path.join(tmp, 'nested', 'data');
      process.env.DATA_DIR = root;
      expect(fs.existsSync(root)).toBe(false);
      ensureDataDirs();
      expect(fs.readdirSync(root).sort()).toEqual([...SUBDIRS].sort());
      ensureDataDirs();
      expect(fs.readdirSync(root).sort()).toEqual([...SUBDIRS].sort());
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
