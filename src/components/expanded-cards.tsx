'use client';

// RED skeleton (implemented in the next commit).
import type { ReactNode } from 'react';
import type { CardLayout } from '@/components/card-layout-toggle';

export function toggleExpanded(
  set: ReadonlySet<string>,
  _id: string,
  _open: boolean,
): Set<string> {
  return new Set(set);
}

export type ExpandedState = { layout: CardLayout; ids: ReadonlySet<string> };

export function layoutReset(
  state: ExpandedState,
  _layout: CardLayout,
): ExpandedState {
  return state;
}

export function ExpandedCardsProvider({
  children,
}: {
  layout: CardLayout;
  initial?: Iterable<string>;
  children: ReactNode;
}) {
  return <>{children}</>;
}

export function useExpandedCard(_spineId: string) {
  return [false, (_open: boolean) => {}] as const;
}
