'use client';

import { useQuery } from '@tanstack/react-query';
import { Rows3 } from 'lucide-react';
import { useQueryState } from 'nuqs';
import { useMemo } from 'react';
import { PhotoSection } from '@/components/photo-section';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { photosRefetchInterval } from '@/lib/photo-status';
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

/**
 * The polled /spines list (REV-01, RESEARCH Pattern 7). Server-rendered from
 * `initialData`, then GET /api/spines every 1.5 s while any photo is active.
 */
export function SpinesView({
  initialData,
  initialPhoto,
}: {
  initialData: SpinesResponse;
  initialPhoto: string | null;
}) {
  const [photoParam] = useQueryState('photo');
  const photo = photoParam || null;
  const query = useQuery({
    queryKey: ['spines', { photo }],
    queryFn: () => fetchSpines(photo),
    initialData: photo === initialPhoto ? initialData : undefined,
    refetchInterval: (q) => photosRefetchInterval(q.state.data?.photos),
  });
  const data = query.data;
  const byPhoto = useMemo(() => groupByPhoto(data?.spines ?? []), [data]);

  if (!data) return null;

  if (data.photos.length === 0) {
    return (
      <Empty className="pt-16 pb-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Rows3 className="size-5" />
          </EmptyMedia>
          <EmptyTitle className="text-base font-medium">
            No spines yet
          </EmptyTitle>
          <EmptyDescription>
            Upload shelf photos and each CD spine appears here next to what
            Claude read.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {data.photos.map((p) => (
        <PhotoSection key={p.id} photo={p} spines={byPhoto.get(p.id) ?? []} />
      ))}
    </div>
  );
}
