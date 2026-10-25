import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { emptyByStatus } from '@/lib/review-status';
import type { PhotoOption } from '@/lib/scan-types';
import { tagsWithSlot } from '../../test/helpers/radix-open';
import { photoOptionItemProps, SpinesFilterBar } from './spines-filter-bar';

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
