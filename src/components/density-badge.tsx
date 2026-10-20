'use client';

import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { incompleteTooltip } from '@/lib/photo-status';
import type { PhotoDto } from '@/lib/scan-types';

const DENSITY_TOOLTIP =
  'Spines in this photo are small or overlapping, so misreads are more likely. For better reads, photograph narrower sections and upload them.';

/**
 * Outline warning badge as a focusable tooltip trigger (UI-SPEC). Warning
 * colors the icon only; the text stays foreground (contrast rule).
 */
function WarningBadge({
  children,
  tooltip,
}: {
  children: ReactNode;
  tooltip: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Badge variant="outline">
            <TriangleAlert aria-hidden="true" className="text-warning" />
            {children}
          </Badge>
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/** D-03: the run has density flags (small, overlapping or too many spines). */
export function DensityBadge() {
  return <WarningBadge tooltip={DENSITY_TOOLTIP}>Retake closer</WarningBadge>;
}

/** The run returned under 80% of Claude's own spine estimate. */
export function IncompleteBadge({
  photo,
}: {
  photo: Pick<PhotoDto, 'spineCountEstimate' | 'detectedCount' | 'spineCount'>;
}) {
  return (
    <WarningBadge tooltip={incompleteTooltip(photo)}>
      May be incomplete
    </WarningBadge>
  );
}
