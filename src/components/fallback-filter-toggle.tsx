'use client';

import { useQueryState } from 'nuqs';
import { Count } from '@/components/review-status-filter';
import { Toggle } from '@/components/ui/toggle';

/**
 * `?fallback=1` lists only the spines whose bulk import used another
 * country (D-15). Only the exact value '1' turns it on, the same rule as
 * parseFallbackParam on the server (T-06-26).
 */
export function fallbackOf(raw: string | null): boolean {
  return raw === '1';
}

/** The `fallback` param for the filter: off removes it. */
export function fallbackParamOf(on: boolean): string | null {
  return on ? '1' : null;
}

/** The Fallback filter from the URL; changing it scrolls to the top. */
export function useFallbackFilter() {
  const [raw, setRaw] = useQueryState('fallback', { scroll: true });
  const fallback = fallbackOf(raw);
  const setFallback = (on: boolean) => setRaw(fallbackParamOf(on));
  return [fallback, setFallback] as const;
}

/**
 * The standalone Fallback toggle in filter row 2 (UI-SPEC Fallback filter):
 * outline, never accent, with the muted mono count. It ANDs with the
 * status, Needs review and photo filters.
 */
export function FallbackFilterToggle({ count }: { count: number }) {
  const [fallback, setFallback] = useFallbackFilter();
  return (
    <Toggle
      variant="outline"
      data-fallback-filter=""
      pressed={fallback}
      onPressedChange={(on) => void setFallback(on)}
    >
      Fallback <Count n={count} />
    </Toggle>
  );
}
