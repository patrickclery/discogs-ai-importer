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

describe('AppHeader logo (Phase 7 v2)', () => {
  const html = renderToStaticMarkup(h(AppHeader));
  const logo = html.match(/<a[^>]*>[\s\S]*?<\/a>/)?.[0] ?? '';
  const tokens = (re: RegExp) =>
    (logo.match(re)?.[1] ?? '').split(/\s+/).filter(Boolean);

  it('keeps the link target and accessible name, now mauve', () => {
    expect(logo).toContain('href="/upload"');
    expect(logo).toContain('aria-label="Discogs AI Importer"');
    const t = tokens(/^<a[^>]*class="([^"]*)"/);
    for (const c of [
      'text-primary',
      'text-base',
      'font-medium',
      'focus-visible:ring-[3px]',
      'focus-visible:ring-ring/50',
    ]) {
      expect(t).toContain(c);
    }
  });

  it('shows glowing logo text from lg, ending in a blinking cursor', () => {
    const t = tokens(/<span class="([^"]*)">Discogs AI Importer/);
    expect(t.sort()).toEqual(['glow-intense', 'hidden', 'lg:inline'].sort());
    expect(logo).toContain(
      'Discogs AI Importer<span aria-hidden="true" class="cursor-blink">_</span>',
    );
  });

  it('keeps the Disc3 icon aria-hidden at size-5', () => {
    const svg = logo.match(/<svg[^>]*>/)?.[0] ?? '';
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toMatch(/class="[^"]*\bsize-5\b/);
  });
});
