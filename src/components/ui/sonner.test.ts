import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// Phase 7 (THEME-02): toasts are always dark. Capture the props the wrapper
// hands to sonner, with next-themes reporting "light" to prove it is ignored.
const captured: Array<Record<string, unknown>> = [];

vi.mock('sonner', () => ({
  Toaster: (props: Record<string, unknown>) => {
    captured.push(props);
    return null;
  },
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', resolvedTheme: 'light' }),
}));

import { Toaster } from './sonner';

describe('Toaster (dark only, Phase 7)', () => {
  it('passes theme="dark" to sonner even when next-themes says light', () => {
    captured.length = 0;
    renderToStaticMarkup(h(Toaster));
    expect(captured).toHaveLength(1);
    expect(captured[0].theme).toBe('dark');
  });
});
