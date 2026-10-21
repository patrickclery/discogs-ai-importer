'use client';

import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// The callback URL for the port the app runs on (D-03; UI-SPEC Settings card
// item 4). Built on the server from the request's Host, which the proxy
// limits to loopback names (T-03-39). It is shown as text and copied as
// plain text. If Discogs ignores the per-request callback (RESEARCH A1), the
// owner pastes this into the Discogs app's Callback URL field.

const VALUE_ID = 'discogs-callback-url';

export function CallbackUrlField({ url }: { url: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Callback URL copied');
    } catch {
      toast.error("Couldn't copy. Select the address and copy it yourself.");
    }
  }

  return (
    <Field>
      <FieldLabel htmlFor={VALUE_ID}>Callback URL</FieldLabel>
      <div className="flex min-w-0 items-start gap-2">
        <output
          id={VALUE_ID}
          className="min-w-0 flex-1 rounded-md bg-muted px-3 py-2 font-mono text-xs break-all"
        >
          {url}
        </output>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Copy callback URL"
              onClick={copy}
            >
              <Copy aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy</TooltipContent>
        </Tooltip>
      </div>
      <FieldDescription>
        {
          "If Discogs doesn't bring you back here after you approve, paste this address into the Callback URL field of your Discogs app, then connect again."
        }
      </FieldDescription>
    </Field>
  );
}
