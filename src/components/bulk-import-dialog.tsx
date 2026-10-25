'use client';

import { type MouseEvent, useState } from 'react';
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
import { Spinner } from '@/components/ui/spinner';
import { dialogBody, dialogTitle, startErrorText } from '@/lib/bulk-copy';
import type { BulkStartBody, BulkStartResponse } from '@/lib/bulk-types';
import { failureReason, UNREACHABLE_REASON } from '@/lib/failure-reason';
import type { SpineDto } from '@/lib/scan-types';
import { needsReview } from '@/lib/spine-review';

// The bulk confirm dialog (D-07, D-08, D-14, D-16, UI-SPEC Bulk confirm
// dialog): one explicit confirm that names the count, the folder and the
// preferred country before any request (T-06-22). Start import runs the
// bulk import in the background with no preview. The request carries spine
// and candidate ids only; the server re-validates every pick and chooses
// the release and the country itself.

/** What the Start request needs from a picked spine. */
export type BulkPick = Pick<SpineDto, 'id' | 'discogs'>;

/** The rank-1 candidate's id: the top match the owner saw. */
export function topMatchId(spine: BulkPick): string | null {
  return spine.discogs?.topCandidates[0]?.id ?? null;
}

/** `{ items: [{ spineId, candidateId }] }`, spines without a top match left out. */
export function bulkStartBody(spines: readonly BulkPick[]): BulkStartBody {
  return {
    items: spines.flatMap((s) => {
      const candidateId = topMatchId(s);
      return candidateId ? [{ spineId: s.id, candidateId }] : [];
    }),
  };
}

export type StartResult =
  | { ok: true; response: BulkStartResponse }
  | { ok: false; reason: string };

/** Start the run; a refusal reads the server's message as the reason. */
export async function startBulkImport(
  spines: readonly BulkPick[],
): Promise<StartResult> {
  try {
    const res = await fetch('/api/spines/bulk-import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(bulkStartBody(spines)),
    });
    if (!res.ok) return { ok: false, reason: await failureReason(res) };
    return { ok: true, response: (await res.json()) as BulkStartResponse };
  } catch {
    return { ok: false, reason: UNREACHABLE_REASON };
  }
}

/** A 60-character folder name or a long country wraps inside the title. */
const TITLE_CLASS = 'min-w-0 text-base font-medium [overflow-wrap:anywhere]';

export function BulkImportDialog({
  open,
  onOpenChange,
  spines,
  folderName,
  country,
  threshold,
  onStarted,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The picked spines (shown and eligible). */
  spines: SpineDto[];
  folderName: string;
  /** The preferred country (D-14). */
  country: string;
  /** The confidence_threshold setting (D-16). */
  threshold: number;
  /** The run started; the dialog has already asked to close. */
  onStarted: (response: BulkStartResponse) => void;
  /** Where focus goes once the dialog has closed. */
  onCloseAutoFocus?: (e: Event) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lowConfidence = spines.filter((s) => needsReview(s, threshold)).length;

  function close(o: boolean) {
    // Escape and Keep reviewing do nothing while the request is in flight.
    if (pending || o) return;
    setError(null);
    onOpenChange(false);
  }

  async function start(e: MouseEvent<HTMLButtonElement>) {
    // Keep the dialog open until the request settles.
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await startBulkImport(spines);
    setPending(false);
    if (!result.ok) {
      setError(startErrorText(result.reason));
      return;
    }
    onOpenChange(false);
    onStarted(result.response);
  }

  return (
    <AlertDialog open={open} onOpenChange={close}>
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle className={TITLE_CLASS}>
            {dialogTitle(spines.length, folderName, country)}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {dialogBody(country, lowConfidence)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-sm break-words text-destructive">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            Keep reviewing
          </AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={start}>
            {pending ? (
              <>
                <Spinner aria-hidden="true" role="presentation" />
                Starting…
              </>
            ) : (
              'Start import'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
