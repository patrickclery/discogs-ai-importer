'use client';

import { useQueryClient } from '@tanstack/react-query';
import { RotateCw } from 'lucide-react';
import { type MouseEvent, useRef, useState } from 'react';
import { toast } from 'sonner';
import { STATUS_REFRESH_EVENT } from '@/components/status-indicator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// Re-scan trigger and confirm (UI-SPEC Re-scan, D-17, INGEST-04). Shared by
// the /spines section header and /upload rows. Re-scan spends subscription
// quota, so it always asks first; the confirm is not destructive (nothing is
// deleted, D-13).

const ACTIVE_TOOLTIP = 'This photo is already being analyzed.';

/** The server's message (or a fallback) without its final period. */
async function failureReason(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown; error?: unknown };
    const text =
      typeof body.message === 'string'
        ? body.message
        : typeof body.error === 'string'
          ? body.error
          : '';
    if (text) return text.replace(/\.\s*$/, '');
  } catch {
    // Not JSON: fall through.
  }
  return `the server answered ${res.status}`;
}

export function RescanButton({
  photoId,
  filename,
  active,
  compactOnMobile = false,
}: {
  photoId: string;
  filename: string;
  /** A run is queued or analyzing: the trigger is disabled. */
  active: boolean;
  /** Icon-only 36px trigger below 640px (the /spines section header). */
  compactOnMobile?: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wideRef = useRef<HTMLButtonElement>(null);
  const compactRef = useRef<HTMLButtonElement>(null);
  const lastTrigger = useRef<HTMLButtonElement | null>(null);

  if (active) {
    // A disabled button gets no pointer events: the wrapping span is the
    // tooltip trigger and carries the reason.
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so keyboard users reach the disabled reason
            tabIndex={0}
            className="inline-flex rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Button
              type="button"
              variant="outline"
              disabled
              tabIndex={-1}
              className={cn(compactOnMobile && 'max-sm:size-9 max-sm:px-0')}
            >
              <Spinner />
              <span className={cn(compactOnMobile && 'max-sm:sr-only')}>
                Analyzing…
              </span>
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{ACTIVE_TOOLTIP}</TooltipContent>
      </Tooltip>
    );
  }

  function openFrom(trigger: HTMLButtonElement | null) {
    lastTrigger.current = trigger;
    setError(null);
    setOpen(true);
  }

  async function confirm(e: MouseEvent<HTMLButtonElement>) {
    // Keep the dialog open until the request settles.
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/photos/${encodeURIComponent(photoId)}/rescan`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        },
      );
      if (!res.ok) {
        setError(await failureReason(res));
        return;
      }
      setOpen(false);
      toast(`Re-scan queued for ${filename}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['photos'] }),
        queryClient.invalidateQueries({ queryKey: ['spines'] }),
      ]);
      window.dispatchEvent(new Event(STATUS_REFRESH_EVENT));
    } catch {
      setError("the app couldn't reach the server");
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <Button
        ref={wideRef}
        type="button"
        variant="outline"
        className={cn(compactOnMobile && 'max-sm:hidden')}
        onClick={() => openFrom(wideRef.current)}
      >
        <RotateCw aria-hidden="true" />
        Re-scan photo
      </Button>
      {compactOnMobile ? (
        <Button
          ref={compactRef}
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Re-scan ${filename}`}
          className="sm:hidden"
          onClick={() => openFrom(compactRef.current)}
        >
          <RotateCw aria-hidden="true" />
        </Button>
      ) : null}
      <AlertDialogContent
        onCloseAutoFocus={(e) => {
          // Focus returns to whichever trigger opened the dialog.
          const target = lastTrigger.current;
          if (target) {
            e.preventDefault();
            target.focus();
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">
            {`Re-scan ${filename}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Claude reads this photo again, which uses your subscription quota.
            Edits are kept on every spine that's found again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-sm break-words text-destructive">
            {`Couldn't start the re-scan: ${error}.`}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost" disabled={pending}>
            Keep current scan
          </AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={confirm}>
            {pending ? (
              <>
                <Spinner />
                Starting…
              </>
            ) : (
              'Re-scan photo'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
