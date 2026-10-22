'use client';

import { Disc3, ExternalLink, Hash } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { detailsLine } from '@/lib/candidate-format';
import type { CandidateDto } from '@/lib/discogs-types';

/** The release page, built from the integer id only (T-03-22). */
export function releaseUrl(releaseId: number): string {
  return `https://www.discogs.com/release/${Math.trunc(releaseId)}`;
}

/**
 * The 64x64 cover from the thumb cache route. With no stored cover, or
 * when the route answers anything but an image, a muted square with a
 * Disc3 icon (never a broken-image glyph). Fixed size: no layout shift.
 */
export function CandidateThumb({
  candidate,
  src,
}: {
  candidate: Pick<CandidateDto, 'id' | 'hasThumb'>;
  /** Overrides the candidate cover route (the dialog's search results). */
  src?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!candidate.hasThumb || failed) {
    return (
      <div className="flex size-16 shrink-0 items-center justify-center rounded-md bg-muted">
        <Disc3 aria-hidden="true" className="size-5 text-muted-foreground" />
      </div>
    );
  }
  return (
    // biome-ignore lint/performance/noImgElement: covers stream from a route handler; next/image would re-encode them
    <img
      src={src ?? `/api/discogs/thumb/${encodeURIComponent(candidate.id)}`}
      alt=""
      width={64}
      height={64}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="size-16 shrink-0 rounded-md bg-muted object-cover"
    />
  );
}

/**
 * One candidate release's content (DISC-04, D-12): cover, the verbatim
 * Discogs title, the details line, tags and a link to the release on
 * discogs.com. Discogs strings render as React text (T-03-21). The Search
 * Discogs dialog reuses it inside a radio option with its own cover route.
 */
export function CandidateRowContent({
  candidate,
  thumbSrc,
  alreadyListed = false,
  actions,
}: {
  candidate: CandidateDto;
  thumbSrc?: string;
  /** Dialog only: the release is already among the spine's candidates. */
  alreadyListed?: boolean;
  /**
   * The card's action row under the tags ("Add to {folder}", D-01). The
   * Search Discogs dialog passes nothing: it only adds candidates.
   */
  actions?: ReactNode;
}) {
  const hasTags =
    candidate.catnoMatch || candidate.source === 'manual' || alreadyListed;
  return (
    <>
      <CandidateThumb candidate={candidate} src={thumbSrc} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p
          className="line-clamp-2 text-sm font-medium break-words"
          title={candidate.title}
        >
          {candidate.title}
        </p>
        <p className="text-xs break-words text-muted-foreground">
          {detailsLine(candidate)}
        </p>
        {hasTags ? (
          <div className="flex flex-wrap gap-1">
            {candidate.catnoMatch ? (
              <Badge variant="outline">
                <Hash aria-hidden="true" className="text-muted-foreground" />
                Catalog number match
              </Badge>
            ) : null}
            {candidate.source === 'manual' ? (
              <Badge variant="secondary">Added manually</Badge>
            ) : null}
            {alreadyListed ? (
              <Badge variant="secondary">Already listed</Badge>
            ) : null}
          </div>
        ) : null}
        {actions ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant="ghost" size="icon" className="shrink-0">
            <a
              href={releaseUrl(candidate.releaseId)}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${candidate.title} on discogs.com`}
            >
              <ExternalLink aria-hidden="true" />
            </a>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Open on discogs.com</TooltipContent>
      </Tooltip>
    </>
  );
}

/**
 * One candidate row on the card. The row itself is not clickable: the only
 * confirm is the explicit "Add to {folder}" button in its actions (IMP-01).
 */
export function CandidateRow({
  candidate,
  actions,
}: {
  candidate: CandidateDto;
  actions?: ReactNode;
}) {
  return (
    <li className="flex items-start gap-4 py-2">
      <CandidateRowContent candidate={candidate} actions={actions} />
    </li>
  );
}
