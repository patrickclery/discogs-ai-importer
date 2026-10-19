'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

async function readReason(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === 'string' && body.error) {
      return body.error.slice(0, 160);
    }
  } catch {
    // fall through to the status code
  }
  return `HTTP ${res.status}`;
}

/** Dev-only "Queue test job" button (D-15). */
export function DevJobTrigger() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function queue() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/dev/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lane: 'anthropic', payload: { ms: 2000 } }),
      });
      if (!res.ok) {
        setError(await readReason(res));
        return;
      }
      toast.success('Test job queued');
      window.dispatchEvent(new Event('app:status-refresh'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'network error');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={queue}
      >
        {pending ? <Spinner /> : null}
        Queue test job
      </Button>
      {error ? (
        <p className="text-sm text-destructive">
          Couldn't queue the test job: {error}.
        </p>
      ) : null}
    </div>
  );
}
