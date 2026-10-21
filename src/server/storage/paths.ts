import 'server-only';
import fs from 'node:fs';
import path from 'node:path';

/** Data-folder layout: D-04, plus the Discogs cover cache (Phase 3 D-13). */
export const SUBDIRS = [
  'photos',
  'vision',
  'crops',
  'thumbs',
  'backups',
  'discogs-thumbs',
] as const;

/**
 * The single authority on the absolute data root (D-05).
 * DATA_DIR unset or empty -> <cwd>/data; relative values resolve against cwd.
 * Evaluated on every call so env changes are picked up.
 */
export function dataRoot(): string {
  return path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    process.env.DATA_DIR || 'data',
  );
}

export function dbFile(): string {
  return path.join(dataRoot(), 'app.db');
}

export function ensureDataDirs(): void {
  const root = dataRoot();
  for (const dir of SUBDIRS) {
    fs.mkdirSync(path.join(/* turbopackIgnore: true */ root, dir), {
      recursive: true,
    });
  }
}

/**
 * The only way to turn a stored relative path into an absolute one (D-05).
 * Rejects absolute input, `..` escapes and sibling folders that merely share
 * the root's name prefix (e.g. ../data-evil when the root is .../data).
 */
export function resolveData(rel: string): string {
  if (path.isAbsolute(rel)) throw new Error('path escapes DATA_DIR');
  const root = dataRoot();
  const abs = path.resolve(/* turbopackIgnore: true */ root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error('path escapes DATA_DIR');
  }
  return abs;
}
