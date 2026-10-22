'use client';

import { useQueryClient } from '@tanstack/react-query';
import { RotateCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { STATUS_REFRESH_EVENT } from '@/components/status-indicator';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { failureReason, UNREACHABLE_REASON } from '@/lib/failure-reason';

// Retry all failed (UI-SPEC /spines filter bar row 2, D-13, REV-04): one
// bulk POST /api/spines/retry-failed for the photo filter in view. The
// server applies the per-spine Retry rule to each failed spine; nothing is
// re-uploaded or re-scanned. While Discogs is not connected it retries
// nothing and a muted inline line says so instead of a toast.

const NOTHING_RETRIED = 'Nothing to retry until Discogs is connected.';

/** The success toast (UI-SPEC Copywriting, zero-one-many). */
export function retriedToast(retried: number, skipped: number): string {
  const head = `Retrying ${retried} failed ${retried === 1 ? 'spine' : 'spines'}.`;
  return skipped > 0
    ? `${head} ${skipped} wait until Discogs is connected.`
    : head;
}

export function RetryAllFailedButton({
  photoId,
}: {
  /** The photo filter in view (`?photo=`), or null for All photos. */
  photoId: string | null;
}) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nothing, setNothing] = useState(false);

  async function retryAll() {
    setPending(true);
    setError(null);
    setNothing(false);
    try {
      const res = await fetch('/api/spines/retry-failed', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(photoId ? { photoId } : {}),
      });
      if (!res.ok) {
        setError(await failureReason(res));
        return;
      }
      const body = (await res.json()) as { retried: number; skipped: number };
      if (body.retried > 0) {
        toast(retriedToast(body.retried, body.skipped));
      } else if (body.skipped > 0) {
        setNothing(true);
      }
      await queryClient.invalidateQueries({ queryKey: ['spines'] });
      window.dispatchEvent(new Event(STATUS_REFRESH_EVENT));
    } catch {
      setError(UNREACHABLE_REASON);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
      {error ? (
        <p role="alert" className="text-xs break-words text-destructive">
          {`Couldn't retry: ${error}.`}
        </p>
      ) : nothing ? (
        <p className="text-xs text-muted-foreground">{NOTHING_RETRIED}</p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => void retryAll()}
      >
        {pending ? <Spinner /> : <RotateCw aria-hidden="true" />}
        {pending ? 'Retrying…' : 'Retry all failed'}
      </Button>
    </div>
  );
}
