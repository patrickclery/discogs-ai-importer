'use client';

import { Unplug } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type MouseEvent, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CONNECT_BUTTON_ID } from '@/components/connect-discogs-button';
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
import { failureReason, UNREACHABLE_REASON } from '@/lib/failure-reason';

// Disconnect Discogs (D-02; UI-SPEC Disconnect confirm, E11). Discogs has no
// revoke endpoint, so this forgets the sign-in on this computer only. After
// it, the card re-renders as not connected and focus moves to Connect
// Discogs.

const FOCUS_WAIT_MS = 3000;

/** Focuses Connect Discogs once the refreshed card has rendered it. */
function focusConnectWhenReady(): void {
  const until = performance.now() + FOCUS_WAIT_MS;
  const tick = () => {
    const el = document.getElementById(CONNECT_BUTTON_ID);
    if (el) {
      el.focus();
      return;
    }
    if (performance.now() < until) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function DisconnectDiscogsButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  async function confirm(e: MouseEvent<HTMLButtonElement>) {
    // Keep the dialog open until the request settles.
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/discogs/disconnect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) {
        setError(await failureReason(res));
        return;
      }
      done.current = true;
      setOpen(false);
      toast.success('Discogs disconnected');
      router.refresh();
      focusConnectWhenReady();
    } catch {
      setError(UNREACHABLE_REASON);
    } finally {
      setPending(false);
    }
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
          <Unplug aria-hidden="true" />
          Disconnect Discogs
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent
        onCloseAutoFocus={(e) => {
          // After a disconnect this trigger goes away: focus moves to Connect.
          if (done.current) e.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect Discogs?</AlertDialogTitle>
          <AlertDialogDescription>
            {
              "The app forgets your Discogs sign-in on this computer. Matches already found stay, and new lookups wait until you connect again. To remove the app's access on Discogs as well, go to "
            }
            <a
              href="https://www.discogs.com/settings/applications"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-4"
            >
              discogs.com/settings/applications
            </a>
            .
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-sm break-words text-destructive">
            {`Couldn't disconnect: ${error}.`}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost" disabled={pending}>
            Stay connected
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={confirm}
          >
            {pending ? (
              <>
                <Spinner />
                Disconnecting…
              </>
            ) : (
              'Disconnect Discogs'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
