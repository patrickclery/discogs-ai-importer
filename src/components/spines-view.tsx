'use client';

import { useQuery } from '@tanstack/react-query';
import { CircleX, ImageOff, Rows3 } from 'lucide-react';
import Link from 'next/link';
import { useQueryState } from 'nuqs';
import { type ReactNode, useMemo } from 'react';
import { PhotoSection } from '@/components/photo-section';
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
import { photosRefetchInterval, pluralize } from '@/lib/photo-status';
import type { SpineDto, SpinesResponse } from '@/lib/scan-types';

async function fetchSpines(photo: string | null): Promise<SpinesResponse> {
  const qs = photo ? `?photo=${encodeURIComponent(photo)}` : '';
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

/**
 * The /spines page body (REV-01, RESEARCH Pattern 7). Server-rendered from
 * `initialData`, then GET /api/spines every 1.5 s while any photo is active.
 * Sections are newest photo first; cards keep their spine-id keys across
 * polls, so a refetch never remounts a card.
 */
export function SpinesView({
  initialData,
  initialPhoto,
}: {
  initialData: SpinesResponse;
  initialPhoto: string | null;
}) {
  const [photoParam, setPhoto] = useQueryState('photo');
  const photo = photoParam || null;
  const query = useQuery({
    queryKey: ['spines', { photo }],
    queryFn: () => fetchSpines(photo),
    initialData: photo === initialPhoto ? initialData : undefined,
    refetchInterval: (q) => photosRefetchInterval(q.state.data?.photos),
  });
  const data = query.data;
  const byPhoto = useMemo(() => groupByPhoto(data?.spines ?? []), [data]);

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
  } else if (data.photos.length === 0) {
    body = photo ? (
      <PhotoNotFound onShowAll={() => void setPhoto(null)} />
    ) : (
      <NoSpinesYet />
    );
  } else {
    body = (
      <div className="flex flex-col gap-6">
        {pollError}
        {data.photos.map((p) => (
          <PhotoSection
            key={p.id}
            photo={p}
            spines={byPhoto.get(p.id) ?? []}
            threshold={data.confidenceThreshold}
          />
        ))}
      </div>
    );
  }

  const spineCount = data?.counts.all ?? 0;
  const photoCount = data?.photos.length ?? 0;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-medium tracking-tight">Spines</h1>
        <p className="text-sm text-muted-foreground">
          {`${pluralize(spineCount, 'spine', 'spines')} from ${pluralize(photoCount, 'photo', 'photos')}. Changes save when you leave a field.`}
        </p>
      </div>
      {body}
    </div>
  );
}
