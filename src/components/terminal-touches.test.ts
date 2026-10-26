import fs from 'node:fs';
import path from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AsciiWordmark, WORDMARK } from './ascii-wordmark';
import { MdPrefix } from './md-prefix';
import { PhotoStatusList } from './photo-status-list';

// Phase 7 v2 terminal and markdown touches on /upload (07-06, THEME-10):
// the asciiMono wordmark, the decorative ## / > prefixes, the gradient title
// and the `## Photos` mini card.

const src = (...p: string[]) =>
  fs.readFileSync(path.join(import.meta.dirname, ...p), 'utf8');

const tokensOf = (html: string, re: RegExp): string[] =>
  (html.match(re)?.[1] ?? '').split(/\s+/).filter(Boolean);

describe('WORDMARK', () => {
  const lines = WORDMARK.split('\n');

  it('is 12 lines: 6 of 53 columns (DISCOGS), then 6 of 79 (AI IMPORTER)', () => {
    expect(lines.map((l) => [...l].length)).toEqual([
      53, 53, 53, 53, 53, 53, 79, 79, 79, 79, 79, 79,
    ]);
  });

  it('keeps line 7 leading space and has no trailing newline', () => {
    expect(lines[6]?.startsWith(' ')).toBe(true);
    expect(lines[6]?.endsWith(' ')).toBe(true);
    expect(WORDMARK.endsWith('\n')).toBe(false);
  });

  it('only uses glyphs the asciiMono subset covers', () => {
    for (const ch of WORDMARK) {
      expect(ch).toMatch(/[ -~ ─-▟\n]/);
    }
  });
});

describe('AsciiWordmark', () => {
  const html = renderToStaticMarkup(h(AsciiWordmark));

  it('is an aria-hidden wrapper shown from sm', () => {
    expect(html.startsWith('<div aria-hidden="true"')).toBe(true);
    expect(tokensOf(html, /^<div[^>]*class="([^"]*)"/).sort()).toEqual(
      ['hidden', 'overflow-hidden', 'pb-2', 'sm:block'].sort(),
    );
  });

  it('draws the wordmark in a glowing mauve ascii-art pre', () => {
    const t = tokensOf(html, /<pre[^>]*class="([^"]*)"/);
    expect(t.sort()).toEqual(['ascii-art', 'glow', 'text-primary'].sort());
    expect(t).not.toContain('gradient-text');
    const text = html.match(/<pre[^>]*>([\s\S]*)<\/pre>/)?.[1];
    expect(text).toBe(WORDMARK);
  });
});

describe('MdPrefix', () => {
  it('renders an aria-hidden select-none mauve ## prefix', () => {
    expect(renderToStaticMarkup(h(MdPrefix, { marker: '##' }))).toBe(
      '<span aria-hidden="true" class="select-none text-primary">## </span>',
    );
  });

  it('renders an aria-hidden select-none mauve > prefix', () => {
    expect(renderToStaticMarkup(h(MdPrefix, { marker: '>' }))).toBe(
      '<span aria-hidden="true" class="select-none text-primary">&gt; </span>',
    );
  });
});

describe('PhotoStatusList (empty)', () => {
  const html = renderToStaticMarkup(
    h(
      QueryClientProvider,
      { client: new QueryClient() },
      h(PhotoStatusList, { initialPhotos: [] }),
    ),
  );
  const prefix = (m: string) =>
    `<span aria-hidden="true" class="select-none text-primary">${m} </span>`;

  it('is a mini card that keeps gap-0 and py-0, with no numeral', () => {
    const open = html.match(/<div[^>]*data-slot="card"[^>]*>/)?.[0] ?? '';
    expect(open).toContain('data-variant="mini"');
    const t = tokensOf(open, /class="([^"]*)"/);
    expect(t).toContain('gap-0');
    expect(t).toContain('py-0');
    expect(html).not.toContain('data-corner-numeral');
  });

  it('titles the card ## Photos', () => {
    expect(html).toMatch(
      new RegExp(`<h2[^>]*>${prefix('##')}Photos</h2>`.replace(/\//g, '\\/')),
    );
  });

  it('starts the empty line with a > prompt and keeps its wording', () => {
    expect(html).toContain(
      `${prefix('&gt;')}No photos yet. Photos you drop appear here with their progress.</p>`,
    );
  });
});

describe.each([['page.tsx'], ['page.demo.tsx']])(
  '/upload %s (source)',
  (file) => {
    const s = src('..', 'app', 'upload', file);

    it('puts the wordmark directly before the h1', () => {
      const w = s.indexOf('<AsciiWordmark />');
      expect(w).toBeGreaterThan(-1);
      expect(w).toBeLessThan(s.indexOf('<h1'));
    });

    it('has a gradient h1', () => {
      expect(s).toContain(
        '<h1 className="gradient-text w-fit text-2xl font-medium tracking-tight">',
      );
    });

    it('starts the 80ch intro with a > prompt and keeps its wording', () => {
      const p = s.match(/<p className="([^"]*)">\s*<MdPrefix marker=">" \/>/);
      expect(p?.[1].split(/\s+/)).toContain('max-w-[80ch]');
      expect(s).toContain('Drop photos of your CD shelves.');
    });
  },
);
