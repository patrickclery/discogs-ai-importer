'use client';

import { useQueryState } from 'nuqs';
import { CardLayoutToggle } from '@/components/card-layout-toggle';
import { RetryAllFailedButton } from '@/components/retry-all-failed-button';
import { Count, ReviewStatusFilter } from '@/components/review-status-filter';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Toggle } from '@/components/ui/toggle';
import type { PhotoOption, SpinesResponse } from '@/lib/scan-types';

/** Select value meaning every photo (Radix Select items cannot be empty). */
const ALL_PHOTOS = '__all__';

/**
 * SelectItem makes its ItemText span a flex box whose min-width:auto stops
 * the inner truncate span from shrinking, so a long name was clipped with
 * no ellipsis (G-04-7). min-w-0 lets it shrink.
 */
export const PHOTO_OPTION_ITEM_CLASS = '*:[span]:last:min-w-0';

/** Props for one photo row: its value, the full name on hover, the shrink class. */
export function photoOptionItemProps(p: Pick<PhotoOption, 'id' | 'filename'>) {
  return {
    value: p.id,
    title: p.filename,
    className: PHOTO_OPTION_ITEM_CLASS,
  };
}

/** `?review=1` is Needs review; anything else is All (T-02-28). */
export function useReviewFilter() {
  const [raw, setRaw] = useQueryState('review');
  const review = raw === '1';
  const setReview = (on: boolean) => setRaw(on ? '1' : null);
  return [review, setReview] as const;
}

/** `?photo={id}`, or null for every photo. */
export function usePhotoFilter() {
  const [raw, setRaw] = useQueryState('photo', { scroll: true });
  const photo = raw || null;
  const setPhoto = (id: string | null) => setRaw(id);
  return [photo, setPhoto] as const;
}

/**
 * The /spines filter bar (D-07, D-11, UI-SPEC /spines filter bar), two rows.
 * Row 1: the status filter with a count per status. Row 2: the standalone
 * Needs review toggle (ANDs with the status), the photo Select, then a
 * right-aligned group: Retry all failed while any spine in view failed
 * (D-13) and the Compact / Detailed layout toggle, always last (Phase 6
 * D-13). The filters and the layout live in the URL through nuqs, so a
 * reload keeps them. Not sticky.
 */
export function SpinesFilterBar({
  counts,
  photoOptions,
}: {
  counts: SpinesResponse['counts'];
  photoOptions: readonly PhotoOption[];
}) {
  const [review, setReview] = useReviewFilter();
  const [photo, setPhoto] = usePhotoFilter();

  return (
    <div className="flex flex-col gap-2">
      <ReviewStatusFilter counts={counts} />
      <div className="flex flex-wrap items-center gap-2">
        <Toggle
          variant="outline"
          pressed={review}
          onPressedChange={(on) => void setReview(on)}
        >
          Needs review <Count n={counts.needsReview} />
        </Toggle>
        <Select
          value={photo ?? ALL_PHOTOS}
          onValueChange={(v) => void setPhoto(v === ALL_PHOTOS ? null : v)}
        >
          <SelectTrigger
            aria-label="Filter by photo"
            className="w-64 max-w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-w-[min(24rem,calc(100vw-2rem))]">
            <SelectItem value={ALL_PHOTOS}>All photos</SelectItem>
            {photoOptions.map((p) => (
              <SelectItem key={p.id} {...photoOptionItemProps(p)}>
                <span className="truncate">{p.filename}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          {counts.byStatus.failed > 0 ? (
            <RetryAllFailedButton photoId={photo} />
          ) : null}
          <CardLayoutToggle />
        </div>
      </div>
    </div>
  );
}
