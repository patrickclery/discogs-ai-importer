import { describe, expect, it } from 'vitest';
import { coverSvg } from './cover-svg';

// D-08 / T-05-11: generated covers are text tiles with escaped text, no
// script, no external reference and xmlns as the only URL.

/** The text content of every <text> element, in order. */
function lines(svg: string): string[] {
  return [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
}

describe('coverSvg', () => {
  it('is a single svg whose only URL is the SVG namespace', () => {
    const svg = coverSvg({
      releaseId: 123,
      title: 'Massive Attack - Mezzanine',
    });
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg.match(/<svg\b/g)).toHaveLength(1);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg.match(/http/g)).toHaveLength(1);
    for (const bad of ['<script', '<image', 'href', 'xlink', 'url(']) {
      expect(svg.toLowerCase()).not.toContain(bad);
    }
  });

  it('escapes &, <, >, " and \' in titles', () => {
    const svg = coverSvg({
      releaseId: 7,
      title: `A&B <x> - "Q" 'r' <script>alert(1)</script>`,
    });
    expect(svg).not.toContain('<x>');
    expect(svg).not.toContain('<script');
    expect(svg).toContain('A&amp;B &lt;x&gt;');
    expect(svg).toContain('&quot;Q&quot;');
    expect(svg).toContain('&apos;r&apos;');
    // Every & left in the text starts an entity.
    for (const text of lines(svg)) {
      expect(text.replace(/&(amp|lt|gt|quot|apos);/g, '')).not.toMatch(
        /[&<>"']/,
      );
    }
  });

  it('is deterministic', () => {
    const a = coverSvg({ releaseId: 4242, title: 'Björk - Post' });
    const b = coverSvg({ releaseId: 4242, title: 'Björk - Post' });
    expect(a).toBe(b);
  });

  it('derives the background from the release id', () => {
    const fill = (svg: string) => /<rect\b[^>]*fill="([^"]+)"/.exec(svg)?.[1];
    const a = fill(coverSvg({ releaseId: 1, title: 'X - Y' }));
    const b = fill(coverSvg({ releaseId: 2, title: 'X - Y' }));
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it('puts the artist on its own line before the title', () => {
    const out = lines(coverSvg({ releaseId: 5, title: 'Artist - Title' }));
    expect(out).toEqual(['Artist', 'Title']);
  });

  it('uses the whole string as the title when there is no separator', () => {
    const out = lines(coverSvg({ releaseId: 5, title: 'Untitled' }));
    expect(out).toEqual(['Untitled']);
  });

  it('wraps at about 18 characters and truncates long text with …', () => {
    const long = 'word '.repeat(60).trim();
    expect(long.length).toBeGreaterThanOrEqual(299);
    const out = lines(coverSvg({ releaseId: 9, title: `Band - ${long}` }));
    expect(out[0]).toBe('Band');
    const titleLines = out.slice(1);
    expect(titleLines.length).toBeLessThanOrEqual(3);
    for (const l of titleLines)
      expect(Array.from(l).length).toBeLessThanOrEqual(18);
    expect(titleLines.at(-1)?.endsWith('…')).toBe(true);
  });

  it('truncates a 300-character unbroken title', () => {
    const out = lines(coverSvg({ releaseId: 9, title: 'x'.repeat(300) }));
    expect(out.length).toBeLessThanOrEqual(3);
    expect(out.at(-1)?.endsWith('…')).toBe(true);
    expect(out.join('').length).toBeLessThan(60);
  });
});
