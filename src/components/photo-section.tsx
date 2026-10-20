'use client';

import { CircleX, ImageIcon, ScanSearch } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DensityBadge, IncompleteBadge } from '@/components/density-badge';
import { PhotoStatusBadge } from '@/components/photo-status-badge';
import { RescanButton } from '@/components/rescan-button';
import { SpineCard } from '@/components/spine-card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { isActiveStatus, pluralize, statusView } from '@/lib/photo-status';
import type { PhotoDto, SpineDto } from '@/lib/scan-types';
import { formatRelativeTime } from '@/lib/spine-review';

/** Current time, refreshed every `intervalMs` (the m:ss timer, "scanned …"). */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** `{n} spines · {model label} · scanned {relative time}`, or the live status. */
export function sectionSubline(photo: PhotoDto, now: number): string {
  if (isActiveStatus(photo.status)) return statusView(photo, now).subline;
  const count =
    photo.status === 'done' && photo.spineCount === 0
      ? 'No CDs found'
      : pluralize(photo.spineCount, 'spine', 'spines');
  const scanned =
    photo.finishedAt === null
      ? null
      : `scanned ${formatRelativeTime(photo.finishedAt, now)}`;
  return [count, photo.modelLabel, scanned].filter(Boolean).join(' · ');
}

/** 40px thumbnail, linked to the image Claude saw once there is one. */
function SectionThumb({ photo }: { photo: PhotoDto }) {
  const thumb = photo.thumbUrl ? (
    // biome-ignore lint/performance/noImgElement: thumbs stream from a route handler; next/image would re-encode them
    <img
      src={photo.thumbUrl}
      alt=""
      width={40}
      height={40}
      loading="lazy"
      decoding="async"
      className="size-10 rounded-md bg-muted object-cover"
    />
  ) : (
    <div className="flex size-10 items-center justify-center rounded-md bg-muted">
      <ImageIcon aria-hidden="true" className="size-4 text-muted-foreground" />
    </div>
  );
  if (!photo.visionUrl) return <div className="shrink-0">{thumb}</div>;
  return (
    <a
      href={photo.visionUrl}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open full photo ${photo.filename}`}
      className="shrink-0 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {thumb}
    </a>
  );
}

function CardSkeletons() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}

function SectionBody({
  photo,
  spines,
  threshold,
}: {
  photo: PhotoDto;
  spines: SpineDto[];
  threshold: number;
}) {
  // First run still working: nothing to show yet. A re-scan that is still
  // analyzing keeps the existing (editable) cards under the header's
  // Analyzing badge; the merged cards replace them with the same keys.
  if (isActiveStatus(photo.status) && spines.length === 0) {
    return <CardSkeletons />;
  }
  const failed = photo.status === 'error';
  const rescanFailed = failed && photo.runNo > 1 && photo.hasEarlierScan;
  const alert = failed ? (
    <Alert variant="destructive">
      <CircleX aria-hidden="true" />
      <AlertTitle>
        {rescanFailed
          ? 'Re-scan failed. Showing the previous scan.'
          : 'Scan failed'}
      </AlertTitle>
      <AlertDescription>
        {photo.errorReason ?? 'Scan failed. Re-scan to try again.'}
      </AlertDescription>
    </Alert>
  ) : null;

  if (photo.status === 'done' && spines.length === 0) {
    return (
      <Empty className="py-8 md:py-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ScanSearch className="size-5" />
          </EmptyMedia>
          <EmptyTitle className="text-base font-medium">
            No CDs found
          </EmptyTitle>
          <EmptyDescription>
            Claude didn't find any CD spines in this photo. Re-scan it, or
            photograph the shelf closer.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      {alert}
      {spines.map((spine) => (
        <SpineCard key={spine.id} spine={spine} threshold={threshold} />
      ))}
    </>
  );
}

/**
 * One photo on /spines (D-07): a header that sticks under the app header
 * until the next section pushes it out, then the section body for the
 * photo's state (first-run skeletons, error Alert, No CDs found, or cards).
 */
export function PhotoSection({
  photo,
  spines,
  threshold,
}: {
  photo: PhotoDto;
  spines: SpineDto[];
  /** The confidence_threshold setting (D-09). */
  threshold: number;
}) {
  const headingId = `photo-${photo.id}`;
  const now = useNow(photo.status === 'calling' ? 1000 : 30_000);
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="sticky top-14 z-30 flex items-center gap-2 border-b bg-background/95 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <SectionThumb photo={photo} />
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 flex-col">
            <h2
              id={headingId}
              className="truncate text-sm font-medium"
              title={photo.filename}
            >
              {photo.filename}
            </h2>
            <p
              className="truncate text-xs text-muted-foreground"
              suppressHydrationWarning
            >
              {sectionSubline(photo, now)}
            </p>
          </div>
          {photo.status !== 'done' ||
          photo.densityFlags.length > 0 ||
          photo.truncated ? (
            <div className="flex flex-wrap items-center gap-2">
              {photo.status !== 'done' ? (
                <PhotoStatusBadge status={photo.status} />
              ) : null}
              {photo.densityFlags.length > 0 ? <DensityBadge /> : null}
              {photo.truncated ? <IncompleteBadge photo={photo} /> : null}
            </div>
          ) : null}
        </div>
        <div className="shrink-0 self-start sm:self-center">
          <RescanButton
            photoId={photo.id}
            filename={photo.filename}
            active={isActiveStatus(photo.status)}
            compactOnMobile
          />
        </div>
      </div>
      <SectionBody photo={photo} spines={spines} threshold={threshold} />
    </section>
  );
}
