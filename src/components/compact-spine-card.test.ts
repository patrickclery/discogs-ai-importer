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
import {
  ExpandedCardsProvider,
  layoutReset,
  toggleExpanded,
} from './expanded-cards';
import { ImportStateBadge } from './import-state-badge';
import { SpineView } from './photo-section';
import { SpineCard } from './spine-card';
import { TooltipProvider } from './ui/tooltip';

// The compact card (D-10, UI-SPEC Compact card): #n and the header badges,
// the spine crop, then the top match with its cover, title and details. No
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

function render(s: SpineDto): string {
  return renderToStaticMarkup(
    h(CompactSpineCard, { spine: s, threshold: 0.7 }),
  );
}

describe('CompactSpineCard (collapsed)', () => {
  it('shows #n, the Top match label and the full title on hover', () => {
    const html = render(spine());
    expect(html).toContain('#7');
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
function renderInGrid(s: SpineDto, expanded: string[]): string {
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
          h(CompactSpineCard, {
            spine: s,
            threshold: 0.7,
            renderFull: (trailing: ReactNode) =>
              h(SpineView, {
                spine: s,
                threshold: 0.7,
                discogs: DISCOGS_VIEW,
                trailing,
              }),
          }),
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
  it('a collapsed card offers Edit spine and no field inputs', () => {
    const html = renderInGrid(spine(), []);
    expect(html).toContain('Edit spine');
    expect(html).toContain('aria-label="Edit spine #7"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="spine-card-sp-1"');
    expect(html).not.toContain('Show less');
    expect(html).not.toContain('<input');
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
  it('renders the leading slot before #n', () => {
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
    expect(lead).toBeLessThan(html.indexOf('#7'));
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

  it('a resolved US fallback shows Fallback: US before the state badge, and the fallback line', () => {
    const html = renderBulk(
      withBulk(
        bulkItem({ outcome: 'fallback_no_version', country: 'US' }),
        bulkImport({ phase: 'waiting' }),
      ),
    );
    const badge = html.indexOf('Fallback: US');
    expect(badge).toBeGreaterThan(-1);
    expect(badge).toBeLessThan(html.indexOf('Waiting to import'));
    expect(html).toContain('No Canadian pressing, used US');
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
    expect(html).toContain('Already imported from IMG_1.jpg, spine #12');
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
