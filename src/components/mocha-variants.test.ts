import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { badgeVariants } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { EmptyDescription } from '@/components/ui/empty';
import { FieldDescription } from '@/components/ui/field';

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
