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

/** A filter count: mono, tabular, muted (destructive when `alert`). */
export function Count({ n, alert = false }: { n: number; alert?: boolean }) {
  return (
    <span
      className={cn(
        'font-mono tabular-nums',
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
 * the pressed item keeps it pressed. Items with 0 stay enabled. The joined
 * group never wraps; below 1152px it scrolls sideways inside a padded
 * wrapper that keeps focus rings visible.
 */
export function ReviewStatusFilter({
  counts,
}: {
  counts: { all: number; byStatus: Record<ReviewStatus, number> };
}) {
  const [status, setStatus] = useStatusFilter();

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <ToggleGroup
        type="single"
        variant="outline"
        aria-label="Filter by status"
        className="w-max"
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
    </div>
  );
}
