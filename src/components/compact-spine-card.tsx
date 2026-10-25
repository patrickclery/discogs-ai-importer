'use client';

import {
  ChevronDown,
  ChevronUp,
  CircleSlash,
  CircleX,
  Clock,
  type LucideIcon,
  SearchX,
  TriangleAlert,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { BulkStatusLine } from '@/components/bulk-status-line';
import { CountryBadge } from '@/components/country-badge';
import { useExpandedCard } from '@/components/expanded-cards';
import { ImportStateBadge } from '@/components/import-state-badge';
import { SpineCrop } from '@/components/spine-crop';
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
 * One spine in the compact grid (D-10, D-16, UI-SPEC Compact card): the
 * header (#n, the worst-field badge, Edited, the orphan badge and the state
 * badge last, after the bulk country badge), the spine crop, then directly
 * under it the top or confirmed match and at most one bulk status line. No field inputs, external link or Add button while collapsed: those
 * live in the full card (D-11).
 *
 * Edit spine opens the card in place: it renders `renderFull` (the one
 * full-card renderer, SpineView) across the whole grid row, with Show less
 * as its last row. Instant, no height animation. Focus follows the toggle:
 * Show less after opening; after closing, the compact card scrolls into
 * view and its Edit spine takes focus.
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
      className={cn('gap-2 rounded-xl p-4', orphaned && 'border-warning/60')}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="font-mono text-muted-foreground tabular-nums">
          #{number}
        </span>
        <WorstFieldBadge spine={spine} threshold={threshold} />
        {edited > 0 ? (
          <Badge variant="secondary">{`Edited · ${edited}`}</Badge>
        ) : null}
        {orphaned ? (
          <Badge variant="outline">
            <TriangleAlert aria-hidden="true" className="text-warning" />
            No longer detected
          </Badge>
        ) : null}
        <div className="ml-auto flex min-w-0 max-w-full items-center gap-2">
          <CountryBadge spine={spine} />
          <ImportStateBadge spine={spine} />
        </div>
      </div>
      <SpineCrop crop={spine.crop} number={number} rawText={rawText} />
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-muted-foreground">
          {slot.label}
        </p>
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
      <BulkStatusLine spine={spine} />
      {renderFull ? (
        <div className="flex justify-end">
          <Button
            ref={editRef}
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Edit spine #${number}`}
            aria-expanded="false"
            aria-controls={cardId}
            onClick={() => {
              focusAfter.current = 'expand';
              setExpanded(true);
            }}
          >
            Edit spine
            <ChevronDown aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
