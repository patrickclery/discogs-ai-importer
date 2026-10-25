import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CandidateDto, SpineDiscogsDto } from '@/lib/discogs-types';
import type { SpineDto } from '@/lib/scan-types';
import { tagsWithSlot } from '../../test/helpers/radix-open';
import {
  BulkImportDialog,
  bulkStartBody,
  startBulkImport,
} from './bulk-import-dialog';

// The bulk confirm dialog (D-07, D-14, D-16, UI-SPEC Bulk confirm dialog).
// Radix renders the dialog through a Portal, so the mock renders it inline
// and open; the Start request is checked with fetch mocked.

vi.mock('radix-ui', async (orig) =>
  (await import('../../test/helpers/radix-open')).openRadixInline(await orig()),
);

function candidate(id: string): CandidateDto {
  return {
    id,
    releaseId: 1234,
    title: 'Nirvana - Nevermind',
    year: 1991,
    country: 'US',
    labels: ['DGC'],
    catno: 'DGCD-24425',
    formats: [],
    hasThumb: true,
    source: 'auto',
    catnoMatch: false,
    stage: null,
  };
}

function discogs(top: string): SpineDiscogsDto {
  return {
    state: 'done',
    candidateCount: 2,
    topCandidates: [candidate(top), candidate(`${top}-2`)],
    failure: null,
    fieldsChanged: false,
  };
}

function spine(id: string, top: string, confidence = 0.95): SpineDto {
  return {
    id,
    photoId: 'p1',
    index: 0,
    state: 'active',
    legibility: null,
    crop: null,
    fields: [
      {
        field: 'artist',
        aiValue: 'Nirvana',
        value: 'Nirvana',
        confidence,
        editBaseAiValue: null,
      },
    ],
    createdRunId: null,
    orphanedRunNo: null,
    mediaKind: 'cd',
    discogs: discogs(top),
    import: null,
    notOnDiscogs: false,
    reviewStatus: 'pending',
    bulk: { eligible: true, reason: null, item: null },
  } as SpineDto;
}

const TWO = [spine('sp-1', 'c-1'), spine('sp-2', 'c-2', 0.4)];

function renderDialog(country = 'Canada', spines: SpineDto[] = TWO) {
  return renderToStaticMarkup(
    createElement(BulkImportDialog, {
      open: true,
      onOpenChange: () => {},
      spines,
      folderName: 'Uncategorized',
      country,
      threshold: 0.7,
      onStarted: () => {},
    }),
  );
}

describe('BulkImportDialog', () => {
  it('titles the count, the folder and Canadian pressings', () => {
    const html = renderDialog();
    expect(tagsWithSlot(html, 'alert-dialog-title')).toHaveLength(1);
    expect(html).toContain('Import 2 to Uncategorized as Canadian pressings');
  });

  it('lets the title wrap a long folder name', () => {
    const [title] = tagsWithSlot(renderDialog(), 'alert-dialog-title');
    expect(title?.classes).toContain('[overflow-wrap:anywhere]');
    expect(title?.classes).toContain('min-w-0');
    expect(title?.classes).toContain('font-medium');
  });

  it('says how many have a field Claude was not sure of', () => {
    const html = renderDialog();
    expect(html).toContain('Canadian CD pressing when Discogs lists one.');
    expect(html).toContain(
      '1 of them have a field Claude wasn&#x27;t sure of.',
    );
  });

  it('offers Keep reviewing and Start import', () => {
    const html = renderDialog();
    expect(html).toContain('Keep reviewing');
    expect(html).toContain('Start import');
    expect(html).not.toContain('Starting…');
    const [action] = tagsWithSlot(html, 'alert-dialog-action');
    expect(action?.attr('disabled')).toBeUndefined();
  });

  it('WR-06: Start import is disabled when there is nothing to send', () => {
    const [action] = tagsWithSlot(
      renderDialog('Canada', []),
      'alert-dialog-action',
    );
    expect(action).toBeDefined();
    expect(action?.attr('disabled')).toBe('');
  });
});

describe('the Start request', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('names each spine and its top match only', () => {
    expect(bulkStartBody(TWO)).toEqual({
      items: [
        { spineId: 'sp-1', candidateId: 'c-1' },
        { spineId: 'sp-2', candidateId: 'c-2' },
      ],
    });
  });

  it('POSTs exactly { items: [{ spineId, candidateId }] } for two spines', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ runId: 'r1', started: 2, skipped: 0 }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await startBulkImport(TWO);
    expect(result).toEqual({
      ok: true,
      response: { runId: 'r1', started: 2, skipped: 0 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('/api/spines/bulk-import');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(Object.keys(body)).toEqual(['items']);
    expect(body.items.map((i: object) => Object.keys(i).sort())).toEqual([
      ['candidateId', 'spineId'],
      ['candidateId', 'spineId'],
    ]);
    expect(body).toEqual({
      items: [
        { spineId: 'sp-1', candidateId: 'c-1' },
        { spineId: 'sp-2', candidateId: 'c-2' },
      ],
    });
  });

  it('reads the server message as the reason on a refusal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: 'bulk_running',
              message: 'Wait for the current bulk import to finish',
            }),
            { status: 409 },
          ),
      ),
    );
    expect(await startBulkImport(TWO)).toEqual({
      ok: false,
      reason: 'Wait for the current bulk import to finish',
    });
  });
});
