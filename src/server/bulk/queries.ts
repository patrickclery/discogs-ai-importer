import 'server-only';
import type Database from 'better-sqlite3';
import type { BulkItemDto, BulkRunDto } from '@/lib/bulk-types';
import type { SpineDto } from '@/lib/scan-types';

export function bulkForSpines(
  _db: Database.Database,
  _spines: readonly Pick<SpineDto, 'id' | 'photoId'>[],
): Map<string, BulkItemDto> {
  return new Map();
}

export function latestBulkRun(_db: Database.Database): BulkRunDto | null {
  return null;
}
