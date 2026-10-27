// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { act, type FC, createElement as h, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpineDto, SpinesResponse } from '@/lib/scan-types';
import { SpinesView } from './spines-view';
import { TooltipProvider } from './ui/tooltip';

// 06-UAT test 16 / 06-VERIFICATION human item: an expanded compact card stays
// open, and text typed into it survives, when the ['spines'] query refetches
// in the background (a bulk import or Discogs search poll). Mounts the real
// SpinesView in a DOM and drives a real refetch through a stubbed fetch.

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function spine(over: Partial<SpineDto> = {}): SpineDto {
  return {
    id: 'sp-1',
    photoId: 'p1',
    index: 0,
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
    ],
    createdRunId: 'r1',
    orphanedRunNo: null,
    mediaKind: 'cd',
    discogs: {
      state: 'running',
      candidateCount: 0,
      topCandidates: [],
      failure: null,
      fieldsChanged: false,
    },
    import: null,
    notOnDiscogs: false,
    reviewStatus: 'pending',
    bulk: null,
    ...over,
  } as SpineDto;
}

function response(spines: SpineDto[]): SpinesResponse {
  return {
    photos: [
      {
        id: 'p1',
        filename: 'shelf.jpg',
        createdAt: 1,
        status: 'done',
        runNo: 1,
        model: null,
        modelLabel: null,
        spawnedAt: null,
        finishedAt: 2,
        errorReason: null,
        spineCount: spines.length,
        spineCountEstimate: null,
        detectedCount: spines.length,
        truncated: false,
        densityFlags: [],
        thumbUrl: null,
        visionUrl: null,
        hasEarlierScan: false,
      },
    ],
    spines,
    photoOptions: [
      { id: 'p1', filename: 'shelf.jpg', status: 'done' },
    ] as SpinesResponse['photoOptions'],
    counts: {
      all: spines.length,
      needsReview: 0,
      byStatus: {
        pending: spines.length,
        matched: 0,
        imported: 0,
        not_found: 0,
        not_on_discogs: 0,
        failed: 0,
      } as SpinesResponse['counts']['byStatus'],
      fallback: 0,
    },
    statusById: {},
    photoProgress: { p1: { imported: 0, total: spines.length } },
    confidenceThreshold: 0.7,
    densityMaxSpines: 40,
    discogsActive: true,
    discogs: {
      connected: true,
      needsReconnect: false,
      pausedUntil: null,
      folder: { id: 1, name: 'Uncategorized' },
      preferredCountry: 'Canada',
      fallbackCountry: 'US',
    },
    bulk: null,
  } as SpinesResponse;
}

/** Sets a controlled input's value the way a keystroke does. */
function typeInto(el: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  setter?.call(el, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function artistInput(): HTMLInputElement {
  const inputs = [...document.querySelectorAll('input')] as HTMLInputElement[];
  const found = inputs.find(
    (i) => i.value === 'Nirvana' || i.value.startsWith('Nirvana '),
  );
  if (!found) throw new Error('artist input not found');
  return found;
}

describe('expanded compact card across a background ["spines"] refetch', () => {
  let root: Root;
  let container: HTMLDivElement;
  let qc: QueryClient;
  let serverData: SpinesResponse;
  const fetchMock = vi.fn();

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).startsWith('/api/spines')) {
        return new Response(JSON.stringify(serverData), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('keeps the card open and the typed text after the list refetches with new data', async () => {
    const initial = response([spine()]);
    serverData = initial;
    const Adapter = NuqsTestingAdapter as FC<{
      searchParams: string;
      children?: ReactNode;
    }>;
    root = createRoot(container);
    await act(async () => {
      root.render(
        h(
          QueryClientProvider,
          { client: qc },
          h(
            Adapter,
            { searchParams: '' },
            h(
              TooltipProvider,
              null,
              h(SpinesView, {
                initialData: initial,
                initialPhoto: null,
                initialReview: false,
                initialStatus: null,
                initialFallback: false,
              }),
            ),
          ),
        ),
      );
    });

    // Compact layout: no inputs until the pencil opens the card.
    expect(
      document.querySelectorAll('input[type="text"], input:not([type])').length,
    ).toBe(0);
    const pencil = document.querySelector(
      'button[aria-label^="Edit spine"]',
    ) as HTMLButtonElement;
    expect(pencil).not.toBeNull();
    await act(async () => pencil.click());
    expect(
      document.querySelector('button[aria-label^="Show less of spine"]'),
    ).not.toBeNull();

    // Type into the artist field and keep it focused (user mid-edit).
    const input = artistInput();
    await act(async () => {
      input.focus();
      typeInto(input, 'Nirvana (my edit)');
    });
    expect(input.value).toBe('Nirvana (my edit)');

    // The server now reports the search finished: new object identities and
    // a visible change (candidate count), as a poll during a search would.
    serverData = response([
      spine({
        discogs: {
          state: 'done',
          candidateCount: 3,
          topCandidates: [],
          failure: null,
          fieldsChanged: false,
        },
      }),
    ]);
    const before = fetchMock.mock.calls.filter((c) =>
      String(c[0]).startsWith('/api/spines'),
    ).length;
    await act(async () => {
      await qc.refetchQueries({ queryKey: ['spines'] });
    });
    const after = fetchMock.mock.calls.filter((c) =>
      String(c[0]).startsWith('/api/spines'),
    ).length;

    // A real refetch happened and its data reached the cache.
    expect(after).toBeGreaterThan(before);
    const cached = qc.getQueriesData<SpinesResponse>({ queryKey: ['spines'] });
    expect(cached[0][1]?.spines[0].discogs?.state).toBe('done');

    // The card is still open, and the same (not remounted) input keeps the text.
    expect(
      document.querySelector('button[aria-label^="Show less of spine"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('button[aria-label^="Edit spine"]'),
    ).toBeNull();
    expect(input.isConnected).toBe(true);
    expect(input.value).toBe('Nirvana (my edit)');

    // Leaving the field saves the typed text, not the refetched server value.
    await act(async () => {
      input.blur();
      await new Promise((r) => setTimeout(r, 50));
    });
    const patch = fetchMock.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(patch).toBeDefined();
    expect(
      JSON.parse(String((patch?.[1] as RequestInit | undefined)?.body)),
    ).toEqual({
      field: 'artist',
      value: 'Nirvana (my edit)',
    });
  });
});
