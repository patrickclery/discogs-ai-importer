'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { CandidateRow } from '@/components/candidate-row';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import {
  type CandidateDto,
  type CandidatesResponse,
  INLINE_CANDIDATES,
} from '@/lib/discogs-types';
import { failureReason, UNREACHABLE_REASON } from '@/lib/failure-reason';

// A spine's candidates in D-10 order (the server already ordered and
// deduped them): the first INLINE_CANDIDATES rows inline, and "Show all {n}"
// for the rest (D-12, UI-SPEC CandidateList). The full list has its own
// query key prefix, never ['spines', …] (RESEARCH Pitfall 4): the field
// editor rewrites every ['spines', …] query as a SpinesResponse.

export const SHOW_ALL_ERROR = "Couldn't load the other matches.";

class FetchError extends Error {}

async function fetchAllCandidates(spineId: string): Promise<CandidateDto[]> {
  let res: Response;
  try {
    res = await fetch(`/api/spines/${encodeURIComponent(spineId)}/candidates`, {
      cache: 'no-store',
    });
  } catch {
    throw new FetchError(UNREACHABLE_REASON);
  }
  if (!res.ok) throw new FetchError(await failureReason(res));
  return ((await res.json()) as CandidatesResponse).candidates;
}

/** The rows beyond the inline ones, loaded when Show all opens. */
function RestOfList({ spineId }: { spineId: string }) {
  const query = useQuery({
    queryKey: ['discogs-candidates', spineId],
    queryFn: () => fetchAllCandidates(spineId),
  });
  if (query.isPending) {
    return (
      <div className="flex flex-col gap-2 py-2" aria-hidden="true">
        <Skeleton className="h-16 w-full rounded-md" />
        <Skeleton className="h-16 w-full rounded-md" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <p role="alert" className="py-2 text-xs text-destructive">
        {SHOW_ALL_ERROR}{' '}
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="rounded-sm underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Try again
        </button>
      </p>
    );
  }
  const rest = query.data.slice(INLINE_CANDIDATES);
  if (rest.length === 0) return null;
  return (
    <ul className="flex flex-col divide-y border-t">
      {rest.map((c) => (
        <CandidateRow key={c.id} candidate={c} />
      ))}
    </ul>
  );
}

export function CandidateList({
  spineId,
  candidates,
  total,
}: {
  spineId: string;
  /** The inline candidates (SpineDiscogsDto.topCandidates). */
  candidates: readonly CandidateDto[];
  /** Every stored candidate, deduped (SpineDiscogsDto.candidateCount). */
  total: number;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  if (candidates.length === 0) return null;
  const inline = (
    <ul className="flex flex-col divide-y">
      {candidates.slice(0, INLINE_CANDIDATES).map((c) => (
        <CandidateRow key={c.id} candidate={c} />
      ))}
    </ul>
  );
  if (total <= INLINE_CANDIDATES) return inline;
  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Collapsing returns focus to the trigger (D-12).
        if (!next) triggerRef.current?.focus();
      }}
      className="flex flex-col"
    >
      {inline}
      <CollapsibleContent>
        {open ? <RestOfList spineId={spineId} /> : null}
      </CollapsibleContent>
      <CollapsibleTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="ghost"
          size="sm"
          className="self-start text-xs"
        >
          {open ? (
            <>
              Show fewer
              <ChevronUp aria-hidden="true" />
            </>
          ) : (
            <>
              {`Show all ${total}`}
              <ChevronDown aria-hidden="true" />
            </>
          )}
        </Button>
      </CollapsibleTrigger>
    </Collapsible>
  );
}
