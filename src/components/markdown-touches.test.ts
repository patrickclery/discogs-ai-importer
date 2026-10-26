import fs from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ClaudeCliStatus } from '@/lib/claude-types';
import type { DiscogsConnection } from '@/server/discogs/auth';
import { ClaudeCliCard } from './claude-cli-card';
import { DiscogsCard } from './discogs-card';

// Phase 7 v2 markdown touches on /settings and /spines (07-08, THEME-08,
// THEME-09, THEME-10): numbered `##` mini cards, gradient page titles, `>`
// intros, Plex explanations in the Discogs card and `##` photo headings.

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
vi.mock('@/app/settings/actions', () => ({
  savePreferredCountry: vi.fn(),
  saveFallbackCountry: vi.fn(),
}));

// Client children that need a router, a query client or the server.
vi.mock('./test-claude-button', () => ({ TestClaudeButton: () => null }));
vi.mock('./model-select', () => ({ ModelSelect: () => null }));
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

const src = (...p: string[]) =>
  fs.readFileSync(path.join(import.meta.dirname, ...p), 'utf8');

/** The source from `start` up to (not including) `end`, or to the file end. */
function region(text: string, start: string, end?: string): string {
  const i = text.indexOf(start);
  expect(i, `missing ${start}`).toBeGreaterThan(-1);
  const j = end ? text.indexOf(end, i + start.length) : -1;
  return text.slice(i, j === -1 ? undefined : j);
}

const tokensOf = (tag: string): string[] =>
  (tag.match(/class="([^"]*)"/)?.[1] ?? '').split(/\s+/).filter(Boolean);

const H1 = 'gradient-text w-fit text-2xl font-medium tracking-tight';
const PREFIX_HH =
  '<span aria-hidden="true" class="select-none text-primary">## </span>';
const MD_NUMERAL = ['-right-1', '-bottom-3', 'text-7xl'];

/** The card's opening tag and its first child's opening tag. */
function cardHead(html: string): { card: string; first: string } {
  const m = html.match(/^<div[^>]*data-slot="card"[^>]*>(<[^>]*>)/);
  expect(m, 'card opening tag').not.toBeNull();
  const card = m?.[0].slice(0, m[0].length - (m?.[1]?.length ?? 0)) ?? '';
  return { card, first: m?.[1] ?? '' };
}

function expectNumberedMiniCard(html: string, n: number, title: string) {
  const { card, first } = cardHead(html);
  expect(card).toContain('data-variant="mini"');
  expect(first).toContain('data-corner-numeral=""');
  expect(tokensOf(first)).toEqual(expect.arrayContaining(MD_NUMERAL));
  expect(html).toMatch(
    new RegExp(`<span[^>]*data-corner-numeral=""[^>]*>${n}</span>`),
  );
  expect(html).toMatch(
    new RegExp(
      `<div data-slot="card-title"[^>]*>${PREFIX_HH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${title}</div>`,
    ),
  );
}

const STATUS: ClaudeCliStatus = {
  installed: true,
  version: '2.1.0',
  auth: {
    state: 'subscription',
    authMethod: 'claude.ai',
    subscriptionType: 'max',
    reason: null,
  },
  apiKeyInEnv: false,
  apiBillingEnv: [],
  checkedAt: 0,
};

function discogsHtml(connected: boolean): string {
  const connection: DiscogsConnection = {
    connected,
    username: connected ? 'owner' : null,
    needsReconnect: false,
    pendingConnect: false,
    credentialsSaved: true,
  };
  return renderToStaticMarkup(
    h(DiscogsCard, {
      statuses: [],
      connection,
      callbackUrl: null,
      preferredCountry: 'Canada',
      fallbackCountry: 'US',
    }),
  );
}

/** The opening tag of the <p> holding `text`. */
function pTagFor(html: string, text: string): string {
  const i = html.indexOf(text);
  expect(i, `missing ${text}`).toBeGreaterThan(-1);
  const open = html.lastIndexOf('<p', i);
  return html.slice(open, html.indexOf('>', open) + 1);
}

describe('ClaudeCliCard', () => {
  it('is mini card 1 titled ## Claude CLI', () => {
    expectNumberedMiniCard(
      renderToStaticMarkup(h(ClaudeCliCard, { status: STATUS, model: 'x' })),
      1,
      'Claude CLI',
    );
  });
});

describe('DiscogsCard', () => {
  it.each([true, false])(
    'is mini card 2 titled ## Discogs (connected=%s)',
    (connected) => {
      expectNumberedMiniCard(discogsHtml(connected), 2, 'Discogs');
    },
  );

  it('sets the connected explanation in Plex, size and muted kept', () => {
    const tag = pTagFor(
      discogsHtml(true),
      'Matches appear on the Spines page as each CD is looked up.',
    );
    expect(tokensOf(tag).sort()).toEqual(
      ['font-prose', 'text-muted-foreground', 'text-xs'].sort(),
    );
  });

  it('sets the disconnected explanation in Plex, size and muted kept', () => {
    const tag = pTagFor(
      discogsHtml(false),
      'Connecting opens discogs.com so you can approve this app.',
    );
    expect(tokensOf(tag).sort()).toEqual(
      ['font-prose', 'text-muted-foreground', 'text-sm'].sort(),
    );
  });
});

describe.each([
  ['settings/page.tsx', true],
  ['settings/page.demo.tsx', false],
])('%s source', (file, hasDeveloper) => {
  const text = src('..', 'app', ...file.split('/'));

  it('has the gradient h1 and a > intro capped at 80ch', () => {
    expect(text).toContain(`<h1 className="${H1}">`);
    const intro = region(text, '<p className="', '</p>');
    expect(intro).toContain('max-w-[80ch]');
    expect(intro).toMatch(/^<p className="[^"]*">\s*<MdPrefix marker=">" \/>/);
    expect(intro.replace(/\s+/g, ' ')).toContain(
      'Keys are saved to secrets.json on this computer, outside the data folder, and are never shown in full again after saving.',
    );
  });

  it('numbers the Data folder card 3 with a ## title', () => {
    expect(text).toMatch(
      /<Card variant="mini">\s*<CornerNumeral value=\{3\} size="md" \/>\s*<CardHeader>\s*<CardTitle className="text-base">\s*<MdPrefix marker="##" \/>\s*Data folder\s*<\/CardTitle>/,
    );
  });

  it(hasDeveloper ? 'numbers the Developer card 4' : 'has no card 4', () => {
    if (hasDeveloper) {
      expect(text).toMatch(
        /<Card variant="mini">\s*<CornerNumeral value=\{4\} size="md" \/>\s*<CardHeader>\s*<CardTitle className="text-base">\s*<MdPrefix marker="##" \/>\s*Developer\s*<\/CardTitle>/,
      );
    } else {
      expect(text).not.toContain('value={4}');
    }
  });
});
