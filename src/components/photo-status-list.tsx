'use client';

import { useQuery } from '@tanstack/react-query';
import { CircleX } from 'lucide-react';
import { Children, type ReactNode } from 'react';
import { PhotoStatusRow } from '@/components/photo-status-row';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { photosRefetchInterval } from '@/lib/photo-status';
import type { PhotoDto, PhotosResponse } from '@/lib/scan-types';

export const PHOTOS_QUERY_KEY = ['photos'] as const;

async function fetchPhotos(): Promise<PhotosResponse> {
  const res = await fetch('/api/photos', { cache: 'no-store' });
  if (!res.ok) throw new Error(`GET /api/photos returned ${res.status}`);
  return (await res.json()) as PhotosResponse;
}

/**
 * The polled Photos card on /upload (INGEST-02, D-12). Server-rendered from
 * initialPhotos, then GET /api/photos every 1.5 s while any photo is active.
 */
export function PhotoStatusList({
  initialPhotos,
  pendingRows,
  duplicateIds,
}: {
  initialPhotos: PhotoDto[];
  /** Client upload rows, shown first in drop order (Plan 02-07). */
  pendingRows?: ReactNode;
  /** Photos re-uploaded this session; their rows get "Already uploaded". */
  duplicateIds?: ReadonlySet<string>;
}) {
  const query = useQuery({
    queryKey: PHOTOS_QUERY_KEY,
    queryFn: fetchPhotos,
    initialData: { photos: initialPhotos },
    refetchInterval: (q) => photosRefetchInterval(q.state.data?.photos),
  });

  const photos = query.data?.photos;
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

  if (!photos) return pollError;

  return (
    <div className="flex flex-col gap-6">
      {pollError}
      <Card className="gap-0 py-0">
        <div className="flex items-center gap-2 px-4 py-3">
          <h2 className="text-base font-medium">Photos</h2>
          <span className="font-mono text-base text-muted-foreground tabular-nums">
            {photos.length}
          </span>
        </div>
        <Separator />
        {photos.length === 0 && Children.count(pendingRows) === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No photos yet. Photos you drop appear here with their progress.
          </p>
        ) : null}
        <ul className="divide-y">
          {pendingRows}
          {photos.map((photo) => (
            <PhotoStatusRow
              key={photo.id}
              photo={photo}
              duplicate={duplicateIds?.has(photo.id) ?? false}
            />
          ))}
        </ul>
      </Card>
    </div>
  );
}
