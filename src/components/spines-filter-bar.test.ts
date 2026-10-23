import { cn } from 'cn';
import { describe, expect, it } from 'vitest';
import {
  PHOTO_OPTION_ITEM_CLASS,
  photoOptionItemProps,
} from './spines-filter-bar';

// G-04-7: in the /spines photo filter (D-11, REV-03) a long photo name ends
// with an ellipsis inside the list and shows the full name on hover. The
// Select popover renders through a Radix Portal (nothing on the server), so
// the row props live in an exported helper that the JSX spreads.

const tokens = (s: string) => s.split(/\s+/).filter(Boolean);

/** A 123-character name with no spaces, like the one from UAT test 7. */
const LONG_NAME = `${'Shelf_'.repeat(20)}IMG_3562.heic`.slice(-123);

describe('photoOptionItemProps', () => {
  it('carries the id, the full name on hover and the shrink class', () => {
    expect(LONG_NAME).toHaveLength(123);
    expect(LONG_NAME).not.toMatch(/\s/);
    const props = photoOptionItemProps({ id: 'p1', filename: LONG_NAME });
    expect(props.value).toBe('p1');
    expect(props.title).toBe(LONG_NAME);
    expect(tokens(props.className)).toContain('*:[span]:last:min-w-0');
  });

  it('uses PHOTO_OPTION_ITEM_CLASS as the className', () => {
    expect(
      photoOptionItemProps({ id: 'p1', filename: LONG_NAME }).className,
    ).toBe(PHOTO_OPTION_ITEM_CLASS);
  });

  it('treats a short name the same way', () => {
    const props = photoOptionItemProps({ id: 'p2', filename: 'IMG_3562.heic' });
    expect(props).toEqual({
      value: 'p2',
      title: 'IMG_3562.heic',
      className: PHOTO_OPTION_ITEM_CLASS,
    });
  });
});

describe('PHOTO_OPTION_ITEM_CLASS', () => {
  it('sits next to the SelectItem display rule after cn merging', () => {
    const merged = tokens(
      cn(
        'relative flex w-full items-center gap-2 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2',
        PHOTO_OPTION_ITEM_CLASS,
      ),
    );
    expect(merged).toContain('*:[span]:last:flex');
    expect(merged).toContain('*:[span]:last:min-w-0');
  });
});
