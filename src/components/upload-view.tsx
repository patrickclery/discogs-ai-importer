'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { FileRejection } from 'react-dropzone';
import { toast } from 'sonner';
import { Dropzone } from '@/components/dropzone';
import {
  PHOTOS_QUERY_KEY,
  PhotoStatusList,
} from '@/components/photo-status-list';
import { ClientUploadRow } from '@/components/photo-status-row';
import { STATUS_REFRESH_EVENT } from '@/components/status-indicator';
import { UploadTip } from '@/components/upload-tip';
import type { PhotoDto, PhotoStatus, PhotosResponse } from '@/lib/scan-types';
import {
  createUploadQueue,
  terminalAnnouncements,
  type UploadFailureCode,
  uploadErrorMessage,
  uploadPhoto,
} from '@/lib/upload-queue';

type ClientRow = {
  key: string;
  file: File;
  status: 'waiting' | 'uploading' | 'failed';
  message?: string;
  /** False for files the dropzone refused: they were never sent. */
  retryable: boolean;
};

function rejectionCode(rejection: FileRejection): UploadFailureCode {
  return rejection.errors.some((e) => e.code === 'file-too-large')
    ? 'too_large'
    : 'unsupported_type';
}

function isPhotosKey(key: readonly unknown[]): boolean {
  return (
    key.length === PHOTOS_QUERY_KEY.length && key[0] === PHOTOS_QUERY_KEY[0]
  );
}

/**
 * /upload body (INGEST-01, INGEST-03, D-12): the dropzone, a client upload
 * queue (one POST per file, two at a time), client failure rows with retry,
 * session duplicate badges, and the polled Photos list.
 */
export function UploadView({
  initialPhotos,
  cliReady,
  densityMaxSpines,
}: {
  initialPhotos: PhotoDto[];
  cliReady: boolean;
  densityMaxSpines: number;
}) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [duplicateIds, setDuplicateIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [announcement, setAnnouncement] = useState('');
  const nextKey = useRef(0);
  const seenStatuses = useRef<Map<string, PhotoStatus>>(
    new Map(initialPhotos.map((p) => [p.id, p.status])),
  );

  function patchRow(key: string, patch: Partial<ClientRow> | null) {
    setRows((current) =>
      patch === null
        ? current.filter((r) => r.key !== key)
        : current.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  const [queue] = useState(() =>
    createUploadQueue<ClientRow>({
      concurrency: 2,
      run: async (row) => {
        patchRow(row.key, { status: 'uploading', message: undefined });
        const result = await uploadPhoto(row.file);
        if (!result.ok) {
          patchRow(row.key, {
            status: 'failed',
            message: uploadErrorMessage(result.code, row.file.name),
            retryable: true,
          });
          return;
        }
        if (result.body.duplicate) {
          // INGEST-03: the server made no new photo and queued no call.
          const { photoId } = result.body;
          setDuplicateIds((current) => new Set(current).add(photoId));
          toast(
            `${row.file.name} was already uploaded. Showing the existing scan; no new Claude call was made.`,
          );
        }
        // Keep the client row until the server row is in the list, so the
        // photo never blinks out between the two.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: PHOTOS_QUERY_KEY }),
          queryClient.invalidateQueries({ queryKey: ['spines'] }),
        ]);
        window.dispatchEvent(new Event(STATUS_REFRESH_EVENT));
        patchRow(row.key, null);
      },
    }),
  );

  // Live region: compare each successful poll with the statuses last seen and
  // announce only photos that reached done or error (UI-SPEC, A-12).
  useEffect(() => {
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      if (!isPhotosKey(event.query.queryKey)) return;
      const data = event.query.state.data as PhotosResponse | undefined;
      if (!data) return;
      const lines = terminalAnnouncements(seenStatuses.current, data.photos);
      seenStatuses.current = new Map(data.photos.map((p) => [p.id, p.status]));
      if (lines.length > 0) setAnnouncement(lines.join('. '));
    });
  }, [queryClient]);

  function onDrop(accepted: File[], rejections: FileRejection[]) {
    if (!cliReady) return;
    const newKey = () => {
      nextKey.current += 1;
      return `u${nextKey.current}`;
    };
    const queued = accepted.map(
      (file): ClientRow => ({
        key: newKey(),
        file,
        status: 'waiting',
        retryable: true,
      }),
    );
    // Refused by type or size: shown with the reason, never sent (D-06).
    const refused = rejections.map(
      (rejection): ClientRow => ({
        key: newKey(),
        file: rejection.file,
        status: 'failed',
        message: uploadErrorMessage(
          rejectionCode(rejection),
          rejection.file.name,
        ),
        retryable: false,
      }),
    );
    setRows((current) => [...current, ...queued, ...refused]);
    for (const row of queued) queue.add(row);
  }

  function retry(row: ClientRow) {
    patchRow(row.key, { status: 'waiting', message: undefined });
    queue.add(row);
  }

  return (
    <div className="flex flex-col gap-6">
      <Dropzone disabled={!cliReady} onDrop={onDrop} />
      <UploadTip maxSpines={densityMaxSpines} />
      <PhotoStatusList
        initialPhotos={initialPhotos}
        duplicateIds={duplicateIds}
        pendingRows={rows.map((row) => (
          <ClientUploadRow
            key={row.key}
            filename={row.file.name}
            status={row.status}
            message={row.message}
            onRetry={row.retryable ? () => retry(row) : undefined}
            onRemove={() => patchRow(row.key, null)}
          />
        ))}
      />
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
