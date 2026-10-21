'use client';

import { LogIn } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { failureReason } from '@/lib/failure-reason';

// "Connect Discogs" (D-01, UI-SPEC Settings "Discogs" card). Asks the server
// for the discogs.com authorize URL and sends the browser there. No toast:
// every failure is one inline line under the row (UI E2).

const BAD_KEYS =
  "Discogs didn't accept the consumer key and secret. Check them on discogs.com/settings/developers and save them again.";
const UNREACHABLE =
  "Couldn't reach Discogs. Check your internet connection and try again.";

/** The account section's Connect button; Disconnect moves focus here. */
export const CONNECT_BUTTON_ID = 'connect-discogs';

async function connectError(res: Response): Promise<string> {
  let code: unknown = null;
  try {
    code = ((await res.clone().json()) as { error?: unknown }).error;
  } catch {
    // Not JSON: use the status below.
  }
  if (code === 'bad_credentials') return BAD_KEYS;
  if (code === 'unreachable') return UNREACHABLE;
  // Bare codes read as words, not identifiers, in the "Other" template.
  const reason =
    code === 'busy'
      ? "Discogs is busy with the app's lookups"
      : code === 'credentials_missing'
        ? "the consumer key and secret aren't saved"
        : (await failureReason(res)).slice(0, 160);
  return `Couldn't start connecting: ${reason}. Try again.`;
}

export function ConnectDiscogsButton({
  credentialsSaved,
  label = 'Connect Discogs',
  id,
}: {
  credentialsSaved: boolean;
  label?: string;
  id?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setPending(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch('/api/discogs/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
    } catch {
      setError(UNREACHABLE);
      setPending(false);
      return;
    }
    if (!res.ok) {
      setError(await connectError(res));
      setPending(false);
      return;
    }
    let authorizeUrl: unknown = null;
    try {
      authorizeUrl = ((await res.json()) as { authorizeUrl?: unknown })
        .authorizeUrl;
    } catch {
      // Handled below.
    }
    if (typeof authorizeUrl !== 'string' || !authorizeUrl) {
      setError(
        "Couldn't start connecting: the server sent no Discogs address. Try again.",
      );
      setPending(false);
      return;
    }
    // Stays pending (and disabled) until the browser leaves for discogs.com.
    window.location.assign(authorizeUrl);
  }

  const button = (
    <Button
      id={id}
      type="button"
      variant={credentialsSaved ? 'default' : 'outline'}
      disabled={!credentialsSaved || pending}
      onClick={connect}
    >
      {pending ? <Spinner /> : <LogIn aria-hidden="true" />}
      {pending ? 'Opening Discogs…' : label}
    </Button>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {credentialsSaved ? (
          button
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a disabled button cannot take focus, so the wrapper carries the tooltip for keyboard users */}
              <span tabIndex={0} className="inline-flex">
                {button}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Save the consumer key and secret first
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-sm break-words text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
