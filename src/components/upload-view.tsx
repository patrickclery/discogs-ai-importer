'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { FileRejection } from 'react-dropzone';
import { Dropzone } from '@/components/dropzone';
import {
  PHOTOS_QUERY_KEY,
  PhotoStatusList,
} from '@/components/photo-status-list';
import { ClientUploadRow } from '@/components/photo-status-row';
import { STATUS_REFRESH_EVENT } from '@/components/status-indicator';
import type { PhotoDto } from '@/lib/scan-types';
import { createUploadQueue, uploadPhoto } from '@/lib/upload-queue';

type ClientRow = {
  key: string;
  file: File;
  status: 'waiting' | 'uploading';
};

/**
 * /upload body (INGEST-01, D-12): the dropzone, a client upload queue (one
 * POST per file, two at a time) and the polled Photos list.
 */
export function UploadView({
  initialPhotos,
  cliReady,
}: {
  initialPhotos: PhotoDto[];
  cliReady: boolean;
  densityMaxSpines: number;
}) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<ClientRow[]>([]);
  const nextKey = useRef(0);

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
        patchRow(row.key, { status: 'uploading' });
        const result = await uploadPhoto(row.file);
        if (result.ok) {
          // Keep the client row until the server row is in the list, so the
          // photo never blinks out between the two.
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: PHOTOS_QUERY_KEY }),
            queryClient.invalidateQueries({ queryKey: ['spines'] }),
          ]);
          window.dispatchEvent(new Event(STATUS_REFRESH_EVENT));
          patchRow(row.key, null);
        }
      },
    }),
  );

  function onDrop(accepted: File[], _rejections: FileRejection[]) {
    if (!cliReady) return;
    const added = accepted.map((file): ClientRow => {
      nextKey.current += 1;
      return { key: `u${nextKey.current}`, file, status: 'waiting' };
    });
    setRows((current) => [...current, ...added]);
    for (const row of added) queue.add(row);
  }

  return (
    <div className="flex flex-col gap-6">
      <Dropzone disabled={!cliReady} onDrop={onDrop} />
      <PhotoStatusList
        initialPhotos={initialPhotos}
        pendingRows={rows.map((row) => (
          <ClientUploadRow
            key={row.key}
            filename={row.file.name}
            status={row.status}
          />
        ))}
      />
    </div>
  );
}
