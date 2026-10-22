'use client';

import { createContext, type ReactNode, useContext } from 'react';

/**
 * What every /spines card needs about importing without prop drilling: the
 * folder new imports go to (D-01: the Add label names it; D-03: one Settings
 * folder for new imports) and the Discogs connection state.
 */
export type ImportUiValue = {
  folderName: string;
  connected: boolean;
  needsReconnect: boolean;
};

/** Outside a provider a card still labels and disables correctly. */
const DEFAULT_VALUE: ImportUiValue = {
  folderName: 'Uncategorized',
  connected: false,
  needsReconnect: false,
};

const ImportUiContext = createContext<ImportUiValue>(DEFAULT_VALUE);

export function ImportUiProvider({
  value,
  children,
}: {
  value: ImportUiValue;
  children: ReactNode;
}) {
  return (
    <ImportUiContext.Provider value={value}>
      {children}
    </ImportUiContext.Provider>
  );
}

export function useImportUi(): ImportUiValue {
  return useContext(ImportUiContext);
}

/**
 * Window event announcing a successful owner action on a spine (Add, Change
 * match, Retry, Link, Mark or Unmark). Plans 04-03, 04-08 and 04-13
 * dispatch it; Plan 04-05 listens to explain a card leaving the filter.
 */
export const SPINE_ACTION_EVENT = 'app:spine-action';

export type SpineActionDetail = { spineId: string; number: number };

export function announceSpineAction(spineId: string, number: number): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<SpineActionDetail>(SPINE_ACTION_EVENT, {
      detail: { spineId, number },
    }),
  );
}
