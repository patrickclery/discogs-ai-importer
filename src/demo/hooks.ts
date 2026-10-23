'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { type DemoState, getState, getVersion, now, subscribe } from './store';

const serverSnapshot = () => null;

/**
 * A value selected from the demo store, recomputed when the store changes.
 * Null on the server and during hydration, so prerendered HTML never holds
 * time-based data (RESEARCH Pitfall 4): pages show their skeleton until mount.
 */
export function useDemoSnapshot<T>(
  select: (state: DemoState, now: number) => T,
): T | null {
  const version = useSyncExternalStore<number | null>(
    subscribe,
    getVersion,
    serverSnapshot,
  );
  // version is the store's change signal: a new version recomputes.
  return useMemo(
    () => (version === null ? null : select(getState(), now())),
    [version, select],
  );
}
