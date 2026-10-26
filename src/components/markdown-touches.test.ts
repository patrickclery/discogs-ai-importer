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

function discogsHtml(connected: boolean, step = 2): string {
  const connection: DiscogsConnection = {
    connected,
    username: connected ? 'owner' : null,
    needsReconnect: false,
    pendingConnect: false,
    credentialsSaved: true,
  };
  return renderToStaticMarkup(
    h(DiscogsCard, {
      step,
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
      renderToStaticMarkup(
        h(ClaudeCliCard, { step: 1, status: STATUS, model: 'x' }),
      ),
      1,
      'Claude CLI',
    );
  });

  // WR-03: the page owns the step order, so the card numbers itself from
  // the prop, not from a literal.
  it('takes its numeral from the step prop', () => {
    expectNumberedMiniCard(
      renderToStaticMarkup(
        h(ClaudeCliCard, { step: 7, status: STATUS, model: 'x' }),
      ),
      7,
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

  it('takes its numeral from the step prop', () => {
    expectNumberedMiniCard(discogsHtml(true, 7), 7, 'Discogs');
  });

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

  // WR-03: the page is the one place that owns the step order, so the
  // numbers it passes or renders must count 1, 2, 3(, 4) in source order.
  it('numbers its cards 1..n in render order', () => {
    const steps = [
      ...text.matchAll(
        /<ClaudeCliCard\s+step=\{(\d+)\}|<DiscogsCard\s+step=\{(\d+)\}|<CornerNumeral value=\{(\d+)\}/g,
      ),
    ].map((m) => Number(m[1] ?? m[2] ?? m[3]));
    const n = hasDeveloper ? 4 : 3;
    expect(steps).toEqual(Array.from({ length: n }, (_, i) => i + 1));
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

describe.each(['claude-cli-card.tsx', 'discogs-card.tsx'])(
  '%s source',
  (file) => {
    it('does not hard-code its step number (WR-03)', () => {
      expect(src(file)).toContain('<CornerNumeral value={step} size="md" />');
      expect(src(file)).not.toMatch(/<CornerNumeral value=\{\d/);
    });
  },
);

describe('spines-view.tsx source', () => {
  const text = region(src('spines-view.tsx'), '<h1 className=', '{data ? (');

  it('has the gradient Spines h1', () => {
    expect(text).toContain(`<h1 className="${H1}">`);
    expect(text).toMatch(/<h1[^>]*>\s*Spines\s*<\/h1>/);
  });

  it('starts the counts intro with > and caps it at 80ch', () => {
    const intro = region(text, '<p className="', '</p>');
    expect(intro).toContain('max-w-[80ch]');
    expect(intro).toMatch(
      /^<p className="[^"]*">\s*<MdPrefix marker=">" \/>\s*<Count n=\{spineCount\}/,
    );
    expect(intro).toContain("{'. Changes save when you leave a field.'}");
  });
});

describe('PhotoSection source', () => {
  const text = region(
    src('photo-section.tsx'),
    'export function PhotoSection(',
    '\nexport ',
  );

  it('prefixes the h2 with ## and keeps its id, classes and title', () => {
    const h2 = region(text, '<h2', '</h2>');
    expect(h2).toContain('id={headingId}');
    expect(h2).toContain('className="truncate text-sm font-medium"');
    expect(h2).toContain('title={photo.filename}');
    expect(h2).toMatch(
      />\s*<MdPrefix marker="##" \/>\s*\{photo\.filename\}\s*$/,
    );
  });

  it('has no corner numeral and no isolate (Owner Decision 4)', () => {
    expect(text).not.toContain('CornerNumeral');
    expect(text).not.toMatch(/\bisolate\b/);
  });
});

describe('gradient page titles', () => {
  it('appear only on the three page h1s and their demo twins', () => {
    const root = path.join(import.meta.dirname, '..');
    const hits = (fs.readdirSync(root, { recursive: true }) as string[])
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
      .filter((f) =>
        fs
          .readFileSync(path.join(root, f), 'utf8')
          .includes('gradient-text w-fit'),
      )
      .map((f) => f.split(path.sep).join('/'))
      .sort();
    expect(hits).toEqual(
      [
        'app/settings/page.demo.tsx',
        'app/settings/page.tsx',
        'app/upload/page.demo.tsx',
        'app/upload/page.tsx',
        'components/spines-view.tsx',
      ].sort(),
    );
  });
});
