'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useState } from 'react';
import { toast } from 'sonner';
import { TEST_BUTTON_ID } from '@/components/test-discogs-button';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { failureReason, UNREACHABLE_REASON } from '@/lib/failure-reason';

// Paste-code fallback (RESEARCH A1, D-01; UI-SPEC Settings card item 5).
// When discogs.com shows a code instead of coming back here, the owner
// pastes it and the server finishes the same exchange as the callback. The
// card renders this only while a connect started in the last 15 minutes is
// unfinished. The code goes to the server once and is never shown back.

const EMPTY = 'Paste the code Discogs showed you.';
const EXPIRED = 'That code has expired. Click Connect Discogs to start again.';
const REJECTED =
  "Discogs didn't accept that code. Copy it again, or click Connect Discogs to start again.";

const FOCUS_WAIT_MS = 3000;

/** Focuses Test connection once the refreshed card has rendered it. */
function focusTestWhenReady(): void {
  const until = performance.now() + FOCUS_WAIT_MS;
  const tick = () => {
    const el = document.getElementById(TEST_BUTTON_ID);
    if (el) {
      el.focus();
      return;
    }
    if (performance.now() < until) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function otherMessage(reason: string): string {
  const clean = reason.slice(0, 160).replace(/[.\s]+$/, '');
  return `Couldn't start connecting: ${clean}. Try again.`;
}

async function errorFor(res: Response): Promise<string> {
  let code: unknown = null;
  try {
    code = ((await res.clone().json()) as { error?: unknown }).error;
  } catch {
    // Not JSON: use the status below.
  }
  if (code === 'empty') return EMPTY;
  if (code === 'expired') return EXPIRED;
  if (code === 'rejected') return REJECTED;
  return otherMessage(await failureReason(res));
}

export function PasteCodeForm() {
  const router = useRouter();
  const inputId = useId();
  const errorId = useId();
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const trimmed = code.trim();
    if (!trimmed) {
      setError(EMPTY);
      return;
    }
    setPending(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch('/api/discogs/finish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      });
    } catch {
      setError(otherMessage(UNREACHABLE_REASON));
      setPending(false);
      return;
    }
    if (!res.ok) {
      setError(await errorFor(res));
      setPending(false);
      return;
    }
    let username: unknown = null;
    try {
      username = ((await res.json()) as { username?: unknown }).username;
    } catch {
      // Handled below.
    }
    setPending(false);
    if (typeof username !== 'string' || !username) {
      setError(otherMessage('the app sent no result'));
      return;
    }
    setCode('');
    toast.success(
      `Connected to Discogs as ${username}. Looking up your spines now.`,
    );
    router.refresh();
    focusTestWhenReady();
  }

  return (
    <form onSubmit={submit} noValidate>
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={inputId}>Code from Discogs</FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id={inputId}
            name="code"
            autoComplete="off"
            spellCheck={false}
            placeholder="Code"
            maxLength={200}
            value={code}
            disabled={pending}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => setCode(e.target.value)}
            className="min-w-0 flex-1 font-mono"
          />
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? <Spinner /> : null}
            {pending ? 'Connecting…' : 'Finish connecting'}
          </Button>
        </div>
        {error ? <FieldError id={errorId}>{error}</FieldError> : null}
        <FieldDescription>
          {
            'If discogs.com showed you a code instead of bringing you back here, paste it within 15 minutes.'
          }
        </FieldDescription>
      </Field>
    </form>
  );
}
