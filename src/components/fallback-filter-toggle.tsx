'use client';

import { useQueryState } from 'nuqs';

/** RED stub. */
export function fallbackOf(_raw: string | null): boolean {
  return false;
}

/** RED stub. */
export function fallbackParamOf(_on: boolean): string | null {
  return null;
}

/** RED stub. */
export function useFallbackFilter() {
  const [raw, setRaw] = useQueryState('fallback', { scroll: true });
  const fallback = fallbackOf(raw);
  const setFallback = (on: boolean) => setRaw(fallbackParamOf(on));
  return [fallback, setFallback] as const;
}

/** RED stub. */
export function FallbackFilterToggle(_props: { count: number }) {
  return null;
}
