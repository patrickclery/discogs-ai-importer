import type { ReactNode } from 'react';
import { SpineCrop } from '@/components/spine-crop';
import { SpineField } from '@/components/spine-field';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { SpineDto } from '@/lib/scan-types';
import { editedCount, spineNumber } from '@/lib/spine-review';
import type { SpineField as FieldName } from '@/lib/vision-contract';

export const FIELD_LABELS: Record<FieldName, string> = {
  artist: 'Artist',
  title: 'Title',
  format: 'Format',
  label: 'Label',
  catalog_number: 'Catalog number',
  raw_text: 'Raw text',
};

/** UI-SPEC field grid: 6 columns at lg, 2 at sm, 1 below 640px. */
export const FIELD_SPANS: Record<FieldName, string> = {
  artist: 'lg:col-span-3',
  title: 'lg:col-span-3',
  format: 'lg:col-span-2',
  label: 'lg:col-span-2',
  catalog_number: 'lg:col-span-2',
  raw_text: 'sm:col-span-2 lg:col-span-6',
};

/**
 * One spine (D-08, D-11): header row with `#n` and a right-aligned status
 * slot, the crop on top, Claude's read below, and an optional footer slot that
 * renders nothing, not even its separator, when empty. The status slot shows
 * `Edited · {n}` when the owner changed n fields. Field values are input
 * values only (T-02-20).
 */
export function SpineCard({
  spine,
  badges,
  statusSlot,
  footer,
}: {
  spine: SpineDto;
  /** Left of the header, after `#n` (02-09 worst-field badge). */
  badges?: ReactNode;
  statusSlot?: ReactNode;
  footer?: ReactNode;
}) {
  const number = spineNumber(spine);
  const rawText =
    spine.fields.find((f) => f.field === 'raw_text')?.value ?? null;
  const edited = editedCount(spine.fields);
  const status =
    edited > 0 || statusSlot ? (
      <>
        {edited > 0 ? (
          <Badge variant="secondary">{`Edited · ${edited}`}</Badge>
        ) : null}
        {statusSlot}
      </>
    ) : null;
  return (
    <Card className="gap-4 rounded-xl p-4">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-mono text-muted-foreground tabular-nums">
          #{number}
        </span>
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
            label={FIELD_LABELS[f.field]}
            className={FIELD_SPANS[f.field]}
          />
        ))}
      </div>
      {footer ? (
        <>
          <Separator />
          {footer}
        </>
      ) : null}
    </Card>
  );
}
