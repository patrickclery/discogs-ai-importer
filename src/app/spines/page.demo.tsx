'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback } from 'react';
import { SpinesView } from '@/components/spines-view';
import { useDemoSnapshot } from '@/demo/hooks';
import { buildSpinesResponse } from '@/demo/read-model';
import type { DemoState } from '@/demo/store';
import { parseStatusParam } from '@/lib/review-status';
import SpinesLoading from './loading';

// Demo /spines (D-02): the real SpinesView with its first data from the demo
// store, rendered after mount only (RESEARCH Pitfall 4); the search params
// need a Suspense boundary in a prerendered page (Pitfall 5).

function DemoSpines() {
  const sp = useSearchParams();
  const photo = sp.get('photo') || null;
  const review = sp.get('review') === '1';
  const status = parseStatusParam(sp.get('status')) ?? null;
  const select = useCallback(
    (state: DemoState, now: number) =>
      buildSpinesResponse(state, now, {
        photoId: photo ?? undefined,
        review,
        status: status ?? undefined,
      }),
    [photo, review, status],
  );
  const initialData = useDemoSnapshot(select);
  if (!initialData) return <SpinesLoading />;
  return (
    <SpinesView
      initialData={initialData}
      initialPhoto={photo}
      initialReview={review}
      initialStatus={status}
    />
  );
}

export default function DemoSpinesPage() {
  return (
    <Suspense fallback={<SpinesLoading />}>
      <DemoSpines />
    </Suspense>
  );
}
