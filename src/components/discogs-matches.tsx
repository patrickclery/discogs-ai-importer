'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CircleX, Clock, PencilLine, RotateCw, Unplug } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import { CandidateList } from '@/components/candidate-list';
import { ConfirmedMatch } from '@/components/confirmed-match';
import { DiscogsSearchDialog } from '@/components/discogs-search-dialog';
import { STATUS_REFRESH_EVENT } from '@/components/status-indicator';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useSecondsUntil } from '@/components/use-seconds-until';
import {
  pausedLine,
  QUEUED_LINE,
  SEARCHING_LINE,
  searchFailureText,
} from '@/lib/candidate-format';
import { failureReason, UNREACHABLE_REASON } from '@/lib/failure-reason';
import type { SpineDto } from '@/lib/scan-types';
import { spineNumber } from '@/lib/spine-review';

// The card footer's "Discogs matches" section (D-12, UI-SPEC Spine card:
// Discogs matches). Header row, at most one notice line, then the body by
// search state. Search again / Retry search post { mode: 'again' } to
// /api/spines/{id}/search (Plan 03-10); Search Discogs… opens the dialog
// for a typed search or a pasted release (Plan 03-11).

export const NOT_SEARCHED_LINE =
  "Not looked up yet. It's waiting its turn, or use Search Discogs… to look it up now.";
export const UNSURE_MEDIA_LINE =
  "This spine may not be a CD, so it wasn't looked up automatically. Use Search Discogs… if it is one.";
export const ORPHANED_LINE =
  "Spines the latest scan didn't find aren't looked up automatically. Use Search Discogs… if you need it.";
export const FIELDS_CHANGED_LINE = 'Fields changed since last search.';
export const NO_MATCHES_LINE =
  'Discogs found nothing for this spine. Check the artist, title and catalog number against the crop, then search again, or use Search Discogs….';

function Line({
  icon,
  children,
  className,
  role,
}: {
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  role?: 'status';
}) {
  return (
    <p
      role={role}
      className={`flex items-start gap-1 text-xs ${className ?? 'text-muted-foreground'}`}
    >
      {icon}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/**
 * Whole seconds until `until`, ticking once a second while it is in the
 * future and `active`; 0 once it passes (the interval is cleared then and on
 * unmount).
 */
/**
 * D-14, WR-01: whether the card shows "Fields changed since last search."
 * and may offer Search again. Never on a not-searched card: its body line
 * already says what happens next. The maintenance hook queues an active,
 * connected CD spine within one lease tick, and orphaned and unsure-media
 * spines point to Search Discogs…. So such a card offers neither the notice
 * nor Search again, and the button can no longer race the hook into a busy
 * error.
 */
export function showsFieldsChanged(
  discogs: SpineDto['discogs'] | undefined,
): boolean {
  return !!discogs && discogs.fieldsChanged && discogs.state !== 'not_searched';
}

/**
 * The not-connected, fields-changed, paused or failed line, at most one
 * (UI-SPEC order). Fields changed follows showsFieldsChanged (WR-01).
 */
function NoticeLine({
  spine,
  connected,
  needsReconnect,
  pausedUntil,
}: {
  spine: SpineDto;
  connected: boolean;
  needsReconnect: boolean;
  pausedUntil: number | null;
}) {
  const queued = connected && spine.discogs?.state === 'queued';
  const pausedSeconds = useSecondsUntil(pausedUntil, queued);
  // UI-SPEC Notice line: an imported card shows none; a card with an open
  // import keeps only not connected and the paused countdown (the panel's
  // state line carries the countdown while the import waits).
  const importPhase = spine.import?.phase ?? null;
  if (importPhase === 'imported') return null;
  if (!connected) {
    return (
      <Line
        icon={<Unplug aria-hidden="true" className="mt-px size-4 shrink-0" />}
      >
        {needsReconnect
          ? 'Reconnect Discogs to find matches.'
          : 'Connect Discogs to find matches.'}{' '}
        <Link
          href="/settings"
          className="rounded-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Open Settings
        </Link>
      </Line>
    );
  }
  if (importPhase === null && showsFieldsChanged(spine.discogs)) {
    return (
      <Line
        icon={
          <PencilLine
            aria-hidden="true"
            className="mt-px size-4 shrink-0 text-warning"
          />
        }
      >
        {FIELDS_CHANGED_LINE}
      </Line>
    );
  }
  if (pausedSeconds > 0) {
    return (
      <Line
        icon={<Clock aria-hidden="true" className="mt-px size-4 shrink-0" />}
      >
        {pausedLine(pausedSeconds)}
      </Line>
    );
  }
  if (importPhase === null && spine.discogs?.state === 'failed') {
    return (
      <Line
        className="text-destructive"
        icon={<CircleX aria-hidden="true" className="mt-px size-4 shrink-0" />}
      >
        {searchFailureText(spine.discogs.failure)}
      </Line>
    );
  }
  return null;
}

/**
 * The line a not-searched card body shows (UI-SPEC Body by state). Not
 * connected: none, the notice line already says what to do. Orphaned and
 * unsure-media spines are never looked up automatically. Only an active CD
 * spine gets "waiting its turn", which the read model shows exactly when
 * the maintenance hook will queue it (CR-01).
 */
export function notSearchedLine(
  spine: Pick<SpineDto, 'state' | 'mediaKind'>,
  connected: boolean,
): string | null {
  if (!connected) return null;
  if (spine.state === 'orphaned') return ORPHANED_LINE;
  if (spine.mediaKind !== 'cd') return UNSURE_MEDIA_LINE;
  return NOT_SEARCHED_LINE;
}

/**
 * The body by state (UI-SPEC table). With an import (matched, failed import
 * or imported) only the confirmed match shows, even when the latest search
 * failed (A-04-09). Otherwise earlier candidates always stay.
 */
function Body({
  spine,
  connected,
  pausedUntil,
}: {
  spine: SpineDto;
  connected: boolean;
  pausedUntil: number | null;
}) {
  if (spine.import) {
    return <ConfirmedMatch spine={spine} pausedUntil={pausedUntil} />;
  }
  const discogs = spine.discogs;
  const state = discogs?.state ?? 'not_searched';
  const candidates = discogs?.topCandidates ?? [];
  const list = (
    <CandidateList
      spineId={spine.id}
      spineNumber={spineNumber(spine)}
      candidates={candidates}
      total={discogs?.candidateCount ?? candidates.length}
    />
  );
  if (candidates.length > 0 && state !== 'no_match') return list;
  switch (state) {
    case 'queued':
      return (
        <Line
          icon={<Clock aria-hidden="true" className="mt-px size-4 shrink-0" />}
        >
          {QUEUED_LINE}
        </Line>
      );
    case 'searching':
      return (
        <Line
          role="status"
          icon={
            <Spinner
              aria-hidden="true"
              role="presentation"
              className="mt-px shrink-0"
            />
          }
        >
          {SEARCHING_LINE}
        </Line>
      );
    case 'no_match':
      return (
        <>
          <Line>{NO_MATCHES_LINE}</Line>
          {list}
        </>
      );
    case 'not_searched': {
      const line = notSearchedLine(spine, connected);
      return line ? <Line>{line}</Line> : null;
    }
    default:
      // done with nothing stored, or failed with no earlier candidates:
      // the badge and the notice line carry it.
      return null;
  }
}

/**
 * Which header action the spine offers (UI-SPEC Header row): Retry search
 * when the latest search failed (D-06), else Search again when
 * showsFieldsChanged and it is not queued or running (D-14). A not-searched
 * card offers neither: its body line already says what happens next, and
 * the button could race the maintenance hook into a busy error (WR-01).
 */
export function matchesAction(
  spine: Pick<SpineDto, 'discogs'>,
): 'retry' | 'again' | null {
  const d = spine.discogs;
  if (!d) return null;
  if (d.state === 'failed') return 'retry';
  if (
    showsFieldsChanged(d) &&
    d.state !== 'queued' &&
    d.state !== 'searching'
  ) {
    return 'again';
  }
  return null;
}

/** Search again / Retry search, plus its inline request error. */
function useSearchAgain(spineId: string) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/spines/${encodeURIComponent(spineId)}/search`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'again' }),
        },
      );
      if (!res.ok) {
        setError(await failureReason(res));
        return;
      }
      // No toast: the badge flips to Queued (UI-SPEC).
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['spines'] }),
        queryClient.invalidateQueries({
          queryKey: ['discogs-candidates', spineId],
        }),
      ]);
      window.dispatchEvent(new Event(STATUS_REFRESH_EVENT));
    } catch {
      setError(UNREACHABLE_REASON);
    } finally {
      setPending(false);
    }
  }
  return { pending, error, run };
}

export function DiscogsMatches({
  spine,
  connected,
  needsReconnect = false,
  pausedUntil,
}: {
  spine: SpineDto;
  /** SpinesResponse.discogs.connected (D-04). */
  connected: boolean;
  /** SpinesResponse.discogs.needsReconnect (WR-05). */
  needsReconnect?: boolean;
  /** SpinesResponse.discogs.pausedUntil: the paused line while queued (D-06). */
  pausedUntil: number | null;
}) {
  // A confirmed match hides the search actions until Change match (D-01).
  const confirmed = spine.import !== null && spine.import !== undefined;
  const action = confirmed ? null : matchesAction(spine);
  const again = useSearchAgain(spine.id);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            {confirmed ? 'Confirmed match' : 'Discogs matches'}
          </h3>
          <div className="ml-auto flex flex-wrap justify-end gap-2">
            {action ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={again.pending || !connected}
                onClick={() => void again.run()}
              >
                {again.pending ? (
                  <>
                    <Spinner aria-hidden="true" role="presentation" />
                    Queuing…
                  </>
                ) : (
                  <>
                    <RotateCw aria-hidden="true" />
                    {action === 'retry' ? 'Retry search' : 'Search again'}
                  </>
                )}
              </Button>
            ) : null}
            {confirmed ? null : (
              <DiscogsSearchDialog spine={spine} connected={connected} />
            )}
          </div>
        </div>
        {again.error ? (
          <p role="alert" className="text-xs text-destructive">
            Couldn't start the search: {again.error}.
          </p>
        ) : null}
        <NoticeLine
          spine={spine}
          connected={connected}
          needsReconnect={needsReconnect}
          pausedUntil={pausedUntil}
        />
      </div>
      <Body spine={spine} connected={connected} pausedUntil={pausedUntil} />
    </div>
  );
}
