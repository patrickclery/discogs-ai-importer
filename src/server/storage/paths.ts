import 'server-only';
import fs from 'node:fs';
import path from 'node:path';

/** Data-folder layout, verbatim from D-04. */
export const SUBDIRS = [
  'photos',
  'vision',
  'crops',
  'thumbs',
  'backups',
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
