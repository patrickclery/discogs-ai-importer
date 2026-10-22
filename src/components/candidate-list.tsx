'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import { AddToCollectionButton } from '@/components/add-to-collection-button';
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

type RowAction = (candidate: CandidateDto) => ReactNode;

/** The rows beyond the inline ones, loaded when Show all opens. */
function RestOfList({
  spineId,
  action,
}: {
  spineId: string;
  action: RowAction;
}) {
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
        <CandidateRow key={c.id} candidate={c} actions={action(c)} />
      ))}
    </ul>
  );
}

/**
 * The card's inline Add error (UI-SPEC: under the candidate list,
 * role alert, persistent until the next Add).
 */
function AddError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="pt-2 text-xs break-words text-destructive">
      {message}
    </p>
  );
}

export function CandidateList({
  spineId,
  spineNumber,
  candidates,
  total,
}: {
  spineId: string;
  /** spineNumber(spine), for the owner-action event after Add. */
  spineNumber: number;
  /** The inline candidates (SpineDiscogsDto.topCandidates). */
  candidates: readonly CandidateDto[];
  /** Every stored candidate, deduped (SpineDiscogsDto.candidateCount). */
  total: number;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // One Add in flight per card disables every Add on it (Pitfall 8).
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (candidates.length === 0) return null;
  const action: RowAction = (c) => (
    <AddToCollectionButton
      spineId={spineId}
      spineNumber={spineNumber}
      candidateId={c.id}
      cardPendingId={pendingId}
      onPendingChange={setPendingId}
      onError={setError}
    />
  );
  const inline = (
    <ul className="flex flex-col divide-y">
      {candidates.slice(0, INLINE_CANDIDATES).map((c) => (
        <CandidateRow key={c.id} candidate={c} actions={action(c)} />
      ))}
    </ul>
  );
  if (total <= INLINE_CANDIDATES) {
    return (
      <div className="flex flex-col">
        {inline}
        <AddError message={error} />
      </div>
    );
  }
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
        {open ? <RestOfList spineId={spineId} action={action} /> : null}
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
      <AddError message={error} />
    </Collapsible>
  );
}
