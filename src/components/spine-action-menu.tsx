'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CircleSlash, EllipsisVertical, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { announceSpineAction } from '@/components/import-ui-context';
import { STATUS_REFRESH_EVENT } from '@/components/status-indicator';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { UNREACHABLE_REASON } from '@/lib/failure-reason';
import { importMayBeOnDiscogs } from '@/lib/import-types';
import type { SpineDto } from '@/lib/scan-types';
import { spineNumber } from '@/lib/spine-review';

// The card action menu (UI-SPEC E10, D-14, REV-05): "Mark not on Discogs" /
// "Unmark not on Discogs". Both post { flag } to
// /api/spines/{id}/not-on-discogs; nothing is deleted and the mark is always
// reversible (from the menu, the marked line, or the toast's Undo). Toasts
// only on success; every request error is an inline line under the header
// row (DiscogsMatches renders control.error).

/** UI-SPEC Copywriting: the server's refusal on an imported spine. */
export const IMPORTED_REFUSAL =
  "This spine is already in your collection, so it can't be marked.";

/** Whether the spine offers "Mark not on Discogs" (UI-SPEC Action menu). */
export function canMarkNotOnDiscogs(
  spine: Pick<SpineDto, 'notOnDiscogs' | 'import' | 'reviewStatus'>,
): boolean {
  if (spine.notOnDiscogs) return false;
  // Open, or failed after its POST may have landed (WR-03).
  if (spine.import !== null && importMayBeOnDiscogs(spine.import)) return false;
  return (
    spine.reviewStatus === 'pending' ||
    spine.reviewStatus === 'not_found' ||
    spine.reviewStatus === 'failed'
  );
}

/**
 * The inline error for a failed mark (flag true) or unmark: the imported
 * refusal verbatim, else "Couldn't mark it: {reason}." with the server's
 * message (or code, or status) as the reason.
 */
export function markErrorText(
  flag: boolean,
  body: { error?: unknown; message?: unknown } | null,
  status: number,
): string {
  if (body?.error === 'imported') return IMPORTED_REFUSAL;
  const raw =
    typeof body?.message === 'string'
      ? body.message
      : typeof body?.error === 'string'
        ? body.error
        : `the server answered ${status}`;
  const reason = raw.replace(/\.\s*$/, '');
  return flag
    ? `Couldn't mark it: ${reason}.`
    : `Couldn't unmark it: ${reason}.`;
}

/** Where the mark or unmark was started: the menu shows its own spinner. */
export type MarkSource = 'menu' | 'button';

/** Mark or unmark, shared by the menu, the marked line and the not-found row. */
export type NotOnDiscogsControl = {
  /** The request in flight, or null. */
  pending: { flag: boolean; source: MarkSource } | null;
  /** The inline error copy of the last failed request, or null. */
  error: string | null;
  run: (flag: boolean, source: MarkSource) => Promise<void>;
};

/** Focus inside this spine's card once the refetch rendered it. */
function focusInCard(spineId: string, selector: string): void {
  requestAnimationFrame(() => {
    document
      .querySelector<HTMLElement>(
        `[data-spine-card="${CSS.escape(spineId)}"] ${selector}`,
      )
      ?.focus();
  });
}

export function useNotOnDiscogs(
  spine: Pick<SpineDto, 'id' | 'index'>,
): NotOnDiscogsControl {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<NotOnDiscogsControl['pending']>(null);
  const [error, setError] = useState<string | null>(null);
  const number = spineNumber(spine);

  async function run(flag: boolean, source: MarkSource): Promise<void> {
    setPending({ flag, source });
    setError(null);
    try {
      const res = await fetch(
        `/api/spines/${encodeURIComponent(spine.id)}/not-on-discogs`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ flag }),
        },
      );
      if (!res.ok) {
        let body: { error?: unknown; message?: unknown } | null = null;
        try {
          body = (await res.json()) as typeof body;
        } catch {
          body = null;
        }
        setError(markErrorText(flag, body, res.status));
        return;
      }
      if (flag) {
        toast(`Spine #${number} marked not on Discogs`, {
          action: { label: 'Undo', onClick: () => void run(false, 'menu') },
        });
      } else {
        toast(`Spine #${number} unmarked`);
      }
      // The pending state (and the menu's spinner) holds until the refetch.
      await queryClient.invalidateQueries({ queryKey: ['spines'] });
      window.dispatchEvent(new Event(STATUS_REFRESH_EVENT));
      announceSpineAction(spine.id, number);
      // UI-SPEC: after a mark focus moves to Unmark, after an unmark to the
      // action-menu trigger. A card that left the filter has neither.
      focusInCard(
        spine.id,
        flag ? '[data-unmark-button]' : '[data-action-menu-trigger]',
      );
    } catch {
      setError(
        flag
          ? `Couldn't mark it: ${UNREACHABLE_REASON}.`
          : `Couldn't unmark it: ${UNREACHABLE_REASON}.`,
      );
    } finally {
      setPending(null);
    }
  }
  return { pending, error, run };
}

export function SpineActionMenu({
  spine,
  control,
}: {
  spine: SpineDto;
  control: NotOnDiscogsControl;
}) {
  const number = spineNumber(spine);
  const canMark = canMarkNotOnDiscogs(spine);
  const canUnmark = spine.notOnDiscogs;
  const busy = control.pending !== null;
  // UI-SPEC: a menu item closes the menu at once; the card shows a Spinner
  // here until the refetch.
  if (control.pending?.source === 'menu') {
    return (
      <span
        role="status"
        className="inline-flex size-9 items-center justify-center"
      >
        <Spinner aria-hidden="true" role="presentation" />
        <span className="sr-only">
          {control.pending.flag ? 'Marking…' : 'Unmarking…'}
        </span>
      </span>
    );
  }
  // UI-SPEC: no trigger when the menu would be empty.
  if (!canMark && !canUnmark) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={busy}
          data-action-menu-trigger=""
          aria-label={`More actions for spine #${number}`}
        >
          <EllipsisVertical aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canMark ? (
          <DropdownMenuItem onSelect={() => void control.run(true, 'menu')}>
            <CircleSlash aria-hidden="true" className="size-4" />
            Mark not on Discogs
          </DropdownMenuItem>
        ) : null}
        {canUnmark ? (
          <DropdownMenuItem onSelect={() => void control.run(false, 'menu')}>
            <Undo2 aria-hidden="true" className="size-4" />
            Unmark not on Discogs
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
