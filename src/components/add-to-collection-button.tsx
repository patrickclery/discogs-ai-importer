'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  DuplicateImportDialog,
  parseDuplicateBody,
} from '@/components/duplicate-import-dialog';
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
import type { DuplicateBody } from '@/lib/import-types';
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
// the inline error line. A 409 duplicate (another listed spine already
// holds the release, D-04) opens DuplicateImportDialog instead; its
// "Add another copy" resends the confirm with allowDuplicate.

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

async function errorBody(res: Response): Promise<unknown> {
  try {
    return await res.clone().json();
  } catch {
    return null;
  }
}

function codeOf(body: unknown): string | null {
  const error = (body as { error?: unknown } | null)?.error;
  return typeof error === 'string' ? error : null;
}

export function AddToCollectionButton({
  spineId,
  spineNumber,
  cropUrl,
  candidateId,
  cardPendingId,
  onPendingChange,
  onError,
}: {
  spineId: string;
  /** spineNumber(spine), for the owner-action event. */
  spineNumber: number;
  /** This spine's crop, shown beside the other spine's in the dialog. */
  cropUrl: string | null;
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [duplicate, setDuplicate] = useState<DuplicateBody | null>(null);
  const [dialogPending, setDialogPending] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  // Set once "Add another copy" succeeded: focus then moves to Change
  // match instead of back to this (unmounting) button.
  const confirmedDuplicate = useRef(false);

  async function add(allowDuplicate: boolean) {
    onPendingChange(candidateId);
    const showError = allowDuplicate ? setDialogError : onError;
    if (allowDuplicate) {
      setDialogPending(true);
      setDialogError(null);
    } else {
      onError(null);
    }
    let added = false;
    try {
      const res = await fetch(
        `/api/spines/${encodeURIComponent(spineId)}/import`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            allowDuplicate
              ? { candidateId, allowDuplicate: true }
              : { candidateId },
          ),
        },
      );
      if (!res.ok) {
        const body = await errorBody(res);
        const dup =
          !allowDuplicate && res.status === 409
            ? parseDuplicateBody(body)
            : null;
        if (dup) {
          // Ask first (D-04); the button goes back to idle.
          confirmedDuplicate.current = false;
          setDialogError(null);
          setDuplicate(dup);
          return;
        }
        showError(addErrorText(codeOf(body), await failureReason(res)));
        return;
      }
      added = true;
      if (allowDuplicate) {
        confirmedDuplicate.current = true;
        setDuplicate(null);
      }
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
      if (!added) showError(addErrorText(null, UNREACHABLE_REASON));
    } finally {
      onPendingChange(null);
      if (allowDuplicate) setDialogPending(false);
    }
    if (added) focusInCard(spineId, CHANGE_MATCH_ATTR);
  }

  const button = (
    <Button
      ref={buttonRef}
      type="button"
      variant="outline"
      size="sm"
      data-add-to-collection=""
      aria-label={pending ? undefined : addButtonLabel(folderName)}
      disabled={cardPendingId !== null || reason !== null}
      tabIndex={reason !== null ? -1 : undefined}
      onClick={() => void add(false)}
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

  const dialog = (
    <DuplicateImportDialog
      duplicate={duplicate}
      spineNumber={spineNumber}
      cropUrl={cropUrl}
      pending={dialogPending}
      error={dialogError}
      onConfirm={() => void add(true)}
      onCancel={() => setDuplicate(null)}
      onCloseAutoFocus={(e) => {
        // There is no trigger: Cancel returns focus to this Add button; a
        // confirmed add moves it to Change match (focusInCard).
        e.preventDefault();
        if (!confirmedDuplicate.current) buttonRef.current?.focus();
      }}
    />
  );

  if (reason === null) {
    return (
      <>
        {button}
        {dialog}
      </>
    );
  }
  return (
    <>
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
      {dialog}
    </>
  );
}
