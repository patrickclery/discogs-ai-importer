'use client';

import { CircleCheck, CircleX, PlugZap } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { testClaudeAction } from '@/app/settings/actions';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { TestResult } from '@/server/claude/cli';

/** "Test Claude" with its inline result (D-10, UI-SPEC Test key, D-18). */
export function TestClaudeButton({ ready }: { ready: boolean }) {
  const [result, setResult] = useState<TestResult | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const clear = () => setResult(null);
    window.addEventListener('app:vision-model-changed', clear);
    return () => window.removeEventListener('app:vision-model-changed', clear);
  }, []);

  function run() {
    setResult(null);
    startTransition(async () => {
      try {
        setResult(await testClaudeAction());
      } catch (err) {
        const reason = (err instanceof Error ? err.message : 'network error')
          .slice(0, 160)
          .replace(/[.\s]+$/, '');
        setResult({
          ok: false,
          kind: 'failed',
          message: `Test failed: ${reason}. Try again in a moment.`,
        });
      }
    });
  }

  const button = (
    <Button
      type="button"
      variant="outline"
      disabled={!ready || pending}
      onClick={run}
    >
      {pending ? <Spinner /> : <PlugZap aria-hidden="true" />}
      {pending ? 'Testing…' : 'Test Claude'}
    </Button>
  );

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        {ready ? (
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
              Install the Claude CLI and log in with your Claude subscription
              first
            </TooltipContent>
          </Tooltip>
        )}
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
    </div>
  );
}
