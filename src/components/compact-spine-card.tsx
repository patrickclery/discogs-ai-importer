'use client';

import {
  ChevronUp,
  CircleCheck,
  CircleSlash,
  CircleX,
  Clock,
  Disc3,
  type LucideIcon,
  Pencil,
  SearchX,
  TriangleAlert,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { BulkStatusLine } from '@/components/bulk-status-line';
import { CountryBadge } from '@/components/country-badge';
import { useExpandedCard } from '@/components/expanded-cards';
import { ImportStateBadge } from '@/components/import-state-badge';
import { SpineCrop } from '@/components/spine-crop';
import { SpineSelectCheckbox } from '@/components/spine-selection';
import { TopMatchRow } from '@/components/top-match-row';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { WorstFieldBadge } from '@/components/worst-field-badge';
import { candidateThumbSrc } from '@/lib/asset-urls';
import { MATCH_PLACEHOLDERS, matchSlotOf } from '@/lib/bulk-copy';
import type { SpineDto } from '@/lib/scan-types';
import { editedCount, spineNumber } from '@/lib/spine-review';
import { cn } from '@/lib/utils';

/** The 16px icon before a match-slot placeholder (UI-SPEC Match slot). */
const PLACEHOLDER_ICONS: Record<string, LucideIcon> = {
  [MATCH_PLACEHOLDERS.notSearched]: Clock,
  [MATCH_PLACEHOLDERS.noMatch]: SearchX,
  [MATCH_PLACEHOLDERS.failed]: CircleX,
  [MATCH_PLACEHOLDERS.marked]: CircleSlash,
};

function candidatesLabel(n: number) {
  return `${n} ${n === 1 ? 'candidate' : 'candidates'}`;
}

function PlaceholderLine({ text }: { text: string }) {
  const Icon = PLACEHOLDER_ICONS[text];
  return (
    <p className="flex items-start gap-1 text-xs text-muted-foreground">
      {text === MATCH_PLACEHOLDERS.searching || !Icon ? (
        <Spinner aria-hidden="true" role="presentation" className="size-4" />
      ) : (
        <Icon aria-hidden="true" className="size-4 shrink-0" />
      )}
      <span className="min-w-0">{text}</span>
    </p>
  );
}

/**
 * One spine in the compact grid (D-10, D-16, UI-SPEC Compact card, amended
 * by G-06-side-2). Six rows, always rendered in this order so every card has
 * the same shape:
 *   1. status: the state badge alone, never clipped;
 *   2. warnings: the worst-field badge, the bulk country badge, No longer
 *      detected and Edited, always present (empty when there are none) and
 *      wrapping when they don't fit;
 *   3. crop: the spine crop;
 *   4. select: the select checkbox, the Top match / Confirmed match label
 *      and the pencil Edit button at the right end;
 *   5. match: the top or confirmed match (or its placeholder) in a fixed
 *      60px box;
 *   6. bulk: the import notes line, two lines reserved.
 * The card spans six rows of the photo section's grid and shares them
 * (CSS subgrid), so the cards in a grid row line up row by row. No card
 * numbering on screen: the spine number appears only in accessible names
 * and the crop's alt text. No field inputs, external link or Add button
 * while collapsed: those live in the full card (D-11).
 *
 * The pencil opens the card in place: it renders `renderFull` (the one
 * full-card renderer, SpineView) across the whole grid row, with Show less
 * as its last row. Instant, no height animation. Focus follows the toggle:
 * Show less after opening; after closing, the compact card scrolls into
 * view and its pencil takes focus.
 */
export function CompactSpineCard({
  spine,
  threshold,
  renderFull,
}: {
  spine: SpineDto;
  /** The confidence_threshold setting (D-09). */
  threshold: number;
  /** The full card with `trailing` as its last row; without it no toggle. */
  renderFull?: (trailing: ReactNode) => ReactNode;
}) {
  const [expanded, setExpanded] = useExpandedCard(spine.id);
  const editRef = useRef<HTMLButtonElement>(null);
  const showLessRef = useRef<HTMLButtonElement>(null);
  const focusAfter = useRef<'expand' | 'collapse' | null>(null);
  const cardId = `spine-card-${spine.id}`;

  useEffect(() => {
    const pending = focusAfter.current;
    if (pending === null) return;
    focusAfter.current = null;
    const frame = window.requestAnimationFrame(() => {
      if (pending === 'expand' && expanded) {
        showLessRef.current?.focus();
      } else if (pending === 'collapse' && !expanded) {
        document.getElementById(cardId)?.scrollIntoView({ block: 'nearest' });
        editRef.current?.focus();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [expanded, cardId]);

  const number = spineNumber(spine);

  if (expanded && renderFull) {
    return (
      <div className="col-span-full">
        {renderFull(
          <div className="flex justify-end">
            <Button
              ref={showLessRef}
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Show less of spine #${number}`}
              aria-expanded="true"
              aria-controls={cardId}
              onClick={() => {
                focusAfter.current = 'collapse';
                setExpanded(false);
              }}
            >
              Show less
              <ChevronUp aria-hidden="true" />
            </Button>
          </div>,
        )}
      </div>
    );
  }

  const rawText =
    spine.fields.find((f) => f.field === 'raw_text')?.value ?? null;
  const edited = editedCount(spine.fields);
  const orphaned = spine.state === 'orphaned';
  const slot = matchSlotOf(spine);
  const match = slot.match;
  const thumbSrc =
    match?.hasThumb && match.candidateId
      ? candidateThumbSrc({ id: match.candidateId, releaseId: match.releaseId })
      : null;
  return (
    <Card
      id={cardId}
      data-spine-card={spine.id}
      variant="mini"
      className={cn(
        // grid-cols-1 is minmax(0, 1fr): a long unbroken file name or catno
        // wraps inside the card instead of widening the column past its edge.
        'row-span-6 grid grid-cols-1 grid-rows-subgrid gap-2 rounded-xl p-4',
        orphaned && 'border-warning/60',
      )}
    >
      <div data-compact-row="select" className="flex h-9 items-center gap-2">
        <SpineSelectCheckbox spine={spine} />
        <span className="flex-1" />
        {spine.import?.phase === 'imported' ? (
          <Badge data-imported-check variant="outline" className="shrink-0">
            <CircleCheck aria-hidden="true" className="text-success" />
            Imported
          </Badge>
        ) : null}
        {renderFull ? (
          <Button
            ref={editRef}
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Edit spine #${number}`}
            aria-expanded="false"
            aria-controls={cardId}
            onClick={() => {
              focusAfter.current = 'expand';
              setExpanded(true);
            }}
          >
            <Pencil aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <div data-compact-row="crop" className="grid">
        <SpineCrop crop={spine.crop} number={number} rawText={rawText} />
      </div>
      <div data-compact-row="label" className="flex h-5 items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
          {slot.label}
        </p>
        {spine.discogs?.state === 'done' ? (
          <span
            data-candidate-count
            title={candidatesLabel(spine.discogs.candidateCount)}
            className="flex shrink-0 items-center gap-1 font-mono text-xs text-muted-foreground tabular-nums"
          >
            <Disc3 aria-hidden="true" className="size-3.5" />
            <span aria-hidden="true">{spine.discogs.candidateCount}</span>
            <span className="sr-only">
              {candidatesLabel(spine.discogs.candidateCount)}
            </span>
          </span>
        ) : null}
      </div>
      <div data-compact-row="match" className="h-15">
        {match ? (
          <TopMatchRow
            title={match.title}
            details={match.details}
            thumbSrc={thumbSrc}
          />
        ) : (
          <PlaceholderLine text={slot.placeholder ?? ''} />
        )}
      </div>
      {/* Every status and warning sits at the bottom: one row of badges, then the import note as a pill. */}
      {/* A badge that ever outgrows the card wraps its text instead of being cut off. */}
      <div
        data-compact-row="warnings"
        className="flex min-h-6 flex-wrap content-start items-center gap-x-2 gap-y-1 [&>[data-slot=badge]]:max-w-full [&>[data-slot=badge]]:whitespace-normal"
      >
        <ImportStateBadge spine={spine} hideCandidateCount hideImported />
        <WorstFieldBadge spine={spine} threshold={threshold} />
        <CountryBadge spine={spine} />
        {orphaned ? (
          <Badge variant="outline">
            <TriangleAlert aria-hidden="true" className="text-warning" />
            No longer detected
          </Badge>
        ) : null}
        {edited > 0 ? (
          <Badge variant="secondary">{`Edited · ${edited}`}</Badge>
        ) : null}
      </div>
      <div data-compact-row="notes" className="min-h-6">
        <BulkStatusLine spine={spine} clamp />
      </div>
    </Card>
  );
}
