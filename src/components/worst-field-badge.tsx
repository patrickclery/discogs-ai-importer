'use client';

import { TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { SpineDto } from '@/lib/scan-types';
import { worstFieldText } from '@/lib/spine-review';

/**
 * Card-level pointer to where to look (D-09): `Check {field} · {pct}%` for
 * the lowest-confidence unedited read, or `Hard to read` for an illegible
 * detection. Renders nothing when every field is fine. Warning colors the
 * icon only; the text stays foreground (contrast rule).
 */
export function WorstFieldBadge({
  spine,
  threshold,
}: {
  spine: Pick<SpineDto, 'fields' | 'legibility'>;
  threshold: number;
}) {
  const text = worstFieldText(spine, threshold);
  if (!text) return null;
  return (
    <Badge variant="outline">
      <TriangleAlert aria-hidden="true" className="text-warning" />
      {text}
    </Badge>
  );
}
