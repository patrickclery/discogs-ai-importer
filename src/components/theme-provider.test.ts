import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from './theme-provider';

// Phase 7 (THEME-02): dark only. next-themes' inline script receives
// (attribute, storageKey, defaultTheme, forcedTheme, themes, value,
// enableSystem, enableColorScheme); dropping forcedTheme or turning
// enableSystem back on changes this argument list.

describe('ThemeProvider (dark only, Phase 7)', () => {
  const html = renderToStaticMarkup(
    h(ThemeProvider, null, h('span', null, 'x')),
  );

  it('renders its children', () => {
    expect(html).toContain('<span>x</span>');
  });

  it('forces dark with the OS setting ignored', () => {
    expect(html).toContain(
      '("class","theme","dark","dark",["light","dark"],null,false,true)</script>',
    );
  });
});
