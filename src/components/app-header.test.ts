import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// Phase 7 sticky header: translucent base with blur, and a near-opaque
// fallback where backdrop-filter is unsupported (IN-01), matching the
// photo-section sticky headers.

vi.mock('@/components/nav-link', () => ({ NavLink: () => null }));
vi.mock('@/components/status-indicator', () => ({
  StatusIndicator: () => null,
}));

const { AppHeader } = await import('@/components/app-header');

function headerTokens(): string[] {
  const html = renderToStaticMarkup(h(AppHeader));
  const cls = html.match(/<header[^>]*class="([^"]*)"/)?.[1] ?? '';
  return cls.split(/\s+/).filter(Boolean);
}

describe('AppHeader (Mocha)', () => {
  it('is base at 80% with blur where backdrop-filter is supported', () => {
    const t = headerTokens();
    expect(t).toContain('backdrop-blur-sm');
    expect(t).toContain('supports-[backdrop-filter]:bg-background/80');
    expect(t).not.toContain('bg-card');
  });

  it('falls back to base at 95% without backdrop-filter', () => {
    const t = headerTokens();
    expect(t).toContain('bg-background/95');
    expect(t).not.toContain('bg-background/80');
  });
});
