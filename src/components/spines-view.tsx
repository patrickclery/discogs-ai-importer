'use client';

import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { CircleCheck, CircleX, ImageOff, Rows3 } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { DiscogsNotConnectedAlert } from '@/components/discogs-not-connected-alert';
import {
  ImportUiProvider,
  type ImportUiValue,
  SPINE_ACTION_EVENT,
  type SpineActionDetail,
} from '@/components/import-ui-context';
import { PhotoSection } from '@/components/photo-section';
import { useStatusFilter } from '@/components/review-status-filter';
import {
  SpinesFilterBar,
  usePhotoFilter,
  useReviewFilter,
} from '@/components/spines-filter-bar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { REVIEW_STATUS_LABELS, type ReviewStatus } from '@/lib/import-types';
import { pluralize, spinesRefetchInterval } from '@/lib/photo-status';
import { movedOutOf, nextShownId } from '@/lib/review-status';
import type { SpineDto, SpinesResponse } from '@/lib/scan-types';

async function fetchSpines(
  photo: string | null,
  review: boolean,
  status: ReviewStatus | null,
): Promise<SpinesResponse> {
  const params = new URLSearchParams();
  if (photo) params.set('photo', photo);
  if (review) params.set('review', '1');
  if (status) params.set('status', status);
  const qs = params.size > 0 ? `?${params}` : '';
  const res = await fetch(`/api/spines${qs}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`GET /api/spines returned ${res.status}`);
  return (await res.json()) as SpinesResponse;
}

/** Focusable controls, for moving focus into a card's Discogs section. */
const FOCUSABLE =
  ':is(button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]))';

/**
 * After a spine left the list: focus the first control in the Discogs
 * section of card `nextId` (UI-SPEC Focus and keyboard), else the pressed
 * status filter item when no card is left. Runs after the next paint, once
 * the refetched list has rendered.
 */
function focusAfterMove(nextId: string | null): void {
  const run = () => {
    if (nextId) {
      const card = document.querySelector<HTMLElement>(
        `[data-spine-card="${CSS.escape(nextId)}"]`,
      );
      const target =
        card?.querySelector<HTMLElement>(
          `[data-discogs-section] ${FOCUSABLE}`,
        ) ?? card?.querySelector<HTMLElement>(FOCUSABLE);
      if (target) {
        target.focus();
        return;
      }
    }
    document
      .querySelector<HTMLElement>('[data-status-filter-item][data-state="on"]')
      ?.focus();
  };
  window.requestAnimationFrame(() => window.requestAnimationFrame(run));
}

/** An owner action waiting for the data that shows its result. */
type Announced = SpineActionDetail & {
  /** Spine ids in the order shown when the action was announced. */
  order: string[];
  /** The query key it applies to; a filter change drops it. */
  key: string;
  /** Only data fetched after this time can explain it. */
  after: number;
};

/** Spines grouped by photo id, keeping the server's detection order. */
export function groupByPhoto(spines: readonly SpineDto[]) {
  const by = new Map<string, SpineDto[]>();
  for (const s of spines) {
    const list = by.get(s.photoId);
    if (list) list.push(s);
    else by.set(s.photoId, [s]);
  }
  return by;
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}

function NoSpinesYet() {
  return (
    <Empty className="pt-16 pb-12">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Rows3 className="size-5" />
        </EmptyMedia>
        <EmptyTitle className="text-base font-medium">No spines yet</EmptyTitle>
        <EmptyDescription>
          Upload shelf photos and each CD spine appears here next to what Claude
          read.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link href="/upload">Upload photos</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function PhotoNotFound({ onShowAll }: { onShowAll: () => void }) {
  return (
    <Empty className="pt-16 pb-12">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ImageOff className="size-5" />
        </EmptyMedia>
        <EmptyTitle className="text-base font-medium">
          Photo not found
        </EmptyTitle>
        <EmptyDescription>
          It may have been removed from the data folder.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={onShowAll}>
          Show all photos
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function NothingNeedsReview({ onShowAll }: { onShowAll: () => void }) {
  return (
    <Empty className="pt-16 pb-12">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CircleCheck className="size-5" />
        </EmptyMedia>
        <EmptyTitle className="text-base font-medium">
          Nothing needs review
        </EmptyTitle>
        <EmptyDescription>
          Every field Claude read is above the confidence threshold, or you've
          already checked it.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={onShowAll}>
          Show all spines
        </Button>
      </EmptyContent>
    </Empty>
  );
}

/**
 * The /spines page body (REV-01, RESEARCH Pattern 7). Server-rendered from
 * `initialData`, then GET /api/spines every 1.5 s while any photo is active.
 * Sections are newest photo first; cards keep their spine-id keys across
 * polls, so a refetch never remounts a card.
 */
export function SpinesView({
  initialData,
  initialPhoto,
  initialReview,
  initialStatus,
}: {
  initialData: SpinesResponse;
  initialPhoto: string | null;
  initialReview: boolean;
  initialStatus: ReviewStatus | null;
}) {
  const [photo, setPhoto] = usePhotoFilter();
  const [review, setReview] = useReviewFilter();
  const [status, setStatus] = useStatusFilter();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ['spines', { photo, review, status }] as const,
    [photo, review, status],
  );
  const query = useQuery({
    queryKey,
    queryFn: () => fetchSpines(photo, review, status),
    initialData:
      photo === initialPhoto &&
      review === initialReview &&
      status === initialStatus
        ? initialData
        : undefined,
    // Changing a filter keeps the last list and the filter bar on screen
    // until the new one loads.
    placeholderData: keepPreviousData,
    // Every photo's status, so a scan finishing on a photo the filters hide
    // still refreshes the counts; and every 3 s while a listed spine's
    // Discogs search is queued or running or its import is waiting or
    // importing (Pitfall 4, UI-SPEC E7).
    refetchInterval: (q) => spinesRefetchInterval(q.state.data, q.state.status),
  });
  const data = query.data;
  const byPhoto = useMemo(() => groupByPhoto(data?.spines ?? []), [data]);

  // Leaving the current filter (UI-SPEC, D-11): an owner action announced
  // through SPINE_ACTION_EVENT that moves a spine out of the active status
  // filter gets a toast naming where it went, with Show, and focus moves on
  // to the next card. Only announced spines are considered, so background
  // transitions (an import finishing, a search completing) leave silently.
  const orderRef = useRef<{ prev: string[]; curr: string[] }>({
    prev: [],
    curr: [],
  });
  useEffect(() => {
    const ids = data?.spines.map((s) => s.id) ?? [];
    orderRef.current = { prev: orderRef.current.curr, curr: ids };
  }, [data]);
  const announcedRef = useRef<Announced | null>(null);
  const keyString = JSON.stringify(queryKey);

  /** Toast and move focus when `a`'s spine left the list; true when it did. */
  const explainMove = useCallback(
    (a: Announced, d: SpinesResponse, active: ReviewStatus | null) => {
      const moved = movedOutOf(active, d.statusById[a.spineId]);
      if (moved === null || d.spines.some((s) => s.id === a.spineId)) {
        return false;
      }
      toast(`Spine #${a.number} moved to ${REVIEW_STATUS_LABELS[moved]}`, {
        action: { label: 'Show', onClick: () => void setStatus(moved) },
      });
      const shown = new Set(d.spines.map((s) => s.id));
      focusAfterMove(nextShownId(a.order, a.spineId, shown));
      return true;
    },
    [setStatus],
  );

  useEffect(() => {
    if (status === null) {
      announcedRef.current = null;
      return;
    }
    const onAction = (e: Event) => {
      const detail = (e as CustomEvent<SpineActionDetail>).detail;
      if (!detail?.spineId) return;
      const { prev, curr } = orderRef.current;
      const a: Announced = {
        spineId: detail.spineId,
        number: detail.number,
        order: curr.includes(detail.spineId) ? curr : prev,
        key: keyString,
        after: queryClient.getQueryState(queryKey)?.dataUpdatedAt ?? 0,
      };
      // The actions refetch before they announce, so the cached data
      // usually shows the result already; otherwise the next update does.
      const cached = queryClient.getQueryData<SpinesResponse>(queryKey);
      announcedRef.current =
        cached && explainMove(a, cached, status) ? null : a;
    };
    window.addEventListener(SPINE_ACTION_EVENT, onAction);
    return () => window.removeEventListener(SPINE_ACTION_EVENT, onAction);
  }, [status, keyString, queryKey, queryClient, explainMove]);

  const dataUpdatedAt = query.dataUpdatedAt;
  useEffect(() => {
    const a = announcedRef.current;
    if (!a || !data || dataUpdatedAt <= a.after) return;
    // One data update per announcement: it explains the move or is dropped.
    announcedRef.current = null;
    if (a.key === keyString) explainMove(a, data, status);
  }, [data, dataUpdatedAt, keyString, status, explainMove]);
  // Cards read the Add label's folder and the connection state from here.
  const folderName = data?.discogs.folder.name ?? 'Uncategorized';
  const connected = data?.discogs.connected ?? false;
  const needsReconnect = data?.discogs.needsReconnect ?? false;
  const importUi = useMemo<ImportUiValue>(
    () => ({ folderName, connected, needsReconnect }),
    [folderName, connected, needsReconnect],
  );

  // A failed poll keeps the last data under the Alert; polling continues and
  // the Alert clears on the next success. With no data, it replaces the list.
  const pollError = query.isError ? (
    <Alert variant="destructive">
      <CircleX aria-hidden="true" />
      <AlertTitle>Couldn't refresh</AlertTitle>
      <AlertDescription>
        The latest status didn't load. Showing what was last loaded; retrying
        every few seconds.
      </AlertDescription>
    </Alert>
  ) : null;

  let body: ReactNode;
  if (!data) {
    body = pollError ?? <ListSkeleton />;
  } else if (photo && !data.photoOptions.some((p) => p.id === photo)) {
    body = <PhotoNotFound onShowAll={() => void setPhoto(null)} />;
  } else if (data.photoOptions.length === 0) {
    body = <NoSpinesYet />;
  } else if (review && data.spines.length === 0) {
    body = <NothingNeedsReview onShowAll={() => void setReview(false)} />;
  } else {
    body = (
      <div className="flex flex-col gap-6">
        {pollError}
        {!data.discogs.connected && data.spines.length > 0 ? (
          <DiscogsNotConnectedAlert reconnect={data.discogs.needsReconnect} />
        ) : null}
        <ImportUiProvider value={importUi}>
          {data.photos.map((p) => (
            <PhotoSection
              key={p.id}
              photo={p}
              spines={byPhoto.get(p.id) ?? []}
              threshold={data.confidenceThreshold}
              connected={data.discogs.connected}
              needsReconnect={data.discogs.needsReconnect}
              pausedUntil={data.discogs.pausedUntil}
            />
          ))}
        </ImportUiProvider>
      </div>
    );
  }

  const spineCount = data?.counts.all ?? 0;
  const photoCount = !data
    ? 0
    : photo
      ? data.photoOptions.filter((p) => p.id === photo).length
      : data.photoOptions.length;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-medium tracking-tight">Spines</h1>
        <p className="text-sm text-muted-foreground">
          {`${pluralize(spineCount, 'spine', 'spines')} from ${pluralize(photoCount, 'photo', 'photos')}. Changes save when you leave a field.`}
        </p>
        {data ? (
          <div className="pt-6">
            <SpinesFilterBar
              counts={data.counts}
              photoOptions={data.photoOptions}
            />
          </div>
        ) : null}
      </div>
      {body}
    </div>
  );
}
