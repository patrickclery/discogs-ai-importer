import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { COMBINED_FILTERS_BODY, NoFallbacks } from './spines-view';

// D-15, UI-SPEC /spines empty states: Fallback alone with nothing to show,
// and two or more of status, Needs review and Fallback with nothing to show.

function noFallbacks(country: string) {
  return renderToStaticMarkup(h(NoFallbacks, { country, onShowAll: () => {} }));
}

describe('NoFallbacks (Empty: Fallback)', () => {
  it('reads No fallbacks with the Canadian body for Canada', () => {
    const html = noFallbacks('Canada');
    expect(html).toContain('No fallbacks');
    expect(html).toContain(
      'Every bulk-imported spine got its Canadian pressing.',
    );
  });

  it('names a country without a demonym as "pressing from"', () => {
    expect(noFallbacks('Hong Kong')).toContain(
      'Every bulk-imported spine got its pressing from Hong Kong.',
    );
  });

  it('offers one outline Show all spines action', () => {
    const html = noFallbacks('Canada');
    const buttons = html.match(/<button[^>]*>[^<]*<\/button>/g) ?? [];
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toContain('Show all spines');
    expect(buttons[0]).toContain('data-variant="outline"');
  });

  it('uses a heading at 500, never semibold or bold', () => {
    const html = noFallbacks('Canada');
    expect(html).toMatch(
      /class="[^"]*text-base font-medium[^"]*"[^>]*>No fallbacks/,
    );
    expect(html).not.toMatch(/font-(semibold|bold)/);
  });
});

describe('the combined filters empty state', () => {
  it('names Fallback among the filters to turn off', () => {
    expect(COMBINED_FILTERS_BODY).toBe(
      'Turn off Needs review or Fallback, or pick another status.',
    );
  });
});
