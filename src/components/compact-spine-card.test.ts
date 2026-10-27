import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { type FC, createElement as h, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { candidateThumbSrc } from '@/lib/asset-urls';
import type { BulkItemDto } from '@/lib/bulk-types';
import type { CandidateDto } from '@/lib/discogs-types';
import type { ImportDto } from '@/lib/import-types';
import type { SpineDto } from '@/lib/scan-types';
import { layoutOf, layoutParamOf, useCardLayout } from './card-layout-toggle';
import { CompactSpineCard } from './compact-spine-card';
import { CornerNumeral } from './corner-numeral';
import {
  ExpandedCardsProvider,
  layoutReset,
  toggleExpanded,
} from './expanded-cards';
import { ImportStateBadge } from './import-state-badge';
import { SpineView } from './photo-section';
import { SpineCard } from './spine-card';
import { SelectionProvider } from './spine-selection';
import { Card } from './ui/card';
import { TooltipProvider } from './ui/tooltip';

// The compact card (D-10, UI-SPEC Compact card, amended by G-06-side-2): six
// rows in a fixed order (status, warnings, crop, select, match, bulk) and no
// spine number on screen; the number lives only in accessible names. No
// field inputs until the card is expanded (D-11).

const LONG_TITLE = `Various - ${'A Very Long Compilation Title '.repeat(4)}`;

function candidate(over: Partial<CandidateDto> = {}): CandidateDto {
  return {
    id: 'cand-1',
    releaseId: 1234,
    title: LONG_TITLE,
    year: 1991,
    country: 'US',
    labels: ['DGC'],
    catno: 'DGCD-24425',
    formats: [],
    hasThumb: true,
    source: 'auto',
    catnoMatch: false,
    stage: null,
    ...over,
  };
}

function spine(over: Partial<SpineDto> = {}): SpineDto {
  return {
    id: 'sp-1',
    photoId: 'p1',
    index: 6,
    state: 'active',
    legibility: null,
    crop: { url: '/api/files/crops/sp-1.jpg', width: 400, height: 60 },
    fields: [
      {
        field: 'artist',
        aiValue: 'Nirvana',
        value: 'Nirvana',
        confidence: 0.95,
        editBaseAiValue: null,
      },
      {
        field: 'title',
        aiValue: 'Nevermind',
        value: 'Nevermind',
        confidence: 0.95,
        editBaseAiValue: null,
      },
      {
        field: 'raw_text',
        aiValue: 'NIRVANA NEVERMIND',
        value: 'NIRVANA NEVERMIND',
        confidence: 0.95,
        editBaseAiValue: null,
      },
    ],
    createdRunId: 'r1',
    orphanedRunNo: null,
    mediaKind: 'cd',
    discogs: {
      state: 'done',
      candidateCount: 1,
      topCandidates: [candidate()],
      failure: null,
      fieldsChanged: false,
    },
    import: null,
    notOnDiscogs: false,
    reviewStatus: 'pending',
    bulk: null,
    ...over,
  };
}

/** The visible text: every tag becomes a space, so attribute values drop out. */
function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ');
}

/** The markup from data-compact-row="{name}" up to the next row, or the end. */
function rowSlice(html: string, name: string): string {
  const at = html.indexOf(`data-compact-row="${name}"`);
  if (at < 0) throw new Error(`row ${name} not found`);
  const next = html.indexOf('data-compact-row="', at + 1);
  return html.slice(at, next < 0 ? undefined : next);
}

/** Every data-compact-row value, in markup order. */
function rowNames(html: string): string[] {
  return [...html.matchAll(/data-compact-row="([^"]*)"/g)].map((m) => m[1]);
}

const ROWS = ['status', 'crop', 'select', 'match', 'warnings'];

function render(s: SpineDto): string {
  return renderToStaticMarkup(
    h(CompactSpineCard, { spine: s, threshold: 0.7 }),
  );
}

describe('CompactSpineCard (collapsed)', () => {
  it('always renders the six rows in order', () => {
    expect(rowNames(render(spine()))).toEqual(ROWS);
    const fallback = renderBulk(
      withBulk(
        bulkItem({ outcome: 'fallback_no_version', country: 'US' }),
        bulkImport({ phase: 'waiting' }),
      ),
    );
    expect(rowNames(fallback)).toEqual(ROWS);
  });

  it('a low-confidence field warns on the warnings row, not the select row', () => {
    const s = spine();
    const low = spine({
      fields: s.fields.map((f) =>
        f.field === 'title' ? { ...f, confidence: 0.3 } : f,
      ),
    });
    const html = render(low);
    expect(rowSlice(html, 'warnings')).toContain('Check title · 30%');
    expect(rowSlice(html, 'select')).not.toContain('Check title');
  });

  it('shows no spine number, the Top match label and the full title on hover', () => {
    const html = render(spine());
    const text = visibleText(html);
    expect(html).not.toContain('data-corner-numeral');
    expect(text).not.toContain('#7');
    expect(text).not.toMatch(/(^|\D)7(\D|$)/);
    expect(html).toContain('Top match');
    expect(html).toContain(`title="${LONG_TITLE.replaceAll('"', '&quot;')}"`);
    expect(html).toContain('1991 · US · DGCD-24425');
  });

  it('builds the cover src from candidateThumbSrc', () => {
    const src = candidateThumbSrc({ id: 'cand-1', releaseId: 1234 });
    expect(render(spine())).toContain(`src="${src}"`);
  });

  it('carries the card id and data attribute', () => {
    const html = render(spine());
    expect(html).toContain('data-spine-card="sp-1"');
    expect(html).toContain('id="spine-card-sp-1"');
  });

  it('renders no field inputs while collapsed', () => {
    const html = render(spine());
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<textarea');
  });

  it('shows the placeholder line without candidates', () => {
    const html = render(
      spine({
        discogs: {
          state: 'queued',
          candidateCount: 0,
          topCandidates: [],
          failure: null,
          fieldsChanged: false,
        },
      }),
    );
    expect(html).toContain('Looking it up on Discogs…');
    expect(html).not.toContain('<img src="/api/discogs/thumb');
  });
});

/** Renders the layout the hook reads under the given query string. */
function layoutUnder(searchParams: string): string {
  function Probe() {
    const [layout] = useCardLayout();
    return h('span', null, layout);
  }
  // createElement's typing wants children in props; pass them as an argument.
  const Adapter = NuqsTestingAdapter as FC<{
    searchParams: string;
    children?: ReactNode;
  }>;
  return renderToStaticMarkup(h(Adapter, { searchParams }, h(Probe)));
}

describe('CompactSpineCard candidate count', () => {
  it('shows the bare count on the match label line, not an N candidates badge', () => {
    const s = spine();
    const html = renderInGrid(
      {
        ...s,
        discogs: { ...s.discogs, state: 'done', candidateCount: 10 },
      } as SpineDto,
      [],
    );
    const at = html.indexOf('data-candidate-count');
    expect(at).toBeGreaterThan(html.indexOf('data-compact-row="select"'));
    expect(at).toBeLessThan(html.indexOf('data-compact-row="match"'));
    expect(html.slice(at)).toMatch(
      /^[^>]*>.*?<span aria-hidden="true">10<\/span>/,
    );
    expect(html).toContain('<span class="sr-only">10 candidates</span>');
    expect(html).not.toContain('> candidates');
  });
});

describe('useCardLayout', () => {
  it('reads detailed only for ?view=detailed', () => {
    expect(layoutUnder('?view=detailed')).toBe('<span>detailed</span>');
    expect(layoutUnder('?view=x')).toBe('<span>compact</span>');
    expect(layoutUnder('')).toBe('<span>compact</span>');
  });

  it('maps the param both ways; compact removes it', () => {
    expect(layoutOf('detailed')).toBe('detailed');
    expect(layoutOf('Detailed')).toBe('compact');
    expect(layoutOf(null)).toBe('compact');
    expect(layoutParamOf('detailed')).toBe('detailed');
    expect(layoutParamOf('compact')).toBeNull();
  });
});

// D-11: Edit spine expands a card in place into the full card; Show less
// collapses it. Expanded ids are client state keyed by spine id.

const DISCOGS_VIEW = {
  connected: true,
  needsReconnect: false,
  pausedUntil: null,
};

// createElement's typing wants children in props; pass them as an argument.
const Expanded = ExpandedCardsProvider as FC<{
  layout: 'compact' | 'detailed';
  initial?: Iterable<string>;
  children?: ReactNode;
}>;

/** Renders the compact card under a provider, optionally already expanded. */
// createElement's typing wants children in props; pass them as an argument.
const Selection = SelectionProvider as FC<{
  selected: ReadonlySet<string>;
  onChange: () => void;
  children?: ReactNode;
}>;

/**
 * Renders the compact card under a provider, optionally already expanded and
 * optionally inside a SelectionProvider (so the select checkbox renders).
 */
function renderInGrid(
  s: SpineDto,
  expanded: string[],
  selection = false,
): string {
  const card = h(CompactSpineCard, {
    spine: s,
    threshold: 0.7,
    renderFull: (trailing: ReactNode) =>
      h(SpineView, {
        spine: s,
        threshold: 0.7,
        discogs: DISCOGS_VIEW,
        trailing,
      }),
  });
  return renderToStaticMarkup(
    h(
      QueryClientProvider,
      { client: new QueryClient() },
      h(
        Expanded,
        { layout: 'compact', initial: expanded },
        h(
          TooltipProvider,
          null,
          selection
            ? h(
                Selection,
                { selected: new Set<string>(), onChange: () => {} },
                card,
              )
            : card,
        ),
      ),
    ),
  );
}

describe('toggleExpanded', () => {
  it('adds and removes one id, leaving the others', () => {
    expect([...toggleExpanded(new Set(), 'a', true)]).toEqual(['a']);
    const both = new Set(['a', 'b']);
    expect([...toggleExpanded(both, 'a', false)]).toEqual(['b']);
    expect([...toggleExpanded(both, 'c', true)].sort()).toEqual([
      'a',
      'b',
      'c',
    ]);
    // The input set is never mutated.
    expect([...both].sort()).toEqual(['a', 'b']);
  });
});

describe('layoutReset', () => {
  it('clears every expanded id when the layout changes', () => {
    const state = { layout: 'compact' as const, ids: new Set(['a', 'b']) };
    expect(layoutReset(state, 'compact')).toBe(state);
    const next = layoutReset(state, 'detailed');
    expect(next.layout).toBe('detailed');
    expect(next.ids.size).toBe(0);
  });
});

describe('CompactSpineCard expand toggle', () => {
  it('a collapsed card offers a pencil Edit button beside the checkbox and no field inputs', () => {
    const html = renderInGrid(
      spine({ bulk: { eligible: true, reason: null, item: null } }),
      [],
      true,
    );
    const select = rowSlice(html, 'select');
    expect(select).toContain('aria-label="Select spine #7"');
    expect(select).toContain('Top match');
    const edit = openingTag(select, 'aria-label="Edit spine #7"');
    expect(edit).toContain('aria-expanded="false"');
    expect(edit).toContain('aria-controls="spine-card-sp-1"');
    expect(edit).toContain('data-size="icon"');
    expect(html).toContain('lucide-pencil');
    expect(html).not.toContain('lucide-chevron-down');
    expect(visibleText(html)).not.toContain('Edit spine');
    expect(html).not.toContain('Show less');
    // The checkbox's hidden form input is the only input: no field inputs.
    expect(html).not.toMatch(
      /<input(?![^>]*type="checkbox" aria-hidden="true")/,
    );
    expect(html).not.toContain('<textarea');
  });

  it('an expanded card renders the full card across the row, ending with Show less', () => {
    const html = renderInGrid(spine(), ['sp-1']);
    expect(html).toContain('col-span-full');
    expect(html).toContain('<input');
    expect(html).toContain('Show less');
    expect(html).toContain('aria-label="Show less of spine #7"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('id="spine-card-sp-1"');
    expect(html).not.toContain('aria-label="Edit spine #7"');
    // Show less is the last control of the card.
    const label = html.indexOf('aria-label="Show less of spine #7"');
    expect(html.lastIndexOf('<button')).toBe(
      html.lastIndexOf('<button', label),
    );
  });

  it('another spine id stays collapsed', () => {
    const html = renderInGrid(spine(), ['other']);
    expect(html).toContain('aria-label="Edit spine #7"');
    expect(html).not.toContain('<input');
  });
});

describe('SpineCard leading slot', () => {
  it('renders the leading slot before the worst-field badge', () => {
    const html = renderToStaticMarkup(
      h(
        QueryClientProvider,
        { client: new QueryClient() },
        h(SpineCard, {
          spine: spine(),
          threshold: 0.7,
          leading: h('span', { 'data-lead': '1' }),
        }),
      ),
    );
    const lead = html.indexOf('data-lead="1"');
    expect(lead).toBeGreaterThan(-1);
    expect(html).toContain('id="spine-card-sp-1"');
  });
});

// Per-spine bulk states on the compact card (UI-SPEC Per-spine bulk
// states, D-04, D-09, D-15, BULK-11): the country badge before the state
// badge, and at most one status line under the match slot.

function bulkItem(over: Partial<BulkItemDto> = {}): BulkItemDto {
  return {
    id: 'bi1',
    runId: 'run1',
    phase: 'resolved',
    preferredCountry: 'Canada',
    fallbackCountry: null,
    outcome: 'preferred',
    releaseId: 777,
    country: 'Canada',
    importId: 'i1',
    skip: null,
    failure: null,
    createdAt: 1,
    ...over,
  };
}

function bulkImport(over: Partial<ImportDto> = {}): ImportDto {
  return {
    id: 'i1',
    phase: 'imported',
    releaseId: 777,
    candidateId: 'cand-1',
    candidate: {
      title: 'Nirvana - Nevermind',
      year: 1991,
      country: 'US',
      labels: ['DGC'],
      catno: 'DGCD-24425',
      formats: [],
    },
    hasThumb: true,
    folderId: 1,
    folderName: 'Uncategorized',
    instanceId: null,
    linked: false,
    adopted: false,
    importedAt: null,
    existing: null,
    failure: null,
    canChangeMatch: false,
    canRetry: false,
    checking: false,
    ...over,
  };
}

function withBulk(item: BulkItemDto | null, imp: ImportDto | null): SpineDto {
  return spine({
    import: imp,
    bulk: { eligible: false, reason: null, item },
  });
}

/** The compact card under a query client (BulkStatusLine's Retry import). */
function renderBulk(s: SpineDto): string {
  return renderToStaticMarkup(
    h(
      QueryClientProvider,
      { client: new QueryClient() },
      h(CompactSpineCard, { spine: s, threshold: 0.7 }),
    ),
  );
}

describe('CompactSpineCard bulk states', () => {
  it('finding: the badge reads Finding pressing and the line names the pressing', () => {
    const html = renderBulk(
      withBulk(
        bulkItem({ phase: 'finding', importId: null, outcome: null }),
        null,
      ),
    );
    expect(html).toContain('Finding pressing');
    expect(html).toContain('Looking for the Canadian pressing…');
  });

  it('a resolved US fallback shows the state badge on its own row, Fallback: US on the warnings line, and the fallback line', () => {
    const html = renderBulk(
      withBulk(
        bulkItem({ outcome: 'fallback_no_version', country: 'US' }),
        bulkImport({ phase: 'waiting' }),
      ),
    );
    const state = html.indexOf('Waiting to import');
    expect(state).toBeGreaterThan(-1);
    expect(state).toBeLessThan(html.indexOf('Fallback: US'));
    const status = rowSlice(html, 'status');
    expect(status).toContain('Waiting to import');
    expect(status).not.toContain('Fallback: US');
    expect(rowSlice(html, 'warnings')).toContain('Fallback: US');
    expect(html).toContain('No Canadian pressing, used US');
  });

  it('the status row is one badge line and never clips the badge', () => {
    const html = renderBulk(
      withBulk(
        bulkItem({ outcome: 'fallback_no_version', country: 'US' }),
        bulkImport({ phase: 'waiting' }),
      ),
    );
    const t = classTokens(openingTag(html, 'data-compact-row="status"'));
    expect(t).toContain('min-h-6');
    for (const gone of ['min-w-0', 'max-w-full', 'overflow-hidden']) {
      expect(t).not.toContain(gone);
    }
  });

  it('a preferred import shows the country with no status line', () => {
    const html = renderBulk(withBulk(bulkItem(), bulkImport()));
    expect(html).toContain('>Canada<');
    expect(html).not.toContain('Fallback:');
    expect(html).not.toContain('No Canadian pressing');
  });

  it('a skipped duplicate shows the skipped line and no country badge', () => {
    const html = renderBulk(
      withBulk(
        bulkItem({
          phase: 'skipped',
          importId: null,
          outcome: null,
          country: null,
          skip: {
            reason: 'duplicate',
            photo: 'IMG_1.jpg',
            spineNumber: 12,
            samePhoto: false,
          },
        }),
        null,
      ),
    );
    expect(html).toContain('Already imported from another spine in IMG_1.jpg');
    expect(html).not.toContain('Fallback:');
  });

  it('a failed lookup reads Import failed with the failure line and Retry import', () => {
    const html = renderBulk(
      withBulk(
        bulkItem({
          phase: 'failed',
          importId: null,
          outcome: null,
          country: null,
          failure: { kind: 'auth', reason: null },
        }),
        null,
      ),
    );
    expect(html).toContain('Import failed');
    expect(html).toContain(
      'Couldn&#x27;t look up pressings: Discogs rejected the connection.',
    );
    expect(html).toContain('href="/settings"');
    expect(html).toContain('Retry import');
  });

  it('a manual import shows no country badge and no bulk line', () => {
    const html = renderBulk(withBulk(null, bulkImport({ phase: 'waiting' })));
    expect(html).toContain('Waiting to import');
    expect(html).not.toContain('Fallback:');
    expect(html).not.toContain('>Canada<');
    expect(html).not.toContain('Retry import');
  });
});

// G-06-side-2: fixed line counts so the cards in a grid row line up; the
// full text is always on hover.

const SKIP_ITEM = bulkItem({
  phase: 'skipped',
  importId: null,
  outcome: null,
  country: null,
  skip: {
    reason: 'duplicate',
    photo: 'IMG_1.jpg',
    spineNumber: 12,
    samePhoto: false,
  },
});

const US_FALLBACK = () =>
  withBulk(
    bulkItem({ outcome: 'fallback_no_version', country: 'US' }),
    bulkImport({ phase: 'waiting' }),
  );

/** The element whose text starts with `text` (its opening tag). */
const tagOfText = (html: string, text: string) => openingTag(html, `>${text}`);

describe('CompactSpineCard fixed line counts', () => {
  it('the title is exactly two lines and the details exactly one, each with the full text', () => {
    const html = render(spine());
    const title = openingTag(html, 'title="Various');
    expect(classTokens(title)).toEqual(
      expect.arrayContaining(['line-clamp-2', 'h-[2lh]']),
    );
    const details = tagOfText(html, '1991 · US · DGCD-24425');
    expect(classTokens(details)).toEqual(
      expect.arrayContaining(['line-clamp-1', 'h-[1lh]']),
    );
    expect(details).toContain('title="1991 · US · DGCD-24425"');
  });

  it('the match row is a fixed 60px box, with or without a candidate', () => {
    const tokens = (html: string) =>
      classTokens(openingTag(html, 'data-compact-row="match"'));
    expect(tokens(render(spine()))).toContain('h-15');
    const queued = render(
      spine({
        discogs: {
          state: 'queued',
          candidateCount: 0,
          topCandidates: [],
          failure: null,
          fieldsChanged: false,
        },
      }),
    );
    expect(queued).toContain('Looking it up on Discogs…');
    expect(tokens(queued)).toContain('h-15');
  });

  it('the fallback and skipped lines clamp to two lines with the full text on hover', () => {
    const fallback = tagOfText(
      renderBulk(US_FALLBACK()),
      'No Canadian pressing, used US',
    );
    expect(classTokens(fallback)).toContain('line-clamp-2');
    expect(fallback).toContain('title="No Canadian pressing, used US"');
    const skipped = tagOfText(
      renderBulk(withBulk(SKIP_ITEM, null)),
      'Already imported from another spine in IMG_1.jpg',
    );
    expect(classTokens(skipped)).toContain('line-clamp-2');
    expect(skipped).toContain(
      'title="Already imported from another spine in IMG_1.jpg"',
    );
  });

  it('a failed lookup keeps its whole text, the Settings link and Retry import', () => {
    const html = renderBulk(
      withBulk(
        bulkItem({
          phase: 'failed',
          importId: null,
          outcome: null,
          country: null,
          failure: { kind: 'auth', reason: null },
        }),
        null,
      ),
    );
    const text =
      'Couldn&#x27;t look up pressings: Discogs rejected the connection.';
    expect(html).toContain(text);
    expect(html).toContain('href="/settings"');
    expect(html).toContain('Retry import');
    expect(classTokens(tagOfText(html, text))).not.toContain('line-clamp-2');
  });
});

describe('ImportStateBadge bulk phases', () => {
  const badge = (s: SpineDto) =>
    renderToStaticMarkup(h(ImportStateBadge, { spine: s }));

  it('a current finding item reads Finding pressing', () => {
    expect(
      badge(withBulk(bulkItem({ phase: 'finding', importId: null }), null)),
    ).toContain('Finding pressing');
  });

  it('a current failed item reads Import failed', () => {
    expect(
      badge(withBulk(bulkItem({ phase: 'failed', importId: null }), null)),
    ).toContain('Import failed');
  });

  it('imported and the Not on Discogs mark still win', () => {
    const finding = bulkItem({ phase: 'finding', importId: null });
    expect(badge(withBulk(finding, bulkImport()))).toContain('Imported');
    expect(badge({ ...withBulk(finding, null), notOnDiscogs: true })).toContain(
      'Not on Discogs',
    );
  });
});

describe('CompactSpineCard imported check', () => {
  it('an imported card shows a corner checkmark instead of the Imported badge', () => {
    const html = renderInGrid({ ...spine(), import: bulkImport() }, []);
    expect(html).toContain('data-imported-check');
    expect(html).toContain('<span class="sr-only">Imported</span>');
    const status = html.slice(html.indexOf('data-compact-row="status"'));
    expect(
      status.slice(0, status.indexOf('data-compact-row="warnings"')),
    ).not.toContain('Imported');
  });

  it('a card that is not imported has no checkmark', () => {
    expect(renderInGrid(spine(), [])).not.toContain('data-imported-check');
  });
});

/** The opening tag of the first element carrying `marker`. */
function openingTag(html: string, marker: string): string {
  const at = html.indexOf(marker);
  if (at < 0) throw new Error(`${marker} not found`);
  const start = html.lastIndexOf('<', at);
  return html.slice(start, html.indexOf('>', at) + 1);
}

/** The whole class tokens on an opening tag (no substring matches). */
function classTokens(tag: string): string[] {
  const m = tag.match(/class="([^"]*)"/);
  return (m?.[1] ?? '').split(/\s+/).filter(Boolean);
}

const NUMERAL_BASE = [
  'pointer-events-none',
  'absolute',
  '-z-10',
  'select-none',
  'font-mono',
  'font-black',
  'leading-none',
  'text-primary/[0.07]',
];

const NUMERAL_SIZES = {
  sm: ['-right-1', '-bottom-2', 'text-4xl'],
  md: ['-right-1', '-bottom-3', 'text-7xl'],
  lg: ['-right-2', '-bottom-6', 'text-[10rem]'],
} as const;

describe('awesomer mini card (Phase 7 v2)', () => {
  const cardTag = (variant?: 'default' | 'mini' | 'featured') =>
    openingTag(
      renderToStaticMarkup(h(Card, variant ? { variant } : {}, 'x')),
      'data-slot="card"',
    );

  it('Card default keeps border, bg-card and shadow-sm and no data-variant', () => {
    const tag = cardTag();
    expect(classTokens(tag)).toEqual(
      expect.arrayContaining(['border', 'bg-card', 'shadow-sm']),
    );
    expect(tag).not.toContain('data-variant');
  });

  for (const variant of ['mini', 'featured'] as const) {
    it(`Card ${variant} is an awesomer gradient card`, () => {
      const tag = cardTag(variant);
      const t = classTokens(tag);
      expect(tag).toContain(`data-variant="${variant}"`);
      expect(t).toEqual(
        expect.arrayContaining([
          `card-${variant}`,
          'relative',
          'isolate',
          'overflow-hidden',
        ]),
      );
      for (const gone of ['bg-card', 'shadow-sm', 'border']) {
        expect(t).not.toContain(gone);
      }
    });
  }

  for (const size of ['sm', 'md', 'lg'] as const) {
    it(`CornerNumeral ${size} is decorative with exactly its size tokens`, () => {
      const html = renderToStaticMarkup(h(CornerNumeral, { value: 42, size }));
      const tag = openingTag(html, 'data-corner-numeral');
      expect(tag).toContain('aria-hidden="true"');
      expect(tag).toContain('data-corner-numeral=""');
      expect(classTokens(tag).sort()).toEqual(
        [...NUMERAL_BASE, ...NUMERAL_SIZES[size]].sort(),
      );
      expect(html).toMatch(/>42<\/span>$/);
      expect(html).not.toContain('#');
    });
  }

  it('the compact card is a five-row subgrid mini card with no numeral', () => {
    const html = render(spine());
    const tag = openingTag(html, 'data-slot="card"');
    expect(tag).toContain('data-variant="mini"');
    expect(classTokens(tag)).toEqual(
      expect.arrayContaining([
        'row-span-5',
        'grid',
        'grid-cols-1',
        'grid-rows-subgrid',
        'gap-2',
        'rounded-xl',
        'p-4',
      ]),
    );
    expect(html).not.toContain('data-corner-numeral');
    expect(visibleText(html)).not.toContain('#7');
  });

  it('the compact card column cannot grow past the card (one minmax(0,1fr) column)', () => {
    const html = render(spine());
    const t = classTokens(openingTag(html, 'data-slot="card"'));
    expect(t).toContain('grid-cols-1');
    expect(t.filter((c) => c.startsWith('grid-cols-'))).toEqual([
      'grid-cols-1',
    ]);
  });

  it('an orphaned compact card keeps its warning border with card-mini', () => {
    const html = render(spine({ state: 'orphaned', orphanedRunNo: 2 }));
    expect(classTokens(openingTag(html, 'data-slot="card"'))).toEqual(
      expect.arrayContaining(['card-mini', 'border-warning/60']),
    );
  });
});

describe('featured and Detailed spine cards (Phase 7 v2)', () => {
  /** A SpineView with no trailing row, as the Detailed layout renders it. */
  const detailed = (s: SpineDto) =>
    renderToStaticMarkup(
      h(
        QueryClientProvider,
        { client: new QueryClient() },
        h(
          TooltipProvider,
          null,
          h(SpineView, {
            spine: s,
            threshold: 0.7,
            discogs: DISCOGS_VIEW,
          }),
        ),
      ),
    );
  /** A bare SpineCard with no featured prop. */
  const bare = (s: SpineDto) =>
    renderToStaticMarkup(
      h(
        QueryClientProvider,
        { client: new QueryClient() },
        h(SpineCard, { spine: s, threshold: 0.7 }),
      ),
    );

  /** No spine numbering on the card itself (G-06-side-2): no corner numeral, no #7 label. */
  function expectNoNumbering(html: string) {
    expect(html).not.toContain('data-corner-numeral');
    expect(html).not.toMatch(/>#7</);
  }

  it('the expanded compact card is the featured card with no numbering', () => {
    const html = renderInGrid(spine(), ['sp-1']);
    const tag = openingTag(html, 'id="spine-card-sp-1"');
    expect(tag).toContain('data-slot="card"');
    expect(tag).toContain('data-variant="featured"');
    expect(classTokens(tag)).toContain('card-featured');
    expect(classTokens(tag)).not.toContain('card-mini');
    expectNoNumbering(html);
  });

  it('a Detailed card is a mini card with no numbering', () => {
    const html = detailed(spine());
    const tag = openingTag(html, 'id="spine-card-sp-1"');
    expect(tag).toContain('data-variant="mini"');
    expect(classTokens(tag)).toContain('card-mini');
    expectNoNumbering(html);
  });

  it('a Detailed fallback line is never clamped', () => {
    const html = detailed(
      withBulk(
        bulkItem({ outcome: 'fallback_no_version', country: 'US' }),
        bulkImport({ phase: 'waiting' }),
      ),
    );
    const line = openingTag(html, '>No Canadian pressing, used US');
    expect(classTokens(line)).not.toContain('line-clamp-2');
  });

  it('a SpineCard without featured is mini', () => {
    const html = bare(spine());
    const tag = openingTag(html, 'id="spine-card-sp-1"');
    expect(tag).toContain('data-variant="mini"');
    expectNoNumbering(html);
  });

  it('an orphaned card keeps its warning border and the Plex explanation', () => {
    const html = bare(spine({ state: 'orphaned', orphanedRunNo: 2 }));
    expect(classTokens(openingTag(html, 'id="spine-card-sp-1"'))).toEqual(
      expect.arrayContaining(['card-mini', 'border-warning/60']),
    );
    const p = openingTag(html, 'The latest re-scan didn&#x27;t find');
    expect(classTokens(p)).toEqual(
      expect.arrayContaining([
        'font-prose',
        'text-xs',
        'text-muted-foreground',
        'sm:flex-1',
      ]),
    );
    expect(html).toContain(
      'The latest re-scan didn&#x27;t find this spine. Your edits are kept until you re-attach or dismiss it.',
    );
  });
});
