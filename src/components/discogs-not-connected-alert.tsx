import { Unplug } from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

// The /spines not-connected notice (D-04, UI-SPEC "/spines: not-connected
// notice"): between the filter bar and the first photo section while
// Discogs isn't connected and a spine is listed. Not dismissible; it goes
// away once connected. The button is outline so the cards stay the focus.

export const NOT_CONNECTED_TITLE = "Discogs isn't connected";
export const NOT_CONNECTED_BODY =
  'Connect your Discogs account in Settings and each CD here is looked up on Discogs automatically.';

export function DiscogsNotConnectedAlert() {
  return (
    <Alert>
      <Unplug aria-hidden="true" />
      <AlertTitle>{NOT_CONNECTED_TITLE}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>{NOT_CONNECTED_BODY}</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/settings">Open Settings</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
