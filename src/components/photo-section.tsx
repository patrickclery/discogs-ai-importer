'use client';

import { CircleX, ImageIcon, ScanSearch } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DensityBadge, IncompleteBadge } from '@/components/density-badge';
import { DiscogsMatches } from '@/components/discogs-matches';
import { PhotoStatusBadge } from '@/components/photo-status-badge';
import { RescanButton } from '@/components/rescan-button';
import { SearchStateBadge } from '@/components/search-state-badge';
import { OrphanFooter, SpineCard } from '@/components/spine-card';
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

/** Discogs connection state threaded from SpinesResponse.discogs. */
type DiscogsView = { connected: boolean; pausedUntil: number | null };

/**
 * A /spines card: the search-state badge last in the status slot, and a
 * footer holding the orphan row first (when orphaned, RESEARCH Pitfall 3)
 * and then the Discogs matches section, so every card offers its matches.
 */
function SpineView({
  spine,
  threshold,
  discogs,
}: {
  spine: SpineDto;
  threshold: number;
  discogs: DiscogsView;
}) {
  return (
    <SpineCard
      spine={spine}
      threshold={threshold}
      statusSlot={<SearchStateBadge discogs={spine.discogs} />}
      footer={
        <div className="flex flex-col gap-4">
          {spine.state === 'orphaned' ? <OrphanFooter spine={spine} /> : null}
          <DiscogsMatches
            spine={spine}
            connected={discogs.connected}
            pausedUntil={discogs.pausedUntil}
          />
        </div>
      }
    />
  );
}

function SectionBody({
  photo,
  spines,
  threshold,
  discogs,
}: {
  photo: PhotoDto;
  spines: SpineDto[];
  threshold: number;
  discogs: DiscogsView;
}) {
  const active = spines.filter((s) => s.state !== 'orphaned');
  const orphans = spines.filter((s) => s.state === 'orphaned');
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

  const noCds =
    photo.status === 'done' && active.length === 0 ? (
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
    ) : null;

  // D-16: spines the latest re-scan no longer found but that carry edits
  // follow the active cards under their own Caption sub-heading.
  const orphanList =
    orphans.length > 0 ? (
      <>
        <p className="pt-2 text-xs text-muted-foreground">
          {`No longer detected (${orphans.length})`}
        </p>
        {orphans.map((spine) => (
          <SpineView
            key={spine.id}
            spine={spine}
            threshold={threshold}
            discogs={discogs}
          />
        ))}
      </>
    ) : null;

  return (
    <>
      {alert}
      {noCds}
      {active.map((spine) => (
        <SpineView
          key={spine.id}
          spine={spine}
          threshold={threshold}
          discogs={discogs}
        />
      ))}
      {orphanList}
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
  connected,
  pausedUntil,
}: {
  photo: PhotoDto;
  spines: SpineDto[];
  /** The confidence_threshold setting (D-09). */
  threshold: number;
  /** Discogs is connected (D-04): cards say how to connect when not. */
  connected: boolean;
  /** The Discogs pause end (epoch ms), or null. */
  pausedUntil: number | null;
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
      <SectionBody
        photo={photo}
        spines={spines}
        threshold={threshold}
        discogs={{ connected, pausedUntil }}
      />
    </section>
  );
}
