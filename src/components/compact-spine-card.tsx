'use client';

import {
  CircleSlash,
  CircleX,
  Clock,
  type LucideIcon,
  SearchX,
  TriangleAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { ImportStateBadge } from '@/components/import-state-badge';
import { SpineCrop } from '@/components/spine-crop';
import { TopMatchRow } from '@/components/top-match-row';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { WorstFieldBadge } from '@/components/worst-field-badge';
import { candidateThumbSrc } from '@/lib/asset-urls';
import { MATCH_PLACEHOLDERS, matchSlotOf } from '@/lib/bulk-copy';
import type { SpineDto } from '@/lib/scan-types';
import { editedCount, spineNumber } from '@/lib/spine-review';
import { cn } from '@/lib/utils';

/** The 16px icon before a match-slot placeholder (UI-SPEC Match slot). */
const PLACEHOLDER_ICONS: Record<string, LucideIcon> = {
  [MATCH_PLACEHOLDERS.notSearched]: Clock,
  [MATCH_PLACEHOLDERS.noMatch]: SearchX,
  [MATCH_PLACEHOLDERS.failed]: CircleX,
  [MATCH_PLACEHOLDERS.marked]: CircleSlash,
};

function PlaceholderLine({ text }: { text: string }) {
  const Icon = PLACEHOLDER_ICONS[text];
  return (
    <p className="flex items-start gap-1 text-xs text-muted-foreground">
      {text === MATCH_PLACEHOLDERS.searching || !Icon ? (
        <Spinner aria-hidden="true" role="presentation" className="size-4" />
      ) : (
        <Icon aria-hidden="true" className="size-4 shrink-0" />
      )}
      <span className="min-w-0">{text}</span>
    </p>
  );
}

/**
 * One spine in the compact grid (D-10, D-16, UI-SPEC Compact card): the
 * header (#n, the worst-field badge, Edited, the orphan badge and the state
 * badge last), the spine crop, then directly under it the top or confirmed
 * match. No field inputs, external link or Add button while collapsed: those
 * live in the full card (D-11).
 */
export function CompactSpineCard({
  spine,
  threshold,
}: {
  spine: SpineDto;
  /** The confidence_threshold setting (D-09). */
  threshold: number;
  renderFull?: (trailing: ReactNode) => ReactNode;
}) {
  const number = spineNumber(spine);
  const rawText =
    spine.fields.find((f) => f.field === 'raw_text')?.value ?? null;
  const edited = editedCount(spine.fields);
  const orphaned = spine.state === 'orphaned';
  const slot = matchSlotOf(spine);
  const match = slot.match;
  const thumbSrc =
    match?.hasThumb && match.candidateId
      ? candidateThumbSrc({ id: match.candidateId, releaseId: match.releaseId })
      : null;
  return (
    <Card
      id={`spine-card-${spine.id}`}
      data-spine-card={spine.id}
      className={cn('gap-2 rounded-xl p-4', orphaned && 'border-warning/60')}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="font-mono text-muted-foreground tabular-nums">
          #{number}
        </span>
        <WorstFieldBadge spine={spine} threshold={threshold} />
        {edited > 0 ? (
          <Badge variant="secondary">{`Edited · ${edited}`}</Badge>
        ) : null}
        {orphaned ? (
          <Badge variant="outline">
            <TriangleAlert aria-hidden="true" className="text-warning" />
            No longer detected
          </Badge>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <ImportStateBadge spine={spine} />
        </div>
      </div>
      <SpineCrop crop={spine.crop} number={number} rawText={rawText} />
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-muted-foreground">
          {slot.label}
        </p>
        {match ? (
          <TopMatchRow
            title={match.title}
            details={match.details}
            thumbSrc={thumbSrc}
          />
        ) : (
          <PlaceholderLine text={slot.placeholder ?? ''} />
        )}
      </div>
    </Card>
  );
}
