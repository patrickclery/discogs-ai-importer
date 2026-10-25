'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { CardLayout } from '@/components/card-layout-toggle';

/** `set` with `id` opened or closed; the input is never mutated. */
export function toggleExpanded(
  set: ReadonlySet<string>,
  id: string,
  open: boolean,
): Set<string> {
  const next = new Set(set);
  if (open) next.add(id);
  else next.delete(id);
  return next;
}

/** The expanded spine ids and the layout they belong to. */
export type ExpandedState = { layout: CardLayout; ids: ReadonlySet<string> };

/**
 * Switching layouts drops every expanded card (UI-SPEC Card layout switch):
 * Detailed shows every card full, and coming back starts all collapsed.
 */
export function layoutReset(
  state: ExpandedState,
  layout: CardLayout,
): ExpandedState {
  return state.layout === layout ? state : { layout, ids: new Set() };
}

type ExpandedCardsValue = {
  ids: ReadonlySet<string>;
  setExpanded: (id: string, open: boolean) => void;
};

/** Outside a provider every card is collapsed and the toggle does nothing. */
const ExpandedCardsContext = createContext<ExpandedCardsValue>({
  ids: new Set(),
  setExpanded: () => {},
});

/**
 * Which compact cards are open (D-11). Client state keyed by spine id, never
 * in the URL, so polls and filter refetches keep a card open while it stays
 * in the list. Several cards may be open at once.
 */
export function ExpandedCardsProvider({
  layout,
  initial,
  children,
}: {
  layout: CardLayout;
  /** Ids open on first render (tests). */
  initial?: Iterable<string>;
  children: ReactNode;
}) {
  const [state, setState] = useState<ExpandedState>(() => ({
    layout,
    ids: new Set(initial ?? []),
  }));
  // Adjusting state while rendering when the layout prop changes (React's
  // documented pattern), so the stale ids never paint.
  const current = layoutReset(state, layout);
  if (current !== state) setState(current);

  const setExpanded = useCallback(
    (id: string, open: boolean) =>
      setState((s) => ({ ...s, ids: toggleExpanded(s.ids, id, open) })),
    [],
  );
  const value = useMemo(
    () => ({ ids: current.ids, setExpanded }),
    [current.ids, setExpanded],
  );
  return (
    <ExpandedCardsContext.Provider value={value}>
      {children}
    </ExpandedCardsContext.Provider>
  );
}

/** Whether this spine's card is open, and a setter. */
export function useExpandedCard(
  spineId: string,
): [boolean, (open: boolean) => void] {
  const { ids, setExpanded } = useContext(ExpandedCardsContext);
  const set = useCallback(
    (open: boolean) => setExpanded(spineId, open),
    [setExpanded, spineId],
  );
  return [ids.has(spineId), set];
}
