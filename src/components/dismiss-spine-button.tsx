'use client';

import { useQueryClient } from '@tanstack/react-query';
import { type MouseEvent, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { failureReason, UNREACHABLE_REASON } from '@/lib/failure-reason';
import { importMayBeOnDiscogs } from '@/lib/import-types';
import type { SpineDto } from '@/lib/scan-types';
import { spineNumber } from '@/lib/spine-review';

// Dismiss an orphaned spine (UI-SPEC Dismiss confirm, D-16): the only
// destructive action in Phase 2. The card disappears; its edits stay in the
// database (A-21). Focus then moves to the next card's first field, or to the
// section header's Re-scan button when no card follows. A spine with an
// import whose copy is or may be on Discogs can't be dismissed (RESEARCH
// Pitfall 5, UI-SPEC E14, WR-01): the trigger is disabled with the reason in
// a tooltip.

/** UI-SPEC Copywriting: the disabled Dismiss spine tooltip. */
export const DISMISS_BLOCKED_REASON =
  "Spines with a match being added or already added can't be dismissed.";

/** Where focus goes once this card is gone: the next card, else Re-scan. */
function focusTargetAfter(spineId: string): () => void {
  const card = document.querySelector<HTMLElement>(
    `[data-spine-card="${CSS.escape(spineId)}"]`,
  );
  const section = card?.closest('section') ?? null;
  const cards = section
    ? Array.from(section.querySelectorAll<HTMLElement>('[data-spine-card]'))
    : [];
  const next = card ? cards[cards.indexOf(card) + 1] : undefined;
  const nextId = next?.dataset.spineCard ?? null;
  return () => {
    if (nextId) {
      const field = document.querySelector<HTMLElement>(
        `[data-spine-card="${CSS.escape(nextId)}"] :is(input, textarea)`,
      );
      if (field) {
        field.focus();
        return;
      }
    }
    // The visible Re-scan trigger (wide or icon-only, or the disabled
    // reason span while a run is active).
    const trigger = Array.from(
      section?.querySelectorAll<HTMLElement>('[data-rescan-trigger]') ?? [],
    ).find((el) => el.offsetParent !== null);
    trigger?.focus();
  };
}

export function DismissSpineButton({ spine }: { spine: SpineDto }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dismissed = useRef(false);
  const number = spineNumber(spine);
  const blocked = spine.import !== null && importMayBeOnDiscogs(spine.import);

  async function confirm(e: MouseEvent<HTMLButtonElement>) {
    // Keep the dialog open until the request settles.
    e.preventDefault();
    setPending(true);
    setError(null);
    const moveFocus = focusTargetAfter(spine.id);
    try {
      const res = await fetch(
        `/api/spines/${encodeURIComponent(spine.id)}/dismiss`,
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
      dismissed.current = true;
      setOpen(false);
      toast(`Spine #${number} dismissed`);
      await queryClient.invalidateQueries({ queryKey: ['spines'] });
      moveFocus();
    } catch {
      setError(UNREACHABLE_REASON);
    } finally {
      setPending(false);
    }
  }

  if (blocked) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so keyboard users reach the disabled reason
            tabIndex={0}
            className="inline-flex max-w-full rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled
            >
              Dismiss spine
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{DISMISS_BLOCKED_REASON}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        if (o) setError(null);
        setOpen(o);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="text-destructive hover:text-destructive"
        >
          Dismiss spine
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent
        onCloseAutoFocus={(e) => {
          // After a dismiss the trigger is going away: focus moves on instead.
          if (dismissed.current) e.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{`Dismiss spine #${number}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            It's removed from the list. Its edits stay in the database but are
            no longer used.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-sm break-words text-destructive">
            {`Couldn't dismiss: ${error}.`}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost" disabled={pending}>
            Keep spine
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={confirm}
          >
            {pending ? (
              <>
                <Spinner />
                Dismissing…
              </>
            ) : (
              'Dismiss spine'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
