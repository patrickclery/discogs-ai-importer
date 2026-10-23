import { cn } from 'cn';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CropWell,
  DUPLICATE_DIALOG_CONTENT_CLASS,
  DUPLICATE_DIALOG_TITLE_CLASS,
} from './duplicate-import-dialog';

// G-04-7: a very long, unspaced photo file name must stay inside the
// duplicate dialog (D-04, IMP-03). The dialog itself renders through a
// Radix Portal (nothing on the server), so the classes live in exported
// constants that the JSX consumes and these tests pin.

const tokens = (s: string) => s.split(/\s+/).filter(Boolean);

/** A 123-character name with no spaces, like the one from UAT test 7. */
const LONG_NAME = `${'Shelf_'.repeat(20)}IMG_3562.heic`.slice(-123);
const LONG_CAPTION = `${LONG_NAME}, spine #4`;

describe('DUPLICATE_DIALOG_TITLE_CLASS', () => {
  it('wraps anywhere and can shrink', () => {
    const t = tokens(DUPLICATE_DIALOG_TITLE_CLASS);
    expect(t).toContain('[overflow-wrap:anywhere]');
    expect(t).toContain('min-w-0');
  });

  it('has no second overflow-wrap or word-break utility', () => {
    const t = tokens(DUPLICATE_DIALOG_TITLE_CLASS);
    for (const other of [
      'break-words',
      'wrap-break-word',
      'wrap-normal',
      'break-normal',
      'break-keep',
      'break-all',
    ]) {
      expect(t).not.toContain(other);
    }
  });

  it('survives cn merging with the title base', () => {
    const t = tokens(cn('text-lg font-medium', DUPLICATE_DIALOG_TITLE_CLASS));
    expect(t).toContain('[overflow-wrap:anywhere]');
    expect(t).toContain('min-w-0');
  });
});

describe('DUPLICATE_DIALOG_CONTENT_CLASS', () => {
  it('bounds the content grid column to the box', () => {
    expect(tokens(DUPLICATE_DIALOG_CONTENT_CLASS)).toContain(
      'grid-cols-[minmax(0,1fr)]',
    );
  });

  it('survives cn merging with the content base', () => {
    const merged = cn(
      'grid w-full max-w-[calc(100%-2rem)] gap-4 sm:max-w-lg',
      DUPLICATE_DIALOG_CONTENT_CLASS,
    );
    expect(tokens(merged)).toContain('grid-cols-[minmax(0,1fr)]');
  });
});

describe('CropWell', () => {
  it('clamps a long caption to two lines with the full name on hover', () => {
    expect(LONG_NAME).toHaveLength(123);
    expect(LONG_NAME).not.toMatch(/\s/);
    const html = renderToStaticMarkup(
      createElement(CropWell, {
        url: '/api/files/crops/x.jpg',
        alt: 'Spine 4',
        caption: LONG_CAPTION,
      }),
    );
    const fig = html.match(/<figure class="([^"]*)"/);
    expect(fig?.[1] && tokens(fig[1])).toContain('min-w-0');
    const img = html.match(/<img[^>]*class="([^"]*)"/);
    expect(img?.[1] && tokens(img[1])).toContain('max-w-full');
    const cap = html.match(/<figcaption title="([^"]*)" class="([^"]*)"/);
    expect(cap?.[1]).toBe(LONG_CAPTION);
    const capTokens = tokens(cap?.[2] ?? '');
    expect(capTokens).toContain('line-clamp-2');
    expect(capTokens).toContain('break-all');
  });

  it('shows a short caption unchanged', () => {
    const html = renderToStaticMarkup(
      createElement(CropWell, {
        url: '/api/files/crops/x.jpg',
        alt: 'Spine 3',
        caption: 'This spine (#3)',
      }),
    );
    expect(html).toMatch(/<figcaption[^>]*>This spine \(#3\)<\/figcaption>/);
  });
});
