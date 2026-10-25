import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { candidateThumbSrc } from '@/lib/asset-urls';
import type { CandidateDto } from '@/lib/discogs-types';
import type { SpineDto } from '@/lib/scan-types';
import {
  layoutOf,
  layoutParamOf,
  useCardLayout,
} from './card-layout-toggle';
import { CompactSpineCard } from './compact-spine-card';

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
  return renderToStaticMarkup(h(CompactSpineCard, { spine: s, threshold: 0.7 }));
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
  return renderToStaticMarkup(
    h(NuqsTestingAdapter, { searchParams }, h(Probe)),
  );
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
