'use client';

import type { SpineDto } from '@/lib/scan-types';

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
  if (!crop) return <div className="min-h-12 rounded-md bg-muted" />;
  const alt = rawText ? `Spine ${number}: ${rawText}` : `Spine ${number}`;
  return (
    <a
      href={crop.url}
      target="_blank"
      rel="noreferrer"
      className="flex min-h-12 items-center justify-center overflow-hidden rounded-md bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {/* biome-ignore lint/performance/noImgElement: crops stream from a route handler; next/image would re-encode them */}
      <img
        src={crop.url}
        width={crop.width}
        height={crop.height}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="h-auto max-h-32 w-full object-contain object-center"
      />
    </a>
  );
}
