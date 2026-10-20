// query-core decides `isServer` at module load and never schedules
// refetchInterval timers when `window` is undefined. Shim it before the
// static import below so the observer polls like it does in the browser.
vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = globalThis;
});

import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POLL_RETRY_MS, photosRefetchInterval } from './photo-status';
import type { PhotoDto } from './scan-types';

type PhotoLike = Pick<PhotoDto, 'status'>;

// One retry interval plus slack for the fetch to settle.
const RETRY_WAIT_MS = POLL_RETRY_MS + 500;

const allDone: PhotoLike[] = [{ status: 'done' }, { status: 'done' }];

/** A fetcher that fails while `up` is false, like a stopped server. */
function controllableFetcher<T>(data: T) {
  const state = { up: true, calls: 0 };
  const fn = async (): Promise<T> => {
    state.calls += 1;
    if (!state.up) throw new Error('Failed to fetch');
    return data;
  };
  return { state, fn };
}

let client: QueryClient;
let unsubscribe: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

afterEach(() => {
  unsubscribe?.();
  unsubscribe = undefined;
  client.clear();
  vi.useRealTimers();
});

describe('photos polling after a failed poll', () => {
  it('/upload: recovers from a failed poll with every photo done', async () => {
    const data = { photos: allDone };
    const fetcher = controllableFetcher(data);
    const observer = new QueryObserver(client, {
      queryKey: ['photos'],
      queryFn: fetcher.fn,
      initialData: data,
      refetchInterval: (q) =>
        photosRefetchInterval(q.state.data?.photos, q.state.status),
    });
    unsubscribe = observer.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);

    fetcher.state.up = false;
    await observer.refetch();
    expect(observer.getCurrentResult().isError).toBe(true);
    const callsAfterFailure = fetcher.state.calls;

    fetcher.state.up = true;
    await vi.advanceTimersByTimeAsync(RETRY_WAIT_MS);

    expect(fetcher.state.calls).toBeGreaterThan(callsAfterFailure);
    expect(observer.getCurrentResult().isError).toBe(false);
  });

  it('/spines: recovers from a failed poll with every photo done', async () => {
    const data = { spines: [], photoOptions: allDone };
    const fetcher = controllableFetcher(data);
    const observer = new QueryObserver(client, {
      queryKey: ['spines', { photo: null, review: null }],
      queryFn: fetcher.fn,
      initialData: data,
      refetchInterval: (q) =>
        photosRefetchInterval(q.state.data?.photoOptions, q.state.status),
    });
    unsubscribe = observer.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);

    fetcher.state.up = false;
    await observer.refetch();
    expect(observer.getCurrentResult().isError).toBe(true);
    const callsAfterFailure = fetcher.state.calls;

    fetcher.state.up = true;
    await vi.advanceTimersByTimeAsync(RETRY_WAIT_MS);

    expect(fetcher.state.calls).toBeGreaterThan(callsAfterFailure);
    expect(observer.getCurrentResult().isError).toBe(false);
  });

  it('does not poll while every photo is done and fetches succeed', async () => {
    const data = { photos: allDone };
    const fetcher = controllableFetcher(data);
    const observer = new QueryObserver(client, {
      queryKey: ['photos'],
      queryFn: fetcher.fn,
      initialData: data,
      refetchInterval: (q) =>
        photosRefetchInterval(q.state.data?.photos, q.state.status),
    });
    unsubscribe = observer.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    const callsAfterMount = fetcher.state.calls;

    await vi.advanceTimersByTimeAsync(10_000);

    expect(fetcher.state.calls).toBe(callsAfterMount);
    expect(observer.getCurrentResult().isError).toBe(false);
  });
});
