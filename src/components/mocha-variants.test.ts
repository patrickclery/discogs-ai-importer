import { describe, expect, it } from 'vitest';
import { badgeVariants } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';

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
