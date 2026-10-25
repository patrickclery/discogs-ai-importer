import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  countrySaveDecision,
  countrySaveErrorText,
  PreferredCountryField,
} from './preferred-country-field';

// Settings "Preferred country" (D-14, UI-SPEC). The save rule and the error
// sentence are pure; the field is rendered on the server to check its copy
// and input attributes. The save action and the toast are mocked.

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
vi.mock('@/app/settings/actions', () => ({
  savePreferredCountry: vi.fn(),
}));

const DESCRIPTION =
  "Bulk import picks this country's CD pressing of each top match. Write it the way Discogs does, such as Canada, US or UK.";

function decode(html: string): string {
  return html.replaceAll('&#x27;', "'").replaceAll('&quot;', '"');
}

describe('countrySaveDecision', () => {
  it.each([
    ['Canada', 'Canada', 'skip'],
    [' Canada ', 'Canada', 'skip'],
    ['  ', 'Canada', 'empty'],
    ['', 'Canada', 'empty'],
    [' UK ', 'Canada', 'save'],
    ['canada', 'Canada', 'save'],
  ] as const)('(%j, %j) = %s', (draft, saved, want) => {
    expect(countrySaveDecision(draft, saved)).toBe(want);
  });
});

describe('countrySaveErrorText', () => {
  it('wraps the bare reason in the UI-SPEC sentence', () => {
    expect(countrySaveErrorText('the disk is full')).toBe(
      'Not saved: the disk is full. Leave the field again to retry.',
    );
  });

  it('does not double a trailing period', () => {
    expect(countrySaveErrorText('the disk is full.')).toBe(
      'Not saved: the disk is full. Leave the field again to retry.',
    );
  });
});

describe('PreferredCountryField markup', () => {
  const html = decode(
    renderToStaticMarkup(
      h(PreferredCountryField, { initialCountry: 'Canada' }),
    ),
  );

  it('shows the label, the saved country and the description', () => {
    expect(html).toContain('>Preferred country</label>');
    expect(html).toContain(DESCRIPTION);
    expect(html).toMatch(/<input[^>]*value="Canada"/);
  });

  it('caps the input at 40 characters with no autocomplete or spellcheck', () => {
    // React 19 keeps the camelCase names in server markup; HTML is
    // case-insensitive, so compare in lower case.
    const input = html.match(/<input[^>]*>/)?.[0] ?? '';
    const attrs = input.toLowerCase();
    expect(attrs).toContain('maxlength="40"');
    expect(attrs).toContain('autocomplete="off"');
    expect(attrs).toContain('spellcheck="false"');
    expect(input).toContain('w-64 max-w-full');
    expect(input).toMatch(/id="([^"]+)"/);
    const id = input.match(/id="([^"]+)"/)?.[1];
    expect(html).toContain(`for="${id}"`);
  });

  it('shows no error and no spinner before a save', () => {
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('role="status"');
  });
});
