import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  OTHER_WRAP_UTILITIES,
  tagsWithSlot,
} from '../../test/helpers/radix-open';
import { RescanButton } from './rescan-button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
} from './ui/alert-dialog';

// G-04-7 (04-15 review CR-01): the Re-scan confirm shows the photo file
// name in its title. A very long, unspaced name must stay inside the
// dialog. The fix bounds the single grid column in the shared
// AlertDialogContent, so every AlertDialog is protected.

vi.mock('radix-ui', async (orig) =>
  (await import('../../test/helpers/radix-open')).openRadixInline(await orig()),
);

/** A 123-character name with no spaces, like the one from UAT test 7. */
const LONG_NAME = `${'Shelf_'.repeat(20)}IMG_3562.heic`.slice(-123);

function renderRescan() {
  return renderToStaticMarkup(
    h(
      QueryClientProvider,
      { client: new QueryClient() },
      h(RescanButton, { photoId: 'p1', filename: LONG_NAME, active: false }),
    ),
  );
}

describe('AlertDialogContent (shared primitive)', () => {
  it('bounds its grid column for every alert dialog, with no className', () => {
    const html = renderToStaticMarkup(
      h(
        AlertDialog,
        null,
        h(AlertDialogContent, null, h(AlertDialogTitle, null, LONG_NAME)),
      ),
    );
    const [content] = tagsWithSlot(html, 'alert-dialog-content');
    expect(content?.classes).toContain('grid-cols-[minmax(0,1fr)]');
  });
});

describe('RescanButton confirm dialog', () => {
  it('keeps a long photo name inside the box', () => {
    expect(LONG_NAME).toHaveLength(123);
    expect(LONG_NAME).not.toMatch(/\s/);
    const html = renderRescan();
    expect(html).toContain(`Re-scan ${LONG_NAME}?`);

    const [content] = tagsWithSlot(html, 'alert-dialog-content');
    expect(content?.classes).toContain('grid-cols-[minmax(0,1fr)]');

    const [header] = tagsWithSlot(html, 'alert-dialog-header');
    expect(header?.classes).toContain('min-w-0');

    const [title] = tagsWithSlot(html, 'alert-dialog-title');
    expect(title?.classes).toContain('[overflow-wrap:anywhere]');
    expect(title?.classes).toContain('min-w-0');
  });

  it('gives the rendered title exactly one wrap rule', () => {
    const [title] = tagsWithSlot(renderRescan(), 'alert-dialog-title');
    expect(title).toBeDefined();
    for (const other of OTHER_WRAP_UTILITIES) {
      expect(title?.classes).not.toContain(other);
    }
  });
});
