'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import {
  announceSpineAction,
  useImportUi,
} from '@/components/import-ui-context';
import { STATUS_REFRESH_EVENT } from '@/components/status-indicator';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { failureReason, UNREACHABLE_REASON } from '@/lib/failure-reason';
import {
  addButtonLabel,
  addDisabledReason,
  addErrorText,
  addFolderName,
} from '@/lib/import-view';

// "Add to {folder}" on one candidate row (D-01, IMP-01, UI-SPEC Candidate
// row): the only control that adds anything to the owner's collection. It
// sends the candidate id only; the server reads the release from that
// spine's own candidate row. The card's CandidateList owns the pending id
// (every Add on the card is disabled while one is in flight, Pitfall 8) and
// the inline error line.

/** Data attributes the card's focus moves look for. */
export const ADD_BUTTON_ATTR = 'data-add-to-collection';
export const CHANGE_MATCH_ATTR = 'data-change-match';

/**
 * Focus the first enabled `[attr]` control inside the spine's card once the
 * refetched card has rendered (the clicked button may be gone by then).
 */
export function focusInCard(spineId: string, attr: string): void {
  if (typeof window === 'undefined') return;
  const run = () => {
    const card = document.querySelector<HTMLElement>(
      `[data-spine-card="${CSS.escape(spineId)}"]`,
    );
    const target = Array.from(
      card?.querySelectorAll<HTMLElement>(`[${attr}]`) ?? [],
    ).find((el) => !(el as HTMLButtonElement).disabled);
    target?.focus();
  };
  window.requestAnimationFrame(run);
}

async function errorCode(res: Response): Promise<string | null> {
  try {
    const body = (await res.clone().json()) as { error?: unknown };
    return typeof body.error === 'string' ? body.error : null;
  } catch {
    return null;
  }
}

export function AddToCollectionButton({
  spineId,
  spineNumber,
  candidateId,
  cardPendingId,
  onPendingChange,
  onError,
}: {
  spineId: string;
  /** spineNumber(spine), for the owner-action event. */
  spineNumber: number;
  candidateId: string;
  /** The candidate whose Add is in flight on this card, if any. */
  cardPendingId: string | null;
  onPendingChange: (candidateId: string | null) => void;
  onError: (message: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const { folderName, connected, needsReconnect } = useImportUi();
  const folder = addFolderName(folderName);
  const reason = addDisabledReason({ connected, needsReconnect });
  const pending = cardPendingId === candidateId;

  async function add() {
    onPendingChange(candidateId);
    onError(null);
    let added = false;
    try {
      const res = await fetch(
        `/api/spines/${encodeURIComponent(spineId)}/import`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ candidateId }),
        },
      );
      if (!res.ok) {
        const code = await errorCode(res);
        onError(addErrorText(code, await failureReason(res)));
        return;
      }
      added = true;
      // No toast: the badge and the panel change in place (UI-SPEC).
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['spines'] }),
        queryClient.invalidateQueries({
          queryKey: ['discogs-candidates', spineId],
        }),
      ]);
      window.dispatchEvent(new Event(STATUS_REFRESH_EVENT));
      announceSpineAction(spineId, spineNumber);
    } catch {
      if (!added) onError(addErrorText(null, UNREACHABLE_REASON));
    } finally {
      onPendingChange(null);
    }
    if (added) focusInCard(spineId, CHANGE_MATCH_ATTR);
  }

  const button = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-add-to-collection=""
      aria-label={pending ? undefined : addButtonLabel(folderName)}
      disabled={cardPendingId !== null || reason !== null}
      tabIndex={reason !== null ? -1 : undefined}
      onClick={() => void add()}
      className="max-w-full"
    >
      {pending ? (
        <>
          <Spinner aria-hidden="true" role="presentation" />
          Adding…
        </>
      ) : (
        <>
          <Plus aria-hidden="true" />
          <span className="flex min-w-0 items-center gap-1">
            Add to
            <span className="max-w-48 truncate" title={folder}>
              {folder}
            </span>
          </span>
        </>
      )}
    </Button>
  );

  if (reason === null) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so keyboard users reach the disabled reason
          tabIndex={0}
          className="inline-flex max-w-full rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}
