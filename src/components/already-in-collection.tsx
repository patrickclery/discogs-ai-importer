'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CopyPlus, Link as LinkIcon, TriangleAlert } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import {
  CHANGE_MATCH_ATTR,
  focusInCard,
} from '@/components/add-to-collection-button';
import { announceSpineAction } from '@/components/import-ui-context';
import { STATUS_REFRESH_EVENT } from '@/components/status-indicator';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { failureReason, UNREACHABLE_REASON } from '@/lib/failure-reason';
import type { ImportDto } from '@/lib/import-types';
import { ALREADY_DECISION_LINE, alreadyLine } from '@/lib/import-view';

// "Already in your collection" (UI-SPEC Confirmed-match panel
// already_in_collection row, D-05, IMP-03): the release already has a copy
// on Discogs that the app did not record. The panel names that copy's
// folder and date and waits for the owner: Link existing copy (accent, the
// safe choice and the only primary button here) records that copy with no
// Discogs write; Add another copy re-enqueues the same import with
// allow_duplicate. Nothing is written until one is clicked. Plan 04-04's
// routes decide what is still allowed; errors stay inline.

/** UI-SPEC Copywriting: the link toast. */
export function linkToast(number: number): string {
  return `Spine #${number} linked to the copy already in your collection`;
}

type Decision = 'link' | 'another';

export function AlreadyInCollection({
  spineId,
  spineNumber,
  existing,
  disabled,
  onPendingChange,
  trailing,
}: {
  spineId: string;
  /** spineNumber(spine), for the toast and the owner-action event. */
  spineNumber: number;
  existing: NonNullable<ImportDto['existing']>;
  /** Another panel action (Change match) is in flight. */
  disabled: boolean;
  /** Tells the panel a decision is in flight, so it disables Change match. */
  onPendingChange: (pending: boolean) => void;
  /** The panel's Change match button, last in the action row. */
  trailing: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: Decision) {
    setPending(decision);
    onPendingChange(true);
    setError(null);
    const prefix = decision === 'link' ? "Couldn't link it" : "Couldn't add it";
    let done = false;
    try {
      const res = await fetch(
        `/api/spines/${encodeURIComponent(spineId)}/import/${
          decision === 'link' ? 'link-existing' : 'another'
        }`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        },
      );
      if (!res.ok) {
        setError(`${prefix}: ${await failureReason(res)}.`);
        return;
      }
      done = true;
      // Add another copy needs no toast: the panel returns to waiting.
      if (decision === 'link') toast(linkToast(spineNumber));
      await queryClient.invalidateQueries({ queryKey: ['spines'] });
      window.dispatchEvent(new Event(STATUS_REFRESH_EVENT));
      announceSpineAction(spineId, spineNumber);
    } catch {
      if (!done) setError(`${prefix}: ${UNREACHABLE_REASON}.`);
    } finally {
      setPending(null);
      onPendingChange(false);
    }
    // Waiting again: focus Change match, as after Retry.
    if (done && decision === 'another') {
      focusInCard(spineId, CHANGE_MATCH_ATTR);
    }
  }

  const busy = disabled || pending !== null;

  return (
    <>
      <div className="flex items-start gap-1 text-xs text-foreground">
        <TriangleAlert
          aria-hidden="true"
          className="mt-px size-4 shrink-0 text-warning"
        />
        <div className="flex min-w-0 flex-col break-words [overflow-wrap:anywhere]">
          <p>{alreadyLine(existing)}</p>
          <p>{ALREADY_DECISION_LINE}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => void decide('link')}
        >
          {pending === 'link' ? (
            <>
              <Spinner aria-hidden="true" role="presentation" />
              Linking…
            </>
          ) : (
            <>
              <LinkIcon aria-hidden="true" />
              Link existing copy
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void decide('another')}
        >
          {pending === 'another' ? (
            <>
              <Spinner aria-hidden="true" role="presentation" />
              Adding…
            </>
          ) : (
            <>
              <CopyPlus aria-hidden="true" />
              Add another copy
            </>
          )}
        </Button>
        {trailing}
      </div>
      {error ? (
        <p role="alert" className="text-xs break-words text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}
