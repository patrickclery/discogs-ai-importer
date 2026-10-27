'use client';

import { Disc3 } from 'lucide-react';
import { useState } from 'react';

/**
 * The compact card's match slot (UI-SPEC Top match row, G-06-side-2): the
 * cover across the card's full width (square), then below it the verbatim Discogs title clamped at two lines (a one-line
 * title takes one line, nothing is reserved for a second) and the
 * `{year} · {country} · {catno}` details exactly one line, each with the
 * full text on hover. The subgrid lines the cards in a grid row up. React text only
 * (T-06-19, T-06-36); the cover src comes only from candidateThumbSrc. A
 * missing or failing cover shows the Disc3 placeholder, never a
 * broken-image glyph.
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
    <div className="flex flex-col gap-2">
      {showThumb ? (
        // biome-ignore lint/performance/noImgElement: covers stream from a route handler; next/image would re-encode them
        <img
          src={thumbSrc}
          alt=""
          width={150}
          height={150}
          loading="lazy"
          decoding="async"
          onError={() => setFailedSrc(thumbSrc)}
          className="aspect-square w-full rounded-md bg-muted object-cover"
        />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center rounded-md bg-muted">
          <Disc3 aria-hidden="true" className="size-10 text-muted-foreground" />
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <p
          className="line-clamp-2 text-sm font-medium break-words"
          title={title}
        >
          {title}
        </p>
        <p
          className="line-clamp-1 h-[1lh] text-xs break-words text-muted-foreground"
          title={details}
        >
          {details}
        </p>
      </div>
    </div>
  );
}
