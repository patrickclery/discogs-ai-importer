'use client';

import { ImageOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SpineDto } from '@/lib/scan-types';

const WELL = 'flex min-h-12 items-center justify-center rounded-md bg-muted';

/** Missing file or no crop: the same well with the ImageOff fallback. */
function CropUnavailable() {
  return (
    <div className={`${WELL} gap-1`}>
      <ImageOff aria-hidden="true" className="size-4 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">Crop unavailable</span>
    </div>
  );
}

/**
 * The muted crop well (VIS-04, UI-SPEC layout constants). The img carries the
 * crop's real width and height, so lazy loading never shifts layout, and it
 * links to the full-size crop. AI text reaches only the alt attribute (T-02-20).
 */
export function SpineCrop({
  crop,
  number,
  rawText,
}: {
  crop: SpineDto['crop'];
  number: number;
  rawText: string | null;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const url = crop?.url ?? null;

  // A server-rendered img can fail before hydration attaches onError. A lazy
  // img that has not been requested yet has no currentSrc, so it is skipped.
  useEffect(() => {
    const img = imgRef.current;
    if (url && img?.complete && img.currentSrc && img.naturalWidth === 0) {
      setFailedUrl(url);
    }
  }, [url]);

  if (!crop || failedUrl === crop.url) return <CropUnavailable />;
  const alt = rawText ? `Spine ${number}: ${rawText}` : `Spine ${number}`;
  return (
    <a
      href={crop.url}
      target="_blank"
      rel="noreferrer"
      className={`${WELL} overflow-hidden outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50`}
    >
      {/* biome-ignore lint/performance/noImgElement: crops stream from a route handler; next/image would re-encode them */}
      <img
        ref={imgRef}
        src={crop.url}
        width={crop.width}
        height={crop.height}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailedUrl(crop.url)}
        className="h-auto max-h-32 w-full object-contain object-center"
      />
    </a>
  );
}
