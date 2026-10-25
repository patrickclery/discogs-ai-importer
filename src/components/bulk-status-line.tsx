'use client';

import type { BulkStatusKind } from '@/lib/bulk-copy';
import type { SpineDto } from '@/lib/scan-types';

/** The card's one bulk status line (UI-SPEC Status line). */
export function BulkStatusLine(_props: {
  spine: SpineDto;
  kinds?: ReadonlyArray<BulkStatusKind>;
}) {
  return null;
}
