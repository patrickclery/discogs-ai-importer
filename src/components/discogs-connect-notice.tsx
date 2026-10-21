'use client';

import { CircleX, Clock, Info } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// The result of coming back from discogs.com (D-01; UI-SPEC Settings card
// item 1). The callback always lands on /settings?discogs= with one of four
// values. connected shows a toast once and drops the parameter; denied,
// expired and error show an Alert until the next Connect click (which leaves
// for discogs.com) or a reload without the parameter. Any other value shows
// nothing. Render inside a Suspense boundary (useSearchParams).

export function DiscogsConnectNotice({
  username,
}: {
  username: string | null;
}) {
  const router = useRouter();
  const outcome = useSearchParams().get('discogs');
  const toasted = useRef(false);

  useEffect(() => {
    if (outcome !== 'connected' || toasted.current) return;
    toasted.current = true;
    if (username) {
      toast.success(
        `Connected to Discogs as ${username}. Looking up your spines now.`,
      );
    }
    router.replace('/settings');
  }, [outcome, username, router]);

  if (outcome === 'denied') {
    return (
      <Alert>
        <Info aria-hidden="true" />
        <AlertTitle>{"Discogs wasn't connected"}</AlertTitle>
        <AlertDescription>
          {
            "You didn't approve the app on discogs.com. Click Connect Discogs to try again."
          }
        </AlertDescription>
      </Alert>
    );
  }
  if (outcome === 'expired') {
    return (
      <Alert>
        <Clock aria-hidden="true" />
        <AlertTitle>The connection timed out</AlertTitle>
        <AlertDescription>
          {
            'Approval on discogs.com has to finish within 15 minutes. Click Connect Discogs to start again.'
          }
        </AlertDescription>
      </Alert>
    );
  }
  if (outcome === 'error') {
    return (
      <Alert variant="destructive">
        <CircleX aria-hidden="true" />
        <AlertTitle>{"Couldn't connect to Discogs"}</AlertTitle>
        <AlertDescription>
          {
            'Something went wrong while finishing the connection. Click Connect Discogs to try again, and if it keeps failing, check the terminal running the app.'
          }
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}
