'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CircleX, Clock, PencilLine, RotateCw, Unplug } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useEffect, useState } from 'react';
import { CandidateList } from '@/components/candidate-list';
import { DiscogsSearchDialog } from '@/components/discogs-search-dialog';
import { STATUS_REFRESH_EVENT } from '@/components/status-indicator';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  pausedLine,
  QUEUED_LINE,
  SEARCHING_LINE,
  searchFailureText,
} from '@/lib/candidate-format';
import { failureReason, UNREACHABLE_REASON } from '@/lib/failure-reason';
import type { SpineDto } from '@/lib/scan-types';

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
function useSecondsUntil(until: number | null, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!active || until === null || until <= Date.now()) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= until) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [until, active]);
  if (!active || until === null) return 0;
  const left = until - now;
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/**
 * The not-connected, fields-changed, paused or failed line, at most one
 * (UI-SPEC order).
 */
function NoticeLine({
  spine,
  connected,
  pausedUntil,
}: {
  spine: SpineDto;
  connected: boolean;
  pausedUntil: number | null;
}) {
  const queued = connected && spine.discogs?.state === 'queued';
  const pausedSeconds = useSecondsUntil(pausedUntil, queued);
  if (!connected) {
    return (
      <Line
        icon={<Unplug aria-hidden="true" className="mt-px size-4 shrink-0" />}
      >
        Connect Discogs to find matches.{' '}
        <Link
          href="/settings"
          className="rounded-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Open Settings
        </Link>
      </Line>
    );
  }
  if (spine.discogs?.fieldsChanged) {
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
  if (spine.discogs?.state === 'failed') {
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

/** The body by state (UI-SPEC table). Earlier candidates always stay. */
function Body({ spine, connected }: { spine: SpineDto; connected: boolean }) {
  const discogs = spine.discogs;
  const state = discogs?.state ?? 'not_searched';
  const candidates = discogs?.topCandidates ?? [];
  const list = (
    <CandidateList
      spineId={spine.id}
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
    case 'not_searched':
      // Not connected: the notice line already says what to do.
      if (!connected) return null;
      if (spine.state === 'orphaned') return <Line>{ORPHANED_LINE}</Line>;
      if (spine.mediaKind !== 'cd') return <Line>{UNSURE_MEDIA_LINE}</Line>;
      return <Line>{NOT_SEARCHED_LINE}</Line>;
    default:
      // done with nothing stored, or failed with no earlier candidates:
      // the badge and the notice line carry it.
      return null;
  }
}

/**
 * Which header action the spine offers (UI-SPEC Header row): Retry search
 * when the latest search failed (D-06), else Search again when the fields
 * changed since it and it is not queued or running (D-14).
 */
export function matchesAction(
  spine: Pick<SpineDto, 'discogs'>,
): 'retry' | 'again' | null {
  const d = spine.discogs;
  if (!d) return null;
  if (d.state === 'failed') return 'retry';
  if (d.fieldsChanged && d.state !== 'queued' && d.state !== 'searching') {
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
  pausedUntil,
}: {
  spine: SpineDto;
  /** SpinesResponse.discogs.connected (D-04). */
  connected: boolean;
  /** SpinesResponse.discogs.pausedUntil: the paused line while queued (D-06). */
  pausedUntil: number | null;
}) {
  const action = matchesAction(spine);
  const again = useSearchAgain(spine.id);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            Discogs matches
          </h3>
          <div className="ml-auto flex flex-wrap justify-end gap-2">
            {action ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={again.pending}
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
            <DiscogsSearchDialog spine={spine} connected={connected} />
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
          pausedUntil={pausedUntil}
        />
      </div>
      <Body spine={spine} connected={connected} />
    </div>
  );
}
