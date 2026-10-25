'use client';

import { LayoutGrid, Rows3 } from 'lucide-react';
import { useQueryState } from 'nuqs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

/** The /spines card layout (D-13): compact grid or full-card stack. */
export type CardLayout = 'compact' | 'detailed';

/** `?view=detailed` is Detailed; absent or anything else is Compact. */
export function layoutOf(raw: string | null): CardLayout {
  return raw === 'detailed' ? 'detailed' : 'compact';
}

/** The `view` param for a layout: Compact removes it. */
export function layoutParamOf(layout: CardLayout): string | null {
  return layout === 'detailed' ? 'detailed' : null;
}

/** The layout from the URL; switching keeps the scroll position. */
export function useCardLayout() {
  const [raw, setRaw] = useQueryState('view', { scroll: false });
  const layout = layoutOf(raw);
  const setLayout = (next: CardLayout) => setRaw(layoutParamOf(next));
  return [layout, setLayout] as const;
}

/**
 * The Compact / Detailed switch, the last item of filter row 2 (UI-SPEC Card
 * layout switch). Clicking the pressed item keeps it pressed.
 */
export function CardLayoutToggle() {
  const [layout, setLayout] = useCardLayout();
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      aria-label="Card layout"
      value={layout}
      onValueChange={(v) => {
        if (v === 'compact' || v === 'detailed') void setLayout(v);
      }}
    >
      <ToggleGroupItem value="compact">
        <LayoutGrid aria-hidden="true" />
        Compact
      </ToggleGroupItem>
      <ToggleGroupItem value="detailed">
        <Rows3 aria-hidden="true" />
        Detailed
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
