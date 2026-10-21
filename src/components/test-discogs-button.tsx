'use client';

import { CircleCheck, CircleX, PlugZap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { TestDiscogsResult } from '@/app/api/discogs/test/route';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { failureReason } from '@/lib/failure-reason';

// "Test connection" (D-01, fulfils Phase 1 D-10; UI E3). The same structure
// as Test Claude: an outline button and an inline result that stays until
// the next test.

/** Plan 03-04's paste-code form moves focus here after connecting. */
export const TEST_BUTTON_ID = 'test-discogs-connection';

const UNREACHABLE =
  "Couldn't reach Discogs. Check your internet connection and try again.";

type Shown = { ok: boolean; message: string };

function otherMessage(reason: string): string {
  const clean = reason.slice(0, 160).replace(/[.\s]+$/, '');
  return `Test failed: ${clean}. Try again in a moment.`;
}

function message(r: TestDiscogsResult): string {
  if (r.ok) return `Connection works. Signed in to Discogs as ${r.username}.`;
  switch (r.kind) {
    case 'rejected':
      return 'Discogs rejected the connection. Reconnect your account.';
    case 'unreachable':
      return UNREACHABLE;
    case 'busy':
      return "Discogs is busy with the app's lookups. Try again in a minute.";
    default:
      return otherMessage(r.reason);
  }
}

export function TestDiscogsButton() {
  const router = useRouter();
  const [result, setResult] = useState<Shown | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setResult(null);
    startTransition(async () => {
      let res: Response;
      try {
        res = await fetch('/api/discogs/test', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
      } catch {
        setResult({ ok: false, message: UNREACHABLE });
        return;
      }
      if (!res.ok) {
        setResult({
          ok: false,
          message: otherMessage(await failureReason(res)),
        });
        return;
      }
      let body: TestDiscogsResult;
      try {
        body = (await res.json()) as TestDiscogsResult;
      } catch {
        setResult({
          ok: false,
          message: otherMessage('the app sent no result'),
        });
        return;
      }
      setResult({ ok: body.ok, message: message(body) });
      // Rejected turns on Reconnect needed; a success may turn it off.
      if (body.ok || body.kind === 'rejected') router.refresh();
    });
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <Button
        id={TEST_BUTTON_ID}
        type="button"
        variant="outline"
        disabled={pending}
        onClick={run}
      >
        {pending ? <Spinner /> : <PlugZap aria-hidden="true" />}
        {pending ? 'Testing…' : 'Test connection'}
      </Button>
      <div
        role="status"
        aria-live="polite"
        className="flex min-w-0 items-start gap-2 text-sm"
      >
        {result ? (
          <>
            {result.ok ? (
              <CircleCheck
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-success"
              />
            ) : (
              <CircleX
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-destructive"
              />
            )}
            <span className="min-w-0 break-words">{result.message}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
