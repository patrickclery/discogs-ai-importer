'use client';

// RED skeleton (implemented in the next commit).
export type CardLayout = 'compact' | 'detailed';

export function layoutOf(_raw: string | null): CardLayout {
  return 'compact';
}

export function layoutParamOf(_layout: CardLayout): string | null {
  return 'compact';
}

export function useCardLayout() {
  return ['compact' as CardLayout, (_l: CardLayout) => {}] as const;
}
