'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CircleX, Copy, RotateCw, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { STATUS_REFRESH_EVENT } from '@/components/status-indicator';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { type BulkStatusKind, bulkStatusLineOf } from '@/lib/bulk-copy';
import { failureReason } from '@/lib/failure-reason';
import type { SpineDto } from '@/lib/scan-types';

const ICON = 'mt-px size-4 shrink-0';
const LINE = 'flex items-start gap-1 text-xs';
/** Compact cards show the fallback, skipped and finding lines as an outline pill (G-06-side-2). */
const PILL =
  'flex w-fit max-w-full items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-medium [&>svg]:size-3 [&>svg]:mt-0';
const NO_ANSWER = "the app didn't answer";

/**
 * Retry import on a failed lookup (BULK-11): POST /api/spines/{id}/retry
 * re-runs the lookup (Plan 06-05). On success ['spines'] is invalidated and
 * app:status-refresh (STATUS_REFRESH_EVENT) is dispatched; nothing is
 * written into a ['spines', …] key. A
 * request error is an inline alert under the button.
 */
function RetryImport({ spineId }: { spineId: string }) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/spines/${encodeURIComponent(spineId)}/retry`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        },
      );
      if (!res.ok) {
        setError(
          `Couldn't retry the import: ${await failureReason(res)}. Try again.`,
        );
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['spines'] });
      window.dispatchEvent(new Event(STATUS_REFRESH_EVENT));
    } catch {
      setError(`Couldn't retry the import: ${NO_ANSWER}. Try again.`);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => void retry()}
        >
          {pending ? (
            <>
              <Spinner aria-hidden="true" role="presentation" />
              Retrying…
            </>
          ) : (
            <>
              <RotateCw aria-hidden="true" />
              Retry import
            </>
          )}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs break-words text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}

/**
 * The card's one bulk status line (UI-SPEC Status line), from
 * bulkStatusLineOf's priority: a failed lookup (destructive, with Retry
 * import on the next line and Open Settings for a rejected connection), a
 * fallback (warning icon, foreground text), a skipped duplicate (muted) or
 * the lookup in progress (spinner, muted). `kinds` limits which lines this
 * place shows (Detailed cards split them between the confirmed panel and
 * the Discogs notice line). `clamp` (compact cards) shows the fallback,
 * skipped and finding text as an outline pill on one truncated line with
 * the full text on hover; the fallback pill drops ", used {country}" (the
 * Fallback badge names it). A failed lookup is never clamped, so its
 * explanation, Open Settings and Retry import stay visible and reachable.
 */
export function BulkStatusLine({
  spine,
  kinds,
  clamp = false,
}: {
  spine: SpineDto;
  kinds?: ReadonlyArray<BulkStatusKind>;
  /** Compact cards show the line as a one-line pill, with the full text on hover (G-06-side-2). */
  clamp?: boolean;
}) {
  const line = bulkStatusLineOf(spine);
  const shape = clamp ? PILL : LINE;
  if (line === null || (kinds && !kinds.includes(line.kind))) return null;
  // React attribute and text only (T-06-36): never HTML.
  const shown = clamp && line.kind === 'fallback' ? line.short : line.text;
  const text = clamp ? (
    <span className="min-w-0 truncate" title={line.text}>
      {shown}
    </span>
  ) : (
    <span className="min-w-0 break-words">{line.text}</span>
  );
  switch (line.kind) {
    case 'failed':
      return (
        <div className="flex basis-full flex-col gap-2">
          <p className={`${LINE} text-destructive`}>
            <CircleX aria-hidden="true" className={ICON} />
            <span className="min-w-0 break-words">
              {line.text}
              {line.link ? (
                <>
                  {' '}
                  <Link
                    href={line.link.href}
                    className="rounded-sm text-primary hover:text-primary-hover underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    {line.link.label}
                  </Link>
                  {line.link.tail}
                </>
              ) : null}
            </span>
          </p>
          <RetryImport spineId={spine.id} />
        </div>
      );
    case 'fallback':
      return (
        <p className={`${shape} text-foreground`}>
          <TriangleAlert
            aria-hidden="true"
            className={`${ICON} text-warning`}
          />
          {text}
        </p>
      );
    case 'skipped':
      return (
        <p className={`${shape} text-muted-foreground`}>
          <Copy aria-hidden="true" className={ICON} />
          {text}
        </p>
      );
    case 'finding':
      return (
        <p role="status" className={`${shape} text-muted-foreground`}>
          <Spinner
            aria-hidden="true"
            role="presentation"
            className="mt-px shrink-0"
          />
          {text}
        </p>
      );
  }
}
