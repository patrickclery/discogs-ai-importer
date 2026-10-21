'use client';

import { cn } from 'cn';
import { useEffect, useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  discogsTooltipLines,
  headerInputs,
  headerParts,
  type Part,
} from '@/lib/status-text';
import type {
  StatusJobStatus,
  StatusLane,
  StatusResponse,
} from '@/lib/status-types';

const POLL_MS = 5000;
const COUNTDOWN_MS = 1000;

/** Fired by any client code that just changed job state (e.g. DevJobTrigger). */
export const STATUS_REFRESH_EVENT = 'app:status-refresh';

type State =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'ok'; data: StatusResponse };

function count(
  data: StatusResponse,
  lane: StatusLane,
  status: StatusJobStatus,
): number {
  const n = data.jobs?.[lane]?.[status];
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function Num({ value }: { value: number }) {
  return <span className="font-mono tabular-nums">{value}</span>;
}

/** Text parts with every number in the mono tabular-nums Num. */
function Parts({ parts }: { parts: Part[] }) {
  return parts.map((p, i) =>
    typeof p === 'number' ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional
      <Num key={i} value={p} />
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional
      <span key={i}>{p}</span>
    ),
  );
}

/**
 * Wall-clock ms, ticking once a second only while until is in the future
 * (the paused countdown); the interval stops at until and on unmount.
 */
function useNowUntil(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (until === null || until <= Date.now()) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= until) clearInterval(id);
    }, COUNTDOWN_MS);
    return () => clearInterval(id);
  }, [until]);
  return now;
}

/**
 * Header worker status (D-17, Phase 3 D-07). Polls /api/status every 5 s by
 * setTimeout chaining (one request in flight at a time), pauses while the
 * tab is hidden, and refetches at once on the app:status-refresh window
 * event. Shows the Discogs backlog and a 429 pause with a client-side
 * countdown. Not an aria-live region: polling must not spam screen readers.
 */
export function StatusIndicator() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let again = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      clearTimeout(timer);
      if (cancelled || document.visibilityState === 'hidden') return;
      timer = setTimeout(tick, POLL_MS);
    };

    async function tick() {
      clearTimeout(timer);
      if (inFlight) {
        again = true;
        return;
      }
      inFlight = true;
      try {
        const res = await fetch('/api/status', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as StatusResponse;
        if (!cancelled) setState({ kind: 'ok', data });
      } catch {
        if (!cancelled) setState({ kind: 'unavailable' });
      } finally {
        inFlight = false;
        if (again && !cancelled) {
          again = false;
          void tick();
        } else {
          schedule();
        }
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void tick();
      else clearTimeout(timer);
    };
    const onRefresh = () => {
      void tick();
    };

    void tick();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener(STATUS_REFRESH_EVENT, onRefresh);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener(STATUS_REFRESH_EVENT, onRefresh);
    };
  }, []);

  const pausedUntil =
    state.kind === 'ok' ? (state.data.discogs?.pausedUntil ?? null) : null;
  const now = useNowUntil(pausedUntil);

  let dot = 'bg-muted-foreground';
  let text: React.ReactNode;
  let tooltip: React.ReactNode;

  if (state.kind === 'loading') {
    text = 'Checking worker…';
    tooltip = 'Checking worker…';
  } else if (state.kind === 'unavailable') {
    text = 'Status unavailable';
    tooltip = "Couldn't reach /api/status. Retrying every 5 seconds.";
  } else {
    const { data } = state;
    const input = headerInputs(data, now);
    const discogsLines = discogsTooltipLines({
      connected: data.discogs?.connected ?? false,
      d: input.d,
      failedSpines: data.discogs?.failedSpines ?? 0,
      pausedSeconds: input.pausedSeconds,
    });
    tooltip = (
      <>
        <div>
          anthropic — <Num value={count(data, 'anthropic', 'queued')} /> queued,{' '}
          <Num value={count(data, 'anthropic', 'running')} /> running,{' '}
          <Num value={count(data, 'anthropic', 'failed')} /> failed
        </div>
        {discogsLines.map((line) => (
          <div key={String(line[0])}>
            <Parts parts={line} />
          </div>
        ))}
      </>
    );
    if (!data.worker) {
      dot = 'bg-destructive';
      text = 'Worker stopped';
    } else {
      const parts = headerParts(input);
      dot =
        input.a + input.d > 0
          ? 'bg-success animate-pulse motion-reduce:animate-none'
          : 'bg-success';
      text = (
        <>
          <Parts parts={parts.main} />
          {parts.failed ? (
            <span className="text-destructive">
              <Parts parts={parts.failed} />
            </span>
          ) : null}
        </>
      );
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1 rounded-md px-3 text-xs outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span aria-hidden="true" className={cn('size-2 rounded-full', dot)} />
          <span className="sr-only sm:not-sr-only">{text}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
