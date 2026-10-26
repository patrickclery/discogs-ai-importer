import fs from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { badgeVariants } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { CardDescription, CardTitle } from '@/components/ui/card';
import { EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import { FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

// Phase 7 (THEME-05, THEME-06): filled primary hovers to lavender, every
// destructive fill is solid red with dark base text (never white), and link
// variants hover to lavender. Secondary, outline and ghost keep their neutral
// hover. Assert on whole class tokens so `hover:bg-primary-hover` is not
// mistaken for a `hover:bg-primary/90` substring.

function tokens(classes: string): string[] {
  return classes.split(/\s+/).filter(Boolean);
}

describe('buttonVariants (Mocha)', () => {
  it('default hovers to solid lavender, not 90% primary', () => {
    const t = tokens(buttonVariants({ variant: 'default' }));
    expect(t).toContain('hover:bg-primary-hover');
    expect(t).not.toContain('hover:bg-primary/90');
  });

  it('destructive is solid red with base text, never white', () => {
    const t = tokens(buttonVariants({ variant: 'destructive' }));
    expect(t).toContain('bg-destructive');
    expect(t).toContain('text-destructive-foreground');
    expect(t).toContain('hover:bg-destructive/90');
    expect(t).not.toContain('text-white');
    expect(t).not.toContain('dark:bg-destructive/60');
  });

  it('link hovers to lavender', () => {
    const t = tokens(buttonVariants({ variant: 'link' }));
    expect(t).toContain('text-primary');
    expect(t).toContain('hover:text-primary-hover');
  });

  it('ghost keeps its neutral hover', () => {
    const t = tokens(buttonVariants({ variant: 'ghost' }));
    expect(t).toContain('hover:bg-accent');
  });
});

describe('badgeVariants (Mocha)', () => {
  it('default link-badge hovers to solid lavender', () => {
    const t = tokens(badgeVariants({ variant: 'default' }));
    expect(t).toContain('[a&]:hover:bg-primary-hover');
    expect(t).not.toContain('[a&]:hover:bg-primary/90');
  });

  it('destructive is solid red with base text, never white', () => {
    const t = tokens(badgeVariants({ variant: 'destructive' }));
    expect(t).toContain('text-destructive-foreground');
    expect(t).not.toContain('text-white');
    expect(t).not.toContain('dark:bg-destructive/60');
  });

  it('link hovers to lavender', () => {
    const t = tokens(badgeVariants({ variant: 'link' }));
    expect(t).toContain('[a&]:hover:text-primary-hover');
  });
});

/** Class tokens of the element carrying the given data-slot. */
function slotTokens(html: string, slot: string): string[] {
  const tag = html.match(new RegExp(`<[a-z]+[^>]*data-slot="${slot}"[^>]*>`));
  const cls = tag?.[0].match(/class="([^"]*)"/)?.[1] ?? '';
  // renderToStaticMarkup escapes & and > inside attribute values.
  return tokens(
    cls
      .replaceAll('&gt;', '>')
      .replaceAll('&lt;', '<')
      .replaceAll('&amp;', '&'),
  );
}

describe('description links (Mocha)', () => {
  it('EmptyDescription links hover to lavender', () => {
    const html = renderToStaticMarkup(
      h(EmptyDescription, null, h('a', { href: '/settings' }, 'Settings')),
    );
    const t = slotTokens(html, 'empty-description');
    expect(t).toContain('[&>a:hover]:text-primary-hover');
    expect(t).not.toContain('[&>a:hover]:text-primary');
  });

  it('FieldDescription links hover to lavender', () => {
    const html = renderToStaticMarkup(
      h(FieldDescription, null, h('a', { href: '/settings' }, 'Settings')),
    );
    const t = slotTokens(html, 'field-description');
    expect(t).toContain('[&>a:hover]:text-primary-hover');
    expect(t).not.toContain('[&>a:hover]:text-primary');
  });
});

describe('Input selection (Mocha)', () => {
  it('uses the global 15% mauve ::selection, not a solid primary fill', () => {
    const t = slotTokens(renderToStaticMarkup(h(Input)), 'input');
    expect(t.filter((c) => c.startsWith('selection:'))).toEqual([]);
  });
});

describe('Alert destructive description (C-5)', () => {
  // Red/90 on the card is 4.48:1 on a scanline row; solid red is 5.43:1, or
  // 5.16 on a scanline row (UI-SPEC C-5).
  it('renders the description in solid red on the card', () => {
    const html = renderToStaticMarkup(
      h(Alert, { variant: 'destructive' }, h(AlertDescription, null, 'x')),
    );
    const t = slotTokens(html, 'alert');
    expect(t).toContain('*:data-[slot=alert-description]:text-destructive');
    expect(t).not.toContain(
      '*:data-[slot=alert-description]:text-destructive/90',
    );
    expect(t).toContain('text-destructive');
    expect(t).toContain('bg-card');
  });
});

describe('DropdownMenuItem destructive focus (C-6)', () => {
  // A Radix menu item needs a portalled menu to render, so check the source:
  // red on a red/5 tint is 4.99:1, or 4.77 on a scanline row (UI-SPEC C-6).
  // Red/10 falls under AA once the scanlines land.
  const src = fs.readFileSync(
    path.join(import.meta.dirname, 'ui', 'dropdown-menu.tsx'),
    'utf8',
  );

  it('focuses at red/5, never red/10 or red/20', () => {
    expect(src).toContain('data-[variant=destructive]:focus:bg-destructive/5');
    expect(src).not.toContain(
      'data-[variant=destructive]:focus:bg-destructive/10',
    );
    expect(src).not.toContain(
      'dark:data-[variant=destructive]:focus:bg-destructive/20',
    );
  });
});

describe('prose font (Phase 7 v2)', () => {
  // THEME-09: explanatory sentences read in IBM Plex Sans (font-prose), as
  // awesomer's .description does. Titles, labels and buttons stay Geist Mono.
  const render = (
    el: Parameters<typeof renderToStaticMarkup>[0],
    slot: string,
  ) => slotTokens(renderToStaticMarkup(el), slot);

  it('CardDescription is prose and keeps its size and muted color', () => {
    const t = render(h(CardDescription, null, 'x'), 'card-description');
    expect(t).toContain('font-prose');
    expect(t).toEqual(
      expect.arrayContaining(['text-sm', 'text-muted-foreground']),
    );
  });

  it('AlertDescription is prose and keeps its size and muted color', () => {
    const t = render(h(AlertDescription, null, 'x'), 'alert-description');
    expect(t).toContain('font-prose');
    expect(t).toEqual(
      expect.arrayContaining(['text-sm', 'text-muted-foreground']),
    );
  });

  it('EmptyDescription is prose and keeps its size, color and link hover', () => {
    const t = render(h(EmptyDescription, null, 'x'), 'empty-description');
    expect(t).toContain('font-prose');
    expect(t).toEqual(
      expect.arrayContaining([
        'text-sm/relaxed',
        'text-muted-foreground',
        '[&>a:hover]:text-primary-hover',
      ]),
    );
  });

  it('FieldDescription is prose and keeps its size, weight and color', () => {
    const t = render(h(FieldDescription, null, 'x'), 'field-description');
    expect(t).toContain('font-prose');
    expect(t).toEqual(
      expect.arrayContaining([
        'text-sm',
        'leading-normal',
        'font-normal',
        'text-muted-foreground',
      ]),
    );
  });

  it('titles stay mono', () => {
    expect(render(h(CardTitle, null, 'x'), 'card-title')).not.toContain(
      'font-prose',
    );
    expect(render(h(AlertTitle, null, 'x'), 'alert-title')).not.toContain(
      'font-prose',
    );
    expect(render(h(EmptyTitle, null, 'x'), 'empty-title')).not.toContain(
      'font-prose',
    );
  });

  it.each([
    'default',
    'destructive',
    'outline',
    'secondary',
    'ghost',
    'link',
  ] as const)(
    '%s button pins Geist Mono so Plex never cascades in',
    (variant) => {
      const t = tokens(buttonVariants({ variant }));
      expect(t).toContain('font-sans');
      expect(t).toContain('font-medium');
      expect(t).not.toContain('font-prose');
    },
  );
});
