import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { type FC, createElement as h, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { emptyByStatus } from '@/lib/review-status';
import type { PhotoOption } from '@/lib/scan-types';
import { tagsWithSlot } from '../../test/helpers/radix-open';
import {
  fallbackOf,
  fallbackParamOf,
  useFallbackFilter,
} from './fallback-filter-toggle';
import { photoOptionItemProps, SpinesFilterBar } from './spines-filter-bar';
import { spinesQueryKey, spinesSearch } from './spines-view';

// G-04-7: in the /spines photo filter (D-11, REV-03) a long photo name ends
// with an ellipsis inside the list and shows the full name on hover. Radix
// renders the Select list through a Portal (nothing on the server), so the
// mock below renders it inline and open. The tests then read the real
// rendered rows, which include the real SelectItem base classes, not
// hand-copied ones (04-15 review WR-01, WR-02).

vi.mock('radix-ui', async (orig) =>
  (await import('../../test/helpers/radix-open')).openRadixInline(await orig()),
);

/** A 123-character name with no spaces, like the one from UAT test 7. */
const LONG_NAME = `${'Shelf_'.repeat(20)}IMG_3562.heic`.slice(-123);

const PHOTOS: PhotoOption[] = [
  { id: 'p1', filename: LONG_NAME, status: 'done' },
  { id: 'p2', filename: 'IMG_3562.heic', status: 'done' },
];

function renderOptions() {
  const html = renderToStaticMarkup(
    h(
      NuqsTestingAdapter,
      null,
      h(SpinesFilterBar, {
        counts: {
          all: 0,
          needsReview: 0,
          byStatus: emptyByStatus(),
          fallback: 0,
        },
        photoOptions: PHOTOS,
      }),
    ),
  );
  return tagsWithSlot(html, 'select-item');
}

describe('photoOptionItemProps', () => {
  it('carries the id and the full name on hover', () => {
    const props = photoOptionItemProps({ id: 'p1', filename: LONG_NAME });
    expect(props.value).toBe('p1');
    expect(props.title).toBe(LONG_NAME);
  });
});

describe('SpinesFilterBar photo list', () => {
  it('renders All photos plus one row per photo', () => {
    expect(LONG_NAME).toHaveLength(123);
    expect(LONG_NAME).not.toMatch(/\s/);
    expect(renderOptions()).toHaveLength(1 + PHOTOS.length);
  });

  it('shows the full name on hover on every photo row', () => {
    const [all, ...rows] = renderOptions();
    expect(all?.attr('title')).toBeUndefined();
    expect(rows.map((r) => r.attr('title'))).toEqual(
      PHOTOS.map((p) => p.filename),
    );
  });

  it('lets the name span shrink next to the real SelectItem display rule', () => {
    const [, ...rows] = renderOptions();
    for (const row of rows) {
      expect(row.attr('role')).toBe('option');
      expect(row.classes).toContain('*:[span]:last:flex');
      expect(row.classes).toContain('*:[span]:last:min-w-0');
    }
  });
});

// D-15: the Fallback toggle lists only the spines whose bulk import used
// another country (?fallback=1). It sits after Needs review and before the
// photo Select, and shows only once there is a fallback or the filter is on.

// createElement's typing wants children in props; pass them as an argument.
const Adapter = NuqsTestingAdapter as FC<{
  searchParams: string;
  children?: ReactNode;
}>;

function renderBar(fallbackCount: number, searchParams = '') {
  return renderToStaticMarkup(
    h(
      Adapter,
      { searchParams },
      h(SpinesFilterBar, {
        counts: {
          all: 5,
          needsReview: 1,
          byStatus: emptyByStatus(),
          fallback: fallbackCount,
        },
        photoOptions: PHOTOS,
      }),
    ),
  );
}

function fallbackToggles(html: string) {
  return tagsWithSlot(html, 'toggle').filter(
    (t) => t.attr('data-fallback-filter') !== undefined,
  );
}

function FallbackProbe() {
  const [on] = useFallbackFilter();
  return h('output', null, on ? 'on' : 'off');
}

function probe(searchParams: string) {
  return renderToStaticMarkup(h(Adapter, { searchParams }, h(FallbackProbe)));
}

describe('useFallbackFilter (T-06-26)', () => {
  it('reads true for ?fallback=1', () => {
    expect(probe('?fallback=1')).toContain('>on<');
  });

  it.each(['?fallback=0', '?fallback=true', '?fallback=', ''])(
    '%j reads false',
    (sp) => {
      expect(probe(sp)).toContain('>off<');
    },
  );

  it('only the exact value 1 turns it on', () => {
    expect(fallbackOf('1')).toBe(true);
    expect(fallbackOf('0')).toBe(false);
    expect(fallbackOf('true')).toBe(false);
    expect(fallbackOf(' 1')).toBe(false);
    expect(fallbackOf(null)).toBe(false);
  });

  it('turning it on writes 1 and turning it off removes the param', () => {
    expect(fallbackParamOf(true)).toBe('1');
    expect(fallbackParamOf(false)).toBeNull();
  });
});

describe('SpinesFilterBar Fallback toggle (D-15)', () => {
  it('renders Fallback with its count when there are fallbacks', () => {
    const html = renderBar(3);
    const [toggle] = fallbackToggles(html);
    expect(toggle).toBeDefined();
    expect(toggle?.attr('aria-pressed')).toBe('false');
    expect(html).toMatch(
      /data-fallback-filter=""[^>]*>Fallback <span class="[^"]*font-mono[^"]*text-muted-foreground[^"]*">3<\/span>/,
    );
  });

  it('sits after Needs review and before the photo Select', () => {
    const html = renderBar(3);
    const review = html.indexOf('Needs review');
    const fallback = html.indexOf('data-fallback-filter');
    const photo = html.indexOf('aria-label="Filter by photo"');
    expect(review).toBeGreaterThan(-1);
    expect(fallback).toBeGreaterThan(review);
    expect(photo).toBeGreaterThan(fallback);
  });

  it('is pressed with ?fallback=1', () => {
    const [toggle] = fallbackToggles(renderBar(3, '?fallback=1'));
    expect(toggle?.attr('aria-pressed')).toBe('true');
  });

  it('is hidden while its count is 0 and the filter is off', () => {
    expect(fallbackToggles(renderBar(0))).toHaveLength(0);
  });

  it('stays visible with a count of 0 while the filter is on', () => {
    const [toggle] = fallbackToggles(renderBar(0, '?fallback=1'));
    expect(toggle?.attr('aria-pressed')).toBe('true');
  });

  it('never uses the accent color', () => {
    const [toggle] = fallbackToggles(renderBar(3, '?fallback=1'));
    expect(toggle?.classes.some((c) => /^bg-primary/.test(c))).toBe(false);
  });
});

describe('the /spines request with Fallback (D-15)', () => {
  const base = { photo: null, review: false, status: null } as const;

  it('sends fallback=1 only when the filter is on', () => {
    expect(spinesSearch({ ...base, fallback: true })).toBe('?fallback=1');
    expect(spinesSearch({ ...base, fallback: false })).toBe('');
  });

  it('keeps the other filters beside it', () => {
    const qs = new URLSearchParams(
      spinesSearch({
        photo: 'p1',
        review: true,
        status: 'imported',
        fallback: true,
      }),
    );
    expect(Object.fromEntries(qs)).toEqual({
      photo: 'p1',
      review: '1',
      status: 'imported',
      fallback: '1',
    });
  });

  it('puts the filter in the query key', () => {
    expect(spinesQueryKey({ ...base, fallback: true })).toEqual([
      'spines',
      { photo: null, review: false, status: null, fallback: true },
    ]);
    expect(spinesQueryKey({ ...base, fallback: true })).not.toEqual(
      spinesQueryKey({ ...base, fallback: false }),
    );
  });
});
