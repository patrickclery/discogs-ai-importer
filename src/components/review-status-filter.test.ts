import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { emptyByStatus } from '@/lib/review-status';
import { tagsWithSlot } from '../../test/helpers/radix-open';
import { ReviewStatusFilter } from './review-status-filter';

// G-06-9: at phone width the status tabs sat in a sideways scroller, so
// "Not found" was cut off and "Not on Discogs" and "Failed" were off-screen.
// The row now wraps, so every tab stays visible.

function render() {
  const byStatus = { ...emptyByStatus(), pending: 3, failed: 2 };
  return renderToStaticMarkup(
    h(
      NuqsTestingAdapter,
      null,
      h(ReviewStatusFilter, { counts: { all: 5, byStatus } }),
    ),
  );
}

/** Inner markup of each data-status-filter-item button. */
function items(html: string): string[] {
  return [
    ...html.matchAll(
      /<button[^>]*data-status-filter-item[^>]*>(.*?)<\/button>/g,
    ),
  ].map((m) => m[1]);
}

/** Visible text of a markup fragment (tags and comments stripped). */
const text = (fragment: string) =>
  fragment.replace(/<!--.*?-->/g, '').replace(/<[^>]*>/g, '');

describe('ReviewStatusFilter (G-06-9)', () => {
  it('renders all seven tabs, each with its count', () => {
    expect(items(render()).map(text)).toEqual([
      'All 5',
      'Pending 3',
      'Matched 0',
      'Imported 0',
      'Not found 0',
      'Not on Discogs 0',
      'Failed 2',
    ]);
  });

  it('wraps the tab row with spaced items instead of a joined row', () => {
    const groups = tagsWithSlot(render(), 'toggle-group');
    expect(groups).toHaveLength(1);
    expect(groups[0].classes).toContain('flex-wrap');
    expect(groups[0].attr('data-spacing')).toBeDefined();
    expect(groups[0].attr('data-spacing')).not.toBe('0');
  });

  it('has no sideways scroller and no fixed max-content width', () => {
    const html = render();
    expect(html).not.toMatch(/overflow-x-(auto|scroll)/);
    expect(html).not.toMatch(/\bw-max\b/);
  });

  it('keeps the Failed count in the destructive color when above zero', () => {
    const failed = items(render()).at(-1) ?? '';
    expect(failed).toMatch(
      /<span class="[^"]*\btext-destructive\b[^"]*">2<\/span>/,
    );
  });
});
