'use client';

import { UploadView } from '@/components/upload-view';
import { useDemoSnapshot } from '@/demo/hooks';
import { buildPhotosResponse } from '@/demo/read-model';
import type { DemoState } from '@/demo/store';
import type { PhotoDto } from '@/lib/scan-types';
import { DEFAULT_DENSITY_MAX_SPINES } from '@/lib/vision-contract';
import UploadLoading from './loading';

// Demo /upload (D-02, D-11, D-12): the real UploadView with its first photos
// from the demo store, rendered after mount only (RESEARCH Pitfall 4). The
// demo's Claude CLI is ready, so there is no "isn't ready" alert. A dropped
// file goes through the real upload queue to the demo POST /api/photos,
// which reads only its name.

const selectPhotos = (state: DemoState, now: number): PhotoDto[] =>
  buildPhotosResponse(state, now).photos;

export default function DemoUploadPage() {
  const photos = useDemoSnapshot(selectPhotos);
  if (!photos) return <UploadLoading />;
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-medium tracking-tight">Upload</h1>
        <p className="text-sm text-muted-foreground">
          Drop photos of your CD shelves. Each photo is read by Claude once, and
          every spine is cropped so you can check what it read.
        </p>
      </div>
      <div className="flex flex-col gap-6">
        <UploadView
          initialPhotos={photos}
          cliReady
          densityMaxSpines={DEFAULT_DENSITY_MAX_SPINES}
        />
      </div>
    </div>
  );
}
