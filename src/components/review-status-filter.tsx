'use client';

import { cn } from 'cn';
import { useQueryState } from 'nuqs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  REVIEW_STATUS_LABELS,
  REVIEW_STATUSES,
  type ReviewStatus,
} from '@/lib/import-types';
import { parseStatusParam } from '@/lib/review-status';

/** ToggleGroup value meaning every status (items cannot be empty). */
const ALL_STATUSES = 'all';

/**
 * `?status=` (D-11): one of the six review statuses, or null for All. An
 * unknown value reads as All (T-04-19). Changing it scrolls to the top, like
 * `?photo=`.
 */
export function useStatusFilter() {
  const [raw, setRaw] = useQueryState('status', { scroll: true });
  const status = parseStatusParam(raw) ?? null;
  const setStatus = (s: ReviewStatus | null) => setRaw(s);
  return [status, setStatus] as const;
}

/**
 * A filter count in mono and tabular digits: muted (destructive when
 * `alert`) at rest, and text color while its toggle is hovered or pressed,
 * so it stays readable on the pressed fill (Phase 7 C-3, C-4).
 */
export function Count({ n, alert = false }: { n: number; alert?: boolean }) {
  return (
    <span
      className={cn(
        'font-mono tabular-nums group-hover/toggle:text-accent-foreground group-data-[state=on]/toggle:text-accent-foreground',
        alert ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      {n}
    </span>
  );
}

/**
 * Row 1 of the /spines filter bar (UI-SPEC /spines filter bar, REV-03): All
 * and the six review statuses, each with its count. Never empty: clicking
 * the pressed item keeps it pressed. Items with 0 stay enabled. On narrow
 * screens the tabs wrap onto more lines, so every tab stays visible
 * (G-06-9). They are spaced apart, each with its own border, because a
 * joined row cannot wrap cleanly.
 */
export function ReviewStatusFilter({
  counts,
}: {
  counts: { all: number; byStatus: Record<ReviewStatus, number> };
}) {
  const [status, setStatus] = useStatusFilter();

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={1}
      aria-label="Filter by status"
      className="flex-wrap"
      value={status ?? ALL_STATUSES}
      onValueChange={(v) => {
        if (v === ALL_STATUSES) void setStatus(null);
        else {
          const next = parseStatusParam(v);
          if (next) void setStatus(next);
        }
      }}
    >
      <ToggleGroupItem value={ALL_STATUSES} data-status-filter-item="">
        All <Count n={counts.all} />
      </ToggleGroupItem>
      {REVIEW_STATUSES.map((s) => (
        <ToggleGroupItem key={s} value={s} data-status-filter-item="">
          {REVIEW_STATUS_LABELS[s]}{' '}
          <Count
            n={counts.byStatus[s]}
            alert={s === 'failed' && counts.byStatus[s] > 0}
          />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
