import { useEffect, useState } from 'react';

/**
 * Whole seconds left until `until` (epoch ms), ticking once a second while
 * active; 0 when inactive, unknown or past. Shared by the matches section's
 * paused line and the Search Discogs dialog's queued state.
 */
export function useSecondsUntil(until: number | null, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!active || until === null || until <= Date.now()) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= until) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [until, active]);
  if (!active || until === null) return 0;
  const left = until - now;
  return left > 0 ? Math.ceil(left / 1000) : 0;
}
