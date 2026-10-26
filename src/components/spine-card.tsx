import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { DismissSpineButton } from '@/components/dismiss-spine-button';
import { ReattachDialog } from '@/components/reattach-dialog';
import { SpineCrop } from '@/components/spine-crop';
import { SpineField } from '@/components/spine-field';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { WorstFieldBadge } from '@/components/worst-field-badge';
import type { SpineDto } from '@/lib/scan-types';
import { editedCount, spineNumber } from '@/lib/spine-review';
import { cn } from '@/lib/utils';
import type { SpineField as FieldName } from '@/lib/vision-contract';

/** UI-SPEC field grid: 6 columns at lg, 2 at sm, 1 below 640px. */
export const FIELD_SPANS: Record<FieldName, string> = {
  artist: 'lg:col-span-3',
  title: 'lg:col-span-3',
  format: 'lg:col-span-2',
  label: 'lg:col-span-2',
  catalog_number: 'lg:col-span-2',
  raw_text: 'sm:col-span-2 lg:col-span-6',
};

export const ORPHAN_EXPLANATION =
  "The latest re-scan didn't find this spine. Your edits are kept until you re-attach or dismiss it.";

/**
 * The orphaned card's footer (D-11, D-16): explanation left, actions right.
 * Exported so a caller passing its own footer can compose it first (RESEARCH
 * Pitfall 3); SpineCard still falls back to it when no footer is given.
 */
export function OrphanFooter({ spine }: { spine: SpineDto }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <p className="font-prose text-xs text-muted-foreground sm:flex-1">
        {ORPHAN_EXPLANATION}
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ReattachDialog spine={spine} />
        <DismissSpineButton spine={spine} />
      </div>
    </div>
  );
}

/**
 * One spine (D-08, D-11): header row with `#n` and a right-aligned status
 * slot, the crop on top, Claude's read below, and an optional footer slot that
 * renders nothing, not even its separator, when empty. The status slot shows
 * `Edited · {n}` when the owner changed n fields. An orphaned spine (D-16)
 * adds the "No longer detected" badge, a warning border and the Re-attach /
 * Dismiss footer. Field values are input values only (T-02-20).
 * Featured (the one card in focus) or mini surface, with an lg corner number.
 */
export function SpineCard({
  spine,
  threshold,
  leading,
  badges,
  statusSlot,
  footer,
  featured = false,
}: {
  spine: SpineDto;
  /** The confidence_threshold setting (D-09). */
  threshold: number;
  /** First in the header, before `#n` (the bulk select checkbox, D-05). */
  leading?: ReactNode;
  /** Left of the header, after `#n` and the worst-field badge. */
  badges?: ReactNode;
  statusSlot?: ReactNode;
  footer?: ReactNode;
  /** The expanded compact card is featured; every other card is mini. */
  featured?: boolean;
}) {
  const number = spineNumber(spine);
  const rawText =
    spine.fields.find((f) => f.field === 'raw_text')?.value ?? null;
  const edited = editedCount(spine.fields);
  const orphaned = spine.state === 'orphaned';
  const status =
    edited > 0 || orphaned || statusSlot ? (
      <>
        {edited > 0 ? (
          <Badge variant="secondary">{`Edited · ${edited}`}</Badge>
        ) : null}
        {orphaned ? (
          <Badge variant="outline">
            <TriangleAlert aria-hidden="true" className="text-warning" />
            No longer detected
          </Badge>
        ) : null}
        {statusSlot}
      </>
    ) : null;
  const shownFooter =
    footer ?? (orphaned ? <OrphanFooter spine={spine} /> : null);
  return (
    <Card
      id={`spine-card-${spine.id}`}
      data-spine-card={spine.id}
      variant={featured ? 'featured' : 'mini'}
      className={cn('gap-4 rounded-xl p-4', orphaned && 'border-warning/60')}
    >
      <div className="flex items-center gap-2 text-xs">
        {leading}
        <WorstFieldBadge spine={spine} threshold={threshold} />
        {badges}
        {status ? (
          <div className="ml-auto flex items-center gap-2">{status}</div>
        ) : null}
      </div>
      <SpineCrop crop={spine.crop} number={number} rawText={rawText} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {spine.fields.map((f) => (
          <SpineField
            key={f.field}
            spineId={spine.id}
            field={f}
            threshold={threshold}
            className={FIELD_SPANS[f.field]}
          />
        ))}
      </div>
      {shownFooter ? (
        <>
          <Separator />
          {shownFooter}
        </>
      ) : null}
    </Card>
  );
}
