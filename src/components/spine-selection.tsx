'use client';

import { createContext, type ReactNode, useContext, useMemo } from 'react';

// The bulk selection (D-05, D-06): selected spine ids, client state only,
// never in the URL. SpinesView owns the Set and prunes it to the shown,
// eligible spines after every data update; this context hands it to the
// bulk bar and the card checkboxes.

export type SpineSelection = {
  selected: ReadonlySet<string>;
  toggle: (id: string, on: boolean) => void;
  selectMany: (ids: readonly string[]) => void;
  clear: () => void;
};

const SelectionContext = createContext<SpineSelection | null>(null);

export function SelectionProvider({
  selected,
  onChange,
  children,
}: {
  selected: ReadonlySet<string>;
  onChange: (next: (prev: ReadonlySet<string>) => ReadonlySet<string>) => void;
  children: ReactNode;
}) {
  const value = useMemo<SpineSelection>(
    () => ({
      selected,
      toggle: (id, on) =>
        onChange((prev) => {
          if (prev.has(id) === on) return prev;
          const next = new Set(prev);
          if (on) next.add(id);
          else next.delete(id);
          return next;
        }),
      selectMany: (ids) => onChange((prev) => new Set([...prev, ...ids])),
      clear: () => onChange((prev) => (prev.size === 0 ? prev : new Set())),
    }),
    [selected, onChange],
  );
  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

/** The selection, or null outside a SelectionProvider (no bulk UI there). */
export function useSpineSelection(): SpineSelection | null {
  return useContext(SelectionContext);
}
