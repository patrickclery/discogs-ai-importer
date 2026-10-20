'use client';

import { Copy, ImageIcon } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useEffect, useState } from 'react';
import { PhotoStatusBadge } from '@/components/photo-status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatElapsed, statusView } from '@/lib/photo-status';
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
    subline = <p className="text-sm text-destructive">{view.subline}</p>;
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
        <PhotoStatusBadge status={photo.status} />
        {photo.status === 'done' && photo.spineCount >= 1 ? (
          <Button asChild variant="outline">
            <Link href={`/spines?photo=${encodeURIComponent(photo.id)}`}>
              View spines
            </Link>
          </Button>
        ) : null}
      </div>
    </li>
  );
}
