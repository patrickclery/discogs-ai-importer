'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useId,
  useMemo,
} from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { eligibilityReasonText } from '@/lib/bulk-copy';
import type { SpineDto } from '@/lib/scan-types';
import { spineNumber } from '@/lib/spine-review';

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

/** A 32px hit area around the 16px checkbox. */
const HIT_AREA = 'relative after:absolute after:-inset-2';

/**
 * A card's select checkbox (D-05, D-06). Eligible: a plain checkbox, and
 * Space toggles it with no request. Ineligible: disabled, inside a
 * focusable span whose tooltip says why (the Phase 4 disabled-button
 * pattern), with an sr-only copy for screen readers. Selection shows on
 * the checkbox only: no card border or background change, no accent.
 */
export function SpineSelectCheckbox({
  spine,
}: {
  spine: Pick<SpineDto, 'id' | 'index' | 'bulk'>;
}) {
  const selection = useSpineSelection();
  const reasonId = useId();
  if (!selection || !spine.bulk) return null;
  const label = `Select spine #${spineNumber(spine)}`;
  if (spine.bulk.eligible) {
    return (
      <Checkbox
        aria-label={label}
        className={HIT_AREA}
        checked={selection.selected.has(spine.id)}
        onCheckedChange={(c) => selection.toggle(spine.id, c === true)}
      />
    );
  }
  const reason = spine.bulk.reason
    ? eligibilityReasonText(spine.bulk.reason)
    : null;
  const box = (
    <Checkbox
      aria-label={label}
      aria-describedby={reason ? reasonId : undefined}
      checked={false}
      disabled
    />
  );
  if (!reason) return box;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so keyboard users reach the disabled reason
          tabIndex={0}
          className={`${HIT_AREA} inline-flex rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50`}
        >
          {box}
          <span id={reasonId} className="sr-only">
            {reason}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}
