'use client';

import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { PhotoStatusRow } from '@/components/photo-status-row';
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

  const photos = query.data?.photos ?? [];

  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center gap-2 px-4 py-3">
        <h2 className="text-base font-medium">Photos</h2>
        <span className="font-mono text-base text-muted-foreground tabular-nums">
          {photos.length}
        </span>
      </div>
      <Separator />
      {photos.length === 0 && !pendingRows ? (
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
  );
}
