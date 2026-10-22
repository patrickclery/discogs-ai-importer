'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CircleCheck, CircleX, ImageOff, Rows3 } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useMemo } from 'react';
import { DiscogsNotConnectedAlert } from '@/components/discogs-not-connected-alert';
import {
  ImportUiProvider,
  type ImportUiValue,
} from '@/components/import-ui-context';
import { PhotoSection } from '@/components/photo-section';
import { useStatusFilter } from '@/components/review-status-filter';
import {
  SpinesFilterBar,
  usePhotoFilter,
  useReviewFilter,
} from '@/components/spines-filter-bar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import type { ReviewStatus } from '@/lib/import-types';
import { pluralize, spinesRefetchInterval } from '@/lib/photo-status';
import type { SpineDto, SpinesResponse } from '@/lib/scan-types';

async function fetchSpines(
  photo: string | null,
  review: boolean,
  status: ReviewStatus | null,
): Promise<SpinesResponse> {
  const params = new URLSearchParams();
  if (photo) params.set('photo', photo);
  if (review) params.set('review', '1');
  if (status) params.set('status', status);
  const qs = params.size > 0 ? `?${params}` : '';
  const res = await fetch(`/api/spines${qs}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`GET /api/spines returned ${res.status}`);
  return (await res.json()) as SpinesResponse;
}

/** Spines grouped by photo id, keeping the server's detection order. */
export function groupByPhoto(spines: readonly SpineDto[]) {
  const by = new Map<string, SpineDto[]>();
  for (const s of spines) {
    const list = by.get(s.photoId);
    if (list) list.push(s);
    else by.set(s.photoId, [s]);
  }
  return by;
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}

function NoSpinesYet() {
  return (
    <Empty className="pt-16 pb-12">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Rows3 className="size-5" />
        </EmptyMedia>
        <EmptyTitle className="text-base font-medium">No spines yet</EmptyTitle>
        <EmptyDescription>
          Upload shelf photos and each CD spine appears here next to what Claude
          read.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link href="/upload">Upload photos</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function PhotoNotFound({ onShowAll }: { onShowAll: () => void }) {
  return (
    <Empty className="pt-16 pb-12">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ImageOff className="size-5" />
        </EmptyMedia>
        <EmptyTitle className="text-base font-medium">
          Photo not found
        </EmptyTitle>
        <EmptyDescription>
          It may have been removed from the data folder.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={onShowAll}>
          Show all photos
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function NothingNeedsReview({ onShowAll }: { onShowAll: () => void }) {
  return (
    <Empty className="pt-16 pb-12">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CircleCheck className="size-5" />
        </EmptyMedia>
        <EmptyTitle className="text-base font-medium">
          Nothing needs review
        </EmptyTitle>
        <EmptyDescription>
          Every field Claude read is above the confidence threshold, or you've
          already checked it.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={onShowAll}>
          Show all spines
        </Button>
      </EmptyContent>
    </Empty>
  );
}

/**
 * The /spines page body (REV-01, RESEARCH Pattern 7). Server-rendered from
 * `initialData`, then GET /api/spines every 1.5 s while any photo is active.
 * Sections are newest photo first; cards keep their spine-id keys across
 * polls, so a refetch never remounts a card.
 */
export function SpinesView({
  initialData,
  initialPhoto,
  initialReview,
  initialStatus,
}: {
  initialData: SpinesResponse;
  initialPhoto: string | null;
  initialReview: boolean;
  initialStatus: ReviewStatus | null;
}) {
  const [photo, setPhoto] = usePhotoFilter();
  const [review, setReview] = useReviewFilter();
  const [status] = useStatusFilter();
  const query = useQuery({
    queryKey: ['spines', { photo, review, status }],
    queryFn: () => fetchSpines(photo, review, status),
    initialData:
      photo === initialPhoto &&
      review === initialReview &&
      status === initialStatus
        ? initialData
        : undefined,
    // Changing a filter keeps the last list and the filter bar on screen
    // until the new one loads.
    placeholderData: keepPreviousData,
    // Every photo's status, so a scan finishing on a photo the filters hide
    // still refreshes the counts; and every 3 s while a listed spine's
    // Discogs search is queued or running or its import is waiting or
    // importing (Pitfall 4, UI-SPEC E7).
    refetchInterval: (q) => spinesRefetchInterval(q.state.data, q.state.status),
  });
  const data = query.data;
  const byPhoto = useMemo(() => groupByPhoto(data?.spines ?? []), [data]);
  // Cards read the Add label's folder and the connection state from here.
  const folderName = data?.discogs.folder.name ?? 'Uncategorized';
  const connected = data?.discogs.connected ?? false;
  const needsReconnect = data?.discogs.needsReconnect ?? false;
  const importUi = useMemo<ImportUiValue>(
    () => ({ folderName, connected, needsReconnect }),
    [folderName, connected, needsReconnect],
  );

  // A failed poll keeps the last data under the Alert; polling continues and
  // the Alert clears on the next success. With no data, it replaces the list.
  const pollError = query.isError ? (
    <Alert variant="destructive">
      <CircleX aria-hidden="true" />
      <AlertTitle>Couldn't refresh</AlertTitle>
      <AlertDescription>
        The latest status didn't load. Showing what was last loaded; retrying
        every few seconds.
      </AlertDescription>
    </Alert>
  ) : null;

  let body: ReactNode;
  if (!data) {
    body = pollError ?? <ListSkeleton />;
  } else if (photo && !data.photoOptions.some((p) => p.id === photo)) {
    body = <PhotoNotFound onShowAll={() => void setPhoto(null)} />;
  } else if (data.photoOptions.length === 0) {
    body = <NoSpinesYet />;
  } else if (review && data.spines.length === 0) {
    body = <NothingNeedsReview onShowAll={() => void setReview(false)} />;
  } else {
    body = (
      <div className="flex flex-col gap-6">
        {pollError}
        {!data.discogs.connected && data.spines.length > 0 ? (
          <DiscogsNotConnectedAlert reconnect={data.discogs.needsReconnect} />
        ) : null}
        <ImportUiProvider value={importUi}>
          {data.photos.map((p) => (
            <PhotoSection
              key={p.id}
              photo={p}
              spines={byPhoto.get(p.id) ?? []}
              threshold={data.confidenceThreshold}
              connected={data.discogs.connected}
              needsReconnect={data.discogs.needsReconnect}
              pausedUntil={data.discogs.pausedUntil}
            />
          ))}
        </ImportUiProvider>
      </div>
    );
  }

  const spineCount = data?.counts.all ?? 0;
  const photoCount = !data
    ? 0
    : photo
      ? data.photoOptions.filter((p) => p.id === photo).length
      : data.photoOptions.length;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-medium tracking-tight">Spines</h1>
        <p className="text-sm text-muted-foreground">
          {`${pluralize(spineCount, 'spine', 'spines')} from ${pluralize(photoCount, 'photo', 'photos')}. Changes save when you leave a field.`}
        </p>
        {data ? (
          <div className="pt-6">
            <SpinesFilterBar
              counts={data.counts}
              photoOptions={data.photoOptions}
            />
          </div>
        ) : null}
      </div>
      {body}
    </div>
  );
}
