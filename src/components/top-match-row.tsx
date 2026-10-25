'use client';

import { Disc3 } from 'lucide-react';
import { useState } from 'react';

/**
 * The compact card's match slot (UI-SPEC Top match row): a 48px cover, the
 * verbatim Discogs title clamped to two lines (full title on hover) and the
 * `{year} · {country} · {catno}` line. React text only (T-06-19); the cover
 * src comes only from candidateThumbSrc. A missing or failing cover shows
 * the Disc3 placeholder, never a broken-image glyph.
 */
export function TopMatchRow({
  title,
  details,
  thumbSrc,
}: {
  title: string;
  details: string;
  thumbSrc: string | null;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showThumb = thumbSrc !== null && failedSrc !== thumbSrc;
  return (
    <div className="flex items-start gap-2">
      {showThumb ? (
        // biome-ignore lint/performance/noImgElement: covers stream from a route handler; next/image would re-encode them
        <img
          src={thumbSrc}
          alt=""
          width={48}
          height={48}
          loading="lazy"
          decoding="async"
          onError={() => setFailedSrc(thumbSrc)}
          className="size-12 shrink-0 rounded-md bg-muted object-cover"
        />
      ) : (
        <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted">
          <Disc3 aria-hidden="true" className="size-5 text-muted-foreground" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p
          className="line-clamp-2 text-sm font-medium break-words"
          title={title}
        >
          {title}
        </p>
        <p className="line-clamp-2 text-xs text-muted-foreground">{details}</p>
      </div>
    </div>
  );
}
