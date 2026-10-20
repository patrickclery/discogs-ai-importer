'use client';

import { useQueryState } from 'nuqs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { PhotoOption, SpinesResponse } from '@/lib/scan-types';

/** Select value meaning every photo (Radix Select items cannot be empty). */
const ALL_PHOTOS = '__all__';

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

function Count({ n }: { n: number }) {
  return (
    <span className="font-mono tabular-nums text-muted-foreground">{n}</span>
  );
}

/**
 * The /spines filter bar (D-07, UI-SPEC /spines item 2): the All / Needs
 * review toggle with counts, and the photo Select. Both live in the URL
 * through nuqs, so a reload keeps them. Not sticky.
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
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        type="single"
        variant="outline"
        aria-label="Filter spines"
        value={review ? 'review' : 'all'}
        onValueChange={(v) => {
          // Never empty: clicking the pressed item keeps it pressed.
          if (v === 'all' || v === 'review') void setReview(v === 'review');
        }}
      >
        <ToggleGroupItem value="all">
          All <Count n={counts.all} />
        </ToggleGroupItem>
        <ToggleGroupItem value="review">
          Needs review <Count n={counts.needsReview} />
        </ToggleGroupItem>
      </ToggleGroup>
      <Select
        value={photo ?? ALL_PHOTOS}
        onValueChange={(v) => void setPhoto(v === ALL_PHOTOS ? null : v)}
      >
        <SelectTrigger aria-label="Filter by photo" className="w-64 max-w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-w-[min(24rem,calc(100vw-2rem))]">
          <SelectItem value={ALL_PHOTOS}>All photos</SelectItem>
          {photoOptions.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              <span className="truncate">{p.filename}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
