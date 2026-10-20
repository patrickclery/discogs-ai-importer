'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageOff } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { failureReason, UNREACHABLE_REASON } from '@/lib/failure-reason';
import type { SpineDto } from '@/lib/scan-types';
import { spineNumber } from '@/lib/spine-review';
import { cn } from '@/lib/utils';

// Re-attach an orphaned spine (UI-SPEC Re-attach and dismiss, D-16): pick
// the spine from the latest scan that this one is, and its edits move there.
// The candidates query has its own key prefix: the field editor rewrites
// every ['spines', …] query as a SpinesResponse.

const NO_CANDIDATES =
  'Every spine in the latest scan is already matched. Dismiss this spine, or leave it for later.';

class FetchError extends Error {}

async function fetchCandidates(spineId: string): Promise<SpineDto[]> {
  let res: Response;
  try {
    res = await fetch(`/api/spines/${encodeURIComponent(spineId)}/reattach`, {
      cache: 'no-store',
    });
  } catch {
    throw new FetchError(UNREACHABLE_REASON);
  }
  if (!res.ok) throw new FetchError(await failureReason(res));
  return ((await res.json()) as { candidates: SpineDto[] }).candidates;
}

function rawTextOf(spine: SpineDto): string | null {
  return spine.fields.find((f) => f.field === 'raw_text')?.value ?? null;
}

function CandidateCrop({ spine }: { spine: SpineDto }) {
  if (!spine.crop) {
    return (
      <div className="flex h-12 w-24 shrink-0 items-center justify-center rounded-md bg-muted">
        <ImageOff aria-hidden="true" className="size-4 text-muted-foreground" />
      </div>
    );
  }
  return (
    // biome-ignore lint/performance/noImgElement: crops stream from a route handler; next/image would re-encode them
    <img
      src={spine.crop.url}
      width={spine.crop.width}
      height={spine.crop.height}
      alt={`Spine ${spineNumber(spine)}`}
      loading="lazy"
      decoding="async"
      className="h-auto max-h-12 w-auto max-w-[min(16rem,40%)] shrink-0 rounded-md bg-muted object-contain"
    />
  );
}

function CandidateList({
  query,
  selected,
  onSelect,
  disabled,
}: {
  query: { data?: SpineDto[]; isPending: boolean };
  selected: string | null;
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  if (query.isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    );
  }
  const candidates = query.data ?? [];
  if (candidates.length === 0) {
    return <p className="text-xs text-muted-foreground">{NO_CANDIDATES}</p>;
  }
  return (
    <RadioGroup
      value={selected ?? ''}
      onValueChange={onSelect}
      disabled={disabled}
      aria-label="Spines from the latest scan"
      className="max-h-[60vh] gap-2 overflow-y-auto p-0.5"
    >
      {candidates.map((c) => {
        const id = `reattach-${c.id}`;
        const text = rawTextOf(c);
        return (
          <label
            key={c.id}
            htmlFor={id}
            className={cn(
              'flex min-w-0 cursor-pointer items-center gap-4 rounded-lg border p-4',
              selected === c.id && 'border-primary ring-2 ring-primary',
            )}
          >
            <RadioGroupItem id={id} value={c.id} />
            <CandidateCrop spine={c} />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                #{spineNumber(c)}
              </span>
              <span className="line-clamp-1 text-xs break-all text-muted-foreground">
                {text ?? 'Not read'}
              </span>
            </span>
          </label>
        );
      })}
    </RadioGroup>
  );
}

export function ReattachDialog({ spine }: { spine: SpineDto }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['reattach-candidates', spine.id],
    queryFn: () => fetchCandidates(spine.id),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const number = spineNumber(spine);
  const candidates = query.data ?? [];
  const target = candidates.find((c) => c.id === selected) ?? null;
  const shownError =
    error ??
    (query.error instanceof FetchError ? query.error.message : null) ??
    (query.isError ? UNREACHABLE_REASON : null);

  function onOpenChange(next: boolean) {
    if (pending) return;
    if (next) {
      setSelected(null);
      setError(null);
    }
    setOpen(next);
  }

  async function confirm() {
    if (!target) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/spines/${encodeURIComponent(spine.id)}/reattach`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ targetSpineId: target.id }),
        },
      );
      if (!res.ok) {
        setError(await failureReason(res));
        return;
      }
      setOpen(false);
      toast(`Edits moved to spine #${spineNumber(target)}`);
      await queryClient.invalidateQueries({ queryKey: ['spines'] });
    } catch {
      setError(UNREACHABLE_REASON);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          Re-attach spine…
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{`Re-attach spine #${number}`}</DialogTitle>
          <DialogDescription>
            Pick the spine from the latest scan that this one is. Your edits
            move to it.
          </DialogDescription>
        </DialogHeader>
        <CandidateList
          query={query}
          selected={selected}
          onSelect={setSelected}
          disabled={pending}
        />
        {shownError ? (
          <p role="alert" className="text-sm break-words text-destructive">
            {`Couldn't re-attach: ${shownError}.`}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Leave unattached
          </Button>
          <Button
            type="button"
            disabled={pending || !target}
            onClick={() => void confirm()}
          >
            {pending ? (
              <>
                <Spinner />
                Re-attaching…
              </>
            ) : (
              'Re-attach spine'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
