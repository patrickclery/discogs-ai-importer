'use client';

import type { BulkStartBody, BulkStartResponse } from '@/lib/bulk-types';
import type { SpineDto } from '@/lib/scan-types';

export type BulkPick = Pick<SpineDto, 'id' | 'discogs'>;

export function bulkStartBody(_spines: readonly BulkPick[]): BulkStartBody {
  return { items: [] };
}

export type StartResult =
  | { ok: true; response: BulkStartResponse }
  | { ok: false; reason: string };

export async function startBulkImport(
  _spines: readonly BulkPick[],
): Promise<StartResult> {
  return { ok: false, reason: '' };
}

export function BulkImportDialog(_props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spines: SpineDto[];
  folderName: string;
  country: string;
  threshold: number;
  onStarted: (r: BulkStartResponse) => void;
}) {
  return null;
}
