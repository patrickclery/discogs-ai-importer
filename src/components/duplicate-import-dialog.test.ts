import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DuplicateBody } from '@/lib/import-types';
import {
  OTHER_WRAP_UTILITIES,
  tagsWithSlot,
} from '../../test/helpers/radix-open';
import { CropWell, DuplicateImportDialog } from './duplicate-import-dialog';

// G-04-7: a very long, unspaced photo file name must stay inside the
// duplicate dialog (D-04, IMP-03). Radix renders the dialog through a
// Portal (nothing on the server), so the mock below renders it inline and
// open. The tests then read the real rendered classes, which include the
// real AlertDialog primitive bases, not hand-copied ones (04-15 review
// WR-01, WR-02).

vi.mock('radix-ui', async (orig) =>
  (await import('../../test/helpers/radix-open')).openRadixInline(await orig()),
);

const tokens = (s: string) => s.split(/\s+/).filter(Boolean);

/** A 123-character name with no spaces, like the one from UAT test 7. */
const LONG_NAME = `${'Shelf_'.repeat(20)}IMG_3562.heic`.slice(-123);
const LONG_CAPTION = `${LONG_NAME}, spine #4`;

const DUPLICATE: DuplicateBody = {
  error: 'duplicate',
  message: '',
  photo: LONG_NAME,
  spineNumber: 4,
  cropUrl: null,
  done: false,
};

function renderDialog() {
  return renderToStaticMarkup(
    createElement(DuplicateImportDialog, {
      duplicate: DUPLICATE,
      spineNumber: 3,
      cropUrl: null,
      pending: false,
      error: null,
      onConfirm: () => {},
      onCancel: () => {},
      onCloseAutoFocus: () => {},
    }),
  );
}

describe('DuplicateImportDialog with a long photo name', () => {
  it('renders the long name in the title', () => {
    expect(LONG_NAME).toHaveLength(123);
    expect(LONG_NAME).not.toMatch(/\s/);
    const html = renderDialog();
    expect(tagsWithSlot(html, 'alert-dialog-title')).toHaveLength(1);
    expect(html).toContain(LONG_NAME);
  });

  it('bounds the rendered content grid column to the box', () => {
    const [content] = tagsWithSlot(renderDialog(), 'alert-dialog-content');
    expect(content?.classes).toContain('grid-cols-[minmax(0,1fr)]');
  });

  it('lets the rendered title wrap anywhere and shrink', () => {
    const [title] = tagsWithSlot(renderDialog(), 'alert-dialog-title');
    expect(title?.classes).toContain('[overflow-wrap:anywhere]');
    expect(title?.classes).toContain('min-w-0');
  });

  it('gives the rendered title exactly one wrap rule', () => {
    const [title] = tagsWithSlot(renderDialog(), 'alert-dialog-title');
    expect(title).toBeDefined();
    for (const other of OTHER_WRAP_UTILITIES) {
      expect(title?.classes).not.toContain(other);
    }
  });
});

describe('CropWell', () => {
  it('clamps a long caption to two lines with the full name on hover', () => {
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
