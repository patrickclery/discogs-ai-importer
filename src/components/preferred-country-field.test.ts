import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DiscogsCard } from './discogs-card';
import {
  COUNTRY_EMPTY_COPY,
  countrySaveDecision,
  countrySaveErrorText,
  FallbackCountryField,
  fallbackCountryHint,
  PreferredCountryField,
  SAME_COUNTRY_HINT,
} from './preferred-country-field';

// Settings "Preferred country" (D-14, UI-SPEC). The save rule and the error
// sentence are pure; the field is rendered on the server to check its copy
// and input attributes. The save action and the toast are mocked.

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
vi.mock('@/app/settings/actions', () => ({
  savePreferredCountry: vi.fn(),
  saveFallbackCountry: vi.fn(),
}));

// The Discogs card's other children need a router, a query client or the
// server; they are stubbed so only the two country fields render.
vi.mock('./callback-url-field', () => ({ CallbackUrlField: () => null }));
vi.mock('./collection-folder-field', () => ({
  CollectionFolderField: () => null,
}));
vi.mock('./connect-discogs-button', () => ({
  CONNECT_BUTTON_ID: 'connect-discogs',
  ConnectDiscogsButton: () => null,
}));
vi.mock('./discogs-connect-notice', () => ({
  DiscogsConnectNotice: () => null,
}));
vi.mock('./disconnect-discogs-button', () => ({
  DisconnectDiscogsButton: () => null,
}));
vi.mock('./paste-code-form', () => ({ PasteCodeForm: () => null }));
vi.mock('./secret-field', () => ({ DiscogsCredentials: () => null }));
vi.mock('./test-discogs-button', () => ({ TestDiscogsButton: () => null }));

const DESCRIPTION =
  "Bulk import picks this country's CD pressing of each top match. Write it the way Discogs does, such as Canada, US or UK.";
const FALLBACK_DESCRIPTION =
  "If Discogs lists no pressing from the preferred country, bulk import picks this country's CD pressing next, or else keeps the top match. Write it the way Discogs does, such as US, UK or Germany.";

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

// Fallback country (G-06-side-1): the same field pattern, its own copy.
describe('FallbackCountryField markup', () => {
  // Rendered inside each test, so a render error fails that test only.
  const render = () =>
    decode(
      renderToStaticMarkup(
        h(FallbackCountryField, {
          initialCountry: 'US',
          preferredCountry: 'Canada',
        }),
      ),
    );

  it('shows the label, the saved country and the description', () => {
    const html = render();
    expect(html).toContain('>Fallback country</label>');
    expect(html).toContain(FALLBACK_DESCRIPTION);
    expect(html).toMatch(/<input[^>]*value="US"/);
  });

  it('uses its own ids, a 40-character cap and no autocomplete or spellcheck', () => {
    const html = render();
    const input = html.match(/<input[^>]*>/)?.[0] ?? '';
    const attrs = input.toLowerCase();
    expect(input).toContain('id="fallback-country"');
    expect(html).toContain('for="fallback-country"');
    expect(attrs).toContain('maxlength="40"');
    expect(attrs).toContain('autocomplete="off"');
    expect(attrs).toContain('spellcheck="false"');
  });

  it('shows no error and no spinner before a save', () => {
    const html = render();
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('role="status"');
  });

  it('shows no same-country hint when the countries differ', () => {
    expect(render()).not.toContain(SAME_COUNTRY_HINT);
  });

  it('IN-02: notes when the fallback is the preferred country', () => {
    const html = decode(
      renderToStaticMarkup(
        h(FallbackCountryField, {
          initialCountry: 'USA',
          preferredCountry: 'US',
        }),
      ),
    );
    expect(html).toContain(FALLBACK_DESCRIPTION);
    expect(html).toContain(SAME_COUNTRY_HINT);
  });
});

describe('fallbackCountryHint (IN-02)', () => {
  it('reads the plain note', () => {
    expect(SAME_COUNTRY_HINT).toBe(
      'Same as the preferred country, so bulk import goes straight to the top match.',
    );
  });

  it.each([
    ['US', 'US', SAME_COUNTRY_HINT],
    ['usa', 'US', SAME_COUNTRY_HINT],
    [' canada ', 'Canada', SAME_COUNTRY_HINT],
    ['US', 'Canada', null],
    ['Hong Kong', 'Canada', null],
    ['', 'Canada', null],
  ] as const)('(%j, %j) = %j', (fallback, preferred, want) => {
    expect(fallbackCountryHint(fallback, preferred)).toBe(want);
  });
});

describe('country field empty copy', () => {
  it('names US for the fallback field and Canada for the preferred one', () => {
    expect(COUNTRY_EMPTY_COPY.fallback).toBe('Enter a country, such as US.');
    expect(COUNTRY_EMPTY_COPY.preferred).toBe(
      'Enter a country, such as Canada.',
    );
  });
});

describe('DiscogsCard country fields', () => {
  it('shows Preferred country before Fallback country when connected', () => {
    const html = decode(
      renderToStaticMarkup(
        h(DiscogsCard, {
          statuses: [],
          connection: {
            connected: true,
            username: 'owner',
            needsReconnect: false,
            pendingConnect: false,
            credentialsSaved: true,
          },
          callbackUrl: null,
          preferredCountry: 'Canada',
          fallbackCountry: 'US',
        }),
      ),
    );
    const preferred = html.indexOf('id="preferred-country"');
    const fallback = html.indexOf('id="fallback-country"');
    expect(preferred).toBeGreaterThan(-1);
    expect(fallback).toBeGreaterThan(preferred);
    expect(html).toMatch(
      /<input[^>]*id="fallback-country"[^>]*value="US"|<input[^>]*value="US"[^>]*id="fallback-country"/,
    );
    expect(html).not.toContain(SAME_COUNTRY_HINT);
  });

  it('IN-02: passes the preferred country so the fallback field can note a match', () => {
    const html = decode(
      renderToStaticMarkup(
        h(DiscogsCard, {
          statuses: [],
          connection: {
            connected: true,
            username: 'owner',
            needsReconnect: false,
            pendingConnect: false,
            credentialsSaved: true,
          },
          callbackUrl: null,
          preferredCountry: 'US',
          fallbackCountry: 'US',
        }),
      ),
    );
    expect(html).toContain(SAME_COUNTRY_HINT);
  });
});
