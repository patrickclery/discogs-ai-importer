'use client';

import { CircleX, Clock, Unplug } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useEffect, useState } from 'react';
import { CandidateList } from '@/components/candidate-list';
import { Spinner } from '@/components/ui/spinner';
import { searchFailureText } from '@/lib/candidate-format';
import type { SpineDto } from '@/lib/scan-types';

// The card footer's "Discogs matches" section (D-12, UI-SPEC Spine card:
// Discogs matches). Header row, at most one notice line, then the body by
// search state. Plans 03-10 and 03-11 add the Search again / Retry search /
// Search Discogs… actions.

export const NOT_SEARCHED_LINE =
  "Not looked up yet. It's waiting its turn, or use Search Discogs… to look it up now.";
export const UNSURE_MEDIA_LINE =
  "This spine may not be a CD, so it wasn't looked up automatically. Use Search Discogs… if it is one.";
export const ORPHANED_LINE =
  "Spines the latest scan didn't find aren't looked up automatically. Use Search Discogs… if you need it.";
export const QUEUED_LINE =
  'Waiting its turn. Discogs allows about one lookup per second.';
export const SEARCHING_LINE = 'Searching Discogs…';
/** UI-SPEC Paused line, `{s}` counting down client-side from pausedUntil. */
export function pausedLine(seconds: number): string {
  return `Discogs asked the app to slow down. Searching picks up again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`;
}
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

/** The not-connected, paused or failed line, at most one (UI-SPEC order). */
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
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            Discogs matches
          </h3>
          {/* Plans 03-10 and 03-11 add Search again, Retry and Search Discogs…. */}
          <div className="ml-auto flex flex-wrap gap-2" />
        </div>
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
