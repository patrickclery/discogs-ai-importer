'use client';

import { cn } from 'cn';
import { useEffect, useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type {
  StatusJobStatus,
  StatusLane,
  StatusResponse,
} from '@/lib/status-types';

const POLL_MS = 5000;
const LANES: StatusLane[] = ['anthropic', 'discogs'];

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

/**
 * Header worker status (D-17). Polls /api/status every 5 s by setTimeout
 * chaining (one request in flight at a time), pauses while the tab is hidden,
 * and refetches at once on the app:status-refresh window event.
 * Not an aria-live region: polling must not spam screen readers.
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
    tooltip = LANES.map((lane) => (
      <div key={lane}>
        {lane} — <Num value={count(data, lane, 'queued')} /> queued,{' '}
        <Num value={count(data, lane, 'running')} /> running,{' '}
        <Num value={count(data, lane, 'failed')} /> failed
      </div>
    ));
    if (!data.worker) {
      dot = 'bg-destructive';
      text = 'Worker stopped';
    } else {
      const active = LANES.reduce(
        (n, lane) =>
          n + count(data, lane, 'queued') + count(data, lane, 'running'),
        0,
      );
      const failed = LANES.reduce(
        (n, lane) => n + count(data, lane, 'failed'),
        0,
      );
      dot =
        active > 0
          ? 'bg-success animate-pulse motion-reduce:animate-none'
          : 'bg-success';
      text = (
        <>
          {active > 0 ? (
            <>
              Working · <Num value={active} /> queued
            </>
          ) : (
            'Worker idle'
          )}
          {failed > 0 ? (
            <span className="text-destructive">
              {' '}
              · <Num value={failed} /> failed
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
