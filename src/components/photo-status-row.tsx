'use client';

import { Copy, ImageIcon, X } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useEffect, useState } from 'react';
import { DensityBadge, IncompleteBadge } from '@/components/density-badge';
import { PhotoStatusBadge } from '@/components/photo-status-badge';
import { RescanButton } from '@/components/rescan-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatElapsed, rowAction, statusView } from '@/lib/photo-status';
import type { PhotoDto } from '@/lib/scan-types';

/** Current time, re-rendered every second while `ticking` (the m:ss timer). */
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);
  return now;
}

/** 48px thumbnail, or a muted square until the worker has produced one. */
export function RowThumb({ url }: { url: string | null }) {
  if (!url) {
    return (
      <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted">
        <ImageIcon
          aria-hidden="true"
          className="size-4 text-muted-foreground"
        />
      </div>
    );
  }
  return (
    // biome-ignore lint/performance/noImgElement: thumbs stream from a route handler; next/image would re-encode them
    <img
      src={url}
      alt=""
      width={48}
      height={48}
      loading="lazy"
      decoding="async"
      className="size-12 shrink-0 rounded-md bg-muted object-cover"
    />
  );
}

/** Filename line: one line, truncated, full name in title, text only. */
export function RowFilename({ name }: { name: string }) {
  return (
    <p className="truncate text-sm font-medium" title={name}>
      {name}
    </p>
  );
}

/**
 * A dropped file the server has no row for yet (Plan 02-07): "Waiting to
 * upload" behind the concurrency cap, "Uploading…", or a client failure
 * with its reason, "Retry upload" (same File) and "Remove from list".
 */
export function ClientUploadRow({
  filename,
  status,
  message,
  onRetry,
  onRemove,
}: {
  filename: string;
  status: 'waiting' | 'uploading' | 'failed';
  /** Failure copy (uploadErrorMessage); shown when status is failed. */
  message?: string;
  /** Absent for files the dropzone refused: they were never sent. */
  onRetry?: () => void;
  onRemove?: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-4 px-4 py-3 sm:flex-nowrap">
      <RowThumb url={null} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <RowFilename name={filename} />
        {status === 'failed' ? (
          // Copy interpolates the untrusted filename: text child only.
          <p className="text-sm break-words text-destructive">{message}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {status === 'waiting' ? 'Waiting to upload' : 'Uploading…'}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PhotoStatusBadge status={status === 'failed' ? 'error' : status} />
        {status === 'failed' && onRetry ? (
          <Button type="button" variant="outline" onClick={onRetry}>
            Retry upload
          </Button>
        ) : null}
        {status === 'failed' && onRemove ? (
          <Button
            type="button"
            variant="ghost"
            aria-label={`Remove ${filename} from the list`}
            onClick={onRemove}
          >
            <X aria-hidden="true" />
            Remove from list
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/** One server photo on /upload (UI-SPEC /upload item 5). */
export function PhotoStatusRow({
  photo,
  duplicate = false,
}: {
  photo: PhotoDto;
  /** Re-uploaded this session (Plan 02-07): session-only badge. */
  duplicate?: boolean;
}) {
  const calling = photo.status === 'calling';
  const now = useNow(calling);
  const view = statusView(photo, now);
  const action = rowAction(photo);

  let subline: ReactNode;
  if (calling) {
    subline = (
      <p className="text-xs text-muted-foreground">
        Claude is reading the spines…{' '}
        <span className="font-mono tabular-nums" suppressHydrationWarning>
          {formatElapsed(photo.spawnedAt === null ? 0 : now - photo.spawnedAt)}
        </span>
      </p>
    );
  } else if (photo.status === 'error') {
    // Untrusted server text: rendered as a text child and a title only.
    subline = (
      <p
        className="line-clamp-3 text-sm break-words text-destructive"
        title={view.subline}
      >
        {view.subline}
      </p>
    );
  } else {
    subline = <p className="text-xs text-muted-foreground">{view.subline}</p>;
  }

  return (
    <li className="flex flex-wrap items-center gap-4 px-4 py-3 sm:flex-nowrap">
      <RowThumb url={photo.thumbUrl} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <RowFilename name={photo.filename} />
        {subline}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {duplicate ? (
          <Badge variant="secondary">
            <Copy aria-hidden="true" />
            Already uploaded
          </Badge>
        ) : null}
        {photo.status === 'done' && photo.densityFlags.length > 0 ? (
          <DensityBadge />
        ) : null}
        {photo.status === 'done' && photo.truncated ? (
          <IncompleteBadge photo={photo} />
        ) : null}
        <PhotoStatusBadge status={photo.status} />
        {action === 'view_spines' ? (
          <Button asChild variant="outline">
            <Link href={`/spines?photo=${encodeURIComponent(photo.id)}`}>
              View spines
            </Link>
          </Button>
        ) : null}
        {action === 'rescan' ? (
          <RescanButton
            photoId={photo.id}
            filename={photo.filename}
            active={false}
          />
        ) : null}
      </div>
    </li>
  );
}
