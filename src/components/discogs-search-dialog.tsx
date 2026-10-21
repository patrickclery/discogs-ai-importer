'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, ImageOff, Search } from 'lucide-react';
import { type FormEvent, type ReactNode, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CandidateRowContent } from '@/components/candidate-row';
import { STATUS_REFRESH_EVENT } from '@/components/status-indicator';
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
import { Field, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useSecondsUntil } from '@/components/use-seconds-until';
import {
  pausedLine,
  QUEUED_LINE,
  SEARCHING_LINE,
} from '@/lib/candidate-format';
import { MASTER_REFUSAL, parseDiscogsRef } from '@/lib/discogs-ref';
import {
  type CandidateDto,
  DIALOG_INPUT_MAX,
  DIALOG_RESULTS_MAX,
  type DialogSearchDto,
  type DialogSearchState,
  type SearchResultDto,
} from '@/lib/discogs-types';
import { failureReason, UNREACHABLE_REASON } from '@/lib/failure-reason';
import type { SpineDto } from '@/lib/scan-types';
import { spineNumber } from '@/lib/spine-review';
import { cn } from '@/lib/utils';

// The Search Discogs dialog (UI-SPEC Search Discogs dialog, D-15, DISC-06).
// The owner types a search or pastes a Discogs release link or number;
// parseDiscogsRef runs on submit (a master is refused with no request) and
// the server re-parses. The search runs on the paced lane, and the dialog
// polls GET /api/discogs/searches/{id} every 1.5 s until it ends. A fetched
// release is shown unselected under the check-it line (Pitfall 5): nothing
// is added until the owner picks a row and clicks Add to candidates, which
// sends only { searchId, releaseId } (T-03-31). Its query key has its own
// prefix: the field editor rewrites every ['spines', …] query.
// Results areas follow the UI-SPEC dialog state table; a visually hidden
// polite status announces the result count when a search ends.

export const SEARCH_DISCOGS_TOOLTIP = 'Connect Discogs in Settings first';
export const DIALOG_DESCRIPTION =
  'Type an artist, title or catalog number, or paste a Discogs release link or number.';
export const BEFORE_SEARCH_LINE = 'Results from Discogs appear here.';
export const RELEASE_CHECK_LINE =
  'Check that this is the CD you meant. Discogs numbers releases and masters separately, so a number can point to a different record.';
export const MORE_RESULTS_LINE =
  'Showing the first 25 results. Add a word or the catalog number to narrow it down.';

/** UI-SPEC "Dialog not found": a pasted number unknown to Discogs. */
export function notFoundLine(releaseId: number | null): string {
  return `Discogs has no release ${releaseId ?? ''}. Check the number, or paste the full link from the release page.`;
}

/** UI-SPEC "Dialog search failed"; searching again is the retry. */
export function searchFailedLine(failure: string | null): string {
  const reason =
    failure?.trim().replace(/[.\s]+$/u, '') || 'something went wrong';
  return `Search failed: ${reason}. Search again to retry.`;
}

/** UI-SPEC "Dialog no results", quoting the searched text. */
export function noResultsLine(query: string | null): string {
  return `Nothing on Discogs matches “${query ?? ''}”. Try fewer words, or just the catalog number.`;
}

/** '1 result', '{n} results'. */
export function resultsCount(n: number): string {
  return `${n} ${n === 1 ? 'result' : 'results'}`;
}

/** What the polite status announces once a search ends ('' before). */
export function searchAnnouncement(data: DialogSearchDto | undefined): string {
  if (!data) return '';
  if (data.state === 'done') return resultsCount(data.results.length);
  if (data.state === 'no_match') return noResultsLine(data.query);
  return '';
}

const POLL_MS = 1500;
const TERMINAL: ReadonlySet<DialogSearchState> = new Set([
  'done',
  'no_match',
  'not_found',
  'failed',
]);

class FetchError extends Error {}

async function fetchSearch(searchId: string): Promise<DialogSearchDto> {
  let res: Response;
  try {
    res = await fetch(`/api/discogs/searches/${encodeURIComponent(searchId)}`, {
      cache: 'no-store',
    });
  } catch {
    throw new FetchError(UNREACHABLE_REASON);
  }
  if (!res.ok) throw new FetchError(await failureReason(res));
  return (await res.json()) as DialogSearchDto;
}

function fieldValue(spine: SpineDto, field: string): string {
  return spine.fields.find((f) => f.field === field)?.value?.trim() ?? '';
}

/** Artist and title joined by a space, else the catalog number, else ''. */
export function searchPrefill(spine: SpineDto): string {
  const joined = [fieldValue(spine, 'artist'), fieldValue(spine, 'title')]
    .filter(Boolean)
    .join(' ');
  return joined || fieldValue(spine, 'catalog_number');
}

/** A search result in the shape CandidateRowContent renders. */
function asCandidate(r: SearchResultDto, searchId: string): CandidateDto {
  return {
    id: `${searchId}:${r.releaseId}`,
    releaseId: r.releaseId,
    title: r.title,
    year: r.year,
    country: r.country,
    labels: r.labels,
    catno: r.catno,
    formats: r.formats,
    hasThumb: r.hasThumb,
    source: 'auto',
    catnoMatch: false,
    stage: null,
  };
}

function SpineReference({ spine }: { spine: SpineDto }) {
  const number = spineNumber(spine);
  return (
    <div className="flex min-h-12 items-center justify-center rounded-md bg-muted p-1">
      {spine.crop ? (
        // biome-ignore lint/performance/noImgElement: crops stream from a route handler; next/image would re-encode them
        <img
          src={spine.crop.url}
          width={spine.crop.width}
          height={spine.crop.height}
          alt={`Spine ${number}`}
          decoding="async"
          className="h-auto max-h-12 w-auto max-w-full object-contain"
        />
      ) : (
        <ImageOff
          aria-label={`Spine ${number}`}
          className="size-4 text-muted-foreground"
        />
      )}
    </div>
  );
}

function Results({
  searchId,
  query,
  selected,
  onSelect,
  disabled,
}: {
  searchId: string | null;
  query: { data?: DialogSearchDto; error: Error | null; isError: boolean };
  selected: number | null;
  onSelect: (releaseId: number) => void;
  disabled: boolean;
}) {
  const data = query.data;
  const pausedSeconds = useSecondsUntil(
    data?.pausedUntil ?? null,
    data?.state === 'queued',
  );
  if (!searchId) {
    return (
      <p className="py-8 text-center text-xs text-muted-foreground">
        {BEFORE_SEARCH_LINE}
      </p>
    );
  }
  if (!data) {
    if (query.isError) {
      const reason =
        query.error instanceof FetchError
          ? query.error.message
          : UNREACHABLE_REASON;
      return (
        <p role="alert" className="text-xs text-destructive">
          {`Couldn't load the search: ${reason}.`}
        </p>
      );
    }
    return <Line icon={<Clock aria-hidden="true" />}>{QUEUED_LINE}</Line>;
  }
  switch (data.state) {
    case 'queued':
      return (
        <Line icon={<Clock aria-hidden="true" />}>
          {pausedSeconds > 0 ? pausedLine(pausedSeconds) : QUEUED_LINE}
        </Line>
      );
    case 'searching':
      return (
        <Line icon={<Spinner aria-hidden="true" role="presentation" />}>
          {SEARCHING_LINE}
        </Line>
      );
    case 'done':
      break;
    case 'no_match':
      return <Line>{noResultsLine(data.query)}</Line>;
    case 'not_found':
      return (
        <p className="text-xs break-words text-destructive">
          {notFoundLine(data.releaseId)}
        </p>
      );
    case 'failed':
      return (
        <p className="text-xs break-words text-destructive">
          {searchFailedLine(data.failure)}
        </p>
      );
  }
  return (
    <div className="flex flex-col gap-2">
      {data.kind === 'release' ? (
        <p className="text-xs text-muted-foreground">{RELEASE_CHECK_LINE}</p>
      ) : null}
      <RadioGroup
        value={selected === null ? '' : String(selected)}
        onValueChange={(v) => onSelect(Number(v))}
        disabled={disabled}
        aria-label="Discogs results"
        className="gap-2 p-0.5"
      >
        {data.results.map((r) => {
          const id = `discogs-result-${searchId}-${r.releaseId}`;
          return (
            <label
              key={r.releaseId}
              htmlFor={id}
              className={cn(
                'flex min-w-0 cursor-pointer items-start gap-4 rounded-lg border p-2',
                selected === r.releaseId &&
                  'border-primary ring-2 ring-primary',
              )}
            >
              <RadioGroupItem
                id={id}
                value={String(r.releaseId)}
                className="mt-1"
              />
              <CandidateRowContent
                candidate={asCandidate(r, searchId)}
                thumbSrc={`/api/discogs/searches/${encodeURIComponent(searchId)}/thumb/${r.releaseId}`}
                alreadyListed={r.alreadyListed}
              />
            </label>
          );
        })}
      </RadioGroup>
      {data.totalCount > DIALOG_RESULTS_MAX ? (
        <p className="text-xs text-muted-foreground">{MORE_RESULTS_LINE}</p>
      ) : null}
    </div>
  );
}

function Line({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-start gap-1 text-xs text-muted-foreground [&_svg]:mt-px [&_svg]:size-4 [&_svg]:shrink-0">
      {icon}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export function DiscogsSearchDialog({
  spine,
  connected,
}: {
  spine: SpineDto;
  /** SpinesResponse.discogs.connected: disabled with a tooltip when false. */
  connected: boolean;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const number = spineNumber(spine);

  const query = useQuery({
    queryKey: ['discogs-search', searchId],
    queryFn: () => fetchSearch(searchId as string),
    enabled: open && searchId !== null,
    refetchInterval: (q) =>
      q.state.data && TERMINAL.has(q.state.data.state) ? false : POLL_MS,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const results = query.data?.state === 'done' ? query.data.results : [];
  const pick = results.find((r) => r.releaseId === selected) ?? null;

  if (!connected) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so keyboard users reach the disabled reason
            tabIndex={0}
            className="inline-flex rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Button type="button" variant="outline" size="sm" disabled>
              <Search aria-hidden="true" />
              Search Discogs…
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{SEARCH_DISCOGS_TOOLTIP}</TooltipContent>
      </Tooltip>
    );
  }

  function onOpenChange(next: boolean) {
    if (adding) return;
    if (next) {
      // Reopening starts fresh; a search left queued keeps running (D-15).
      setValue(searchPrefill(spine));
      setFieldError(null);
      setSearchId(null);
      setStartError(null);
      setSelected(null);
      setAddError(null);
    }
    setOpen(next);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || starting) return;
    const ref = parseDiscogsRef(trimmed);
    if (ref.kind === 'master') {
      setFieldError(MASTER_REFUSAL);
      return;
    }
    setFieldError(null);
    setStartError(null);
    setAddError(null);
    setStarting(true);
    try {
      const res = await fetch(
        `/api/spines/${encodeURIComponent(spine.id)}/search`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            mode: ref.kind === 'release' ? 'ref' : 'text',
            value: trimmed,
          }),
        },
      );
      if (!res.ok) {
        const body = (await res
          .clone()
          .json()
          .catch(() => null)) as { error?: unknown } | null;
        if (body?.error === 'master') {
          setFieldError(MASTER_REFUSAL);
          return;
        }
        setStartError(await failureReason(res));
        return;
      }
      const { searchId: id } = (await res.json()) as { searchId: string };
      setSelected(null);
      setSearchId(id);
      window.dispatchEvent(new Event(STATUS_REFRESH_EVENT));
    } catch {
      setStartError(UNREACHABLE_REASON);
    } finally {
      setStarting(false);
    }
  }

  async function add() {
    if (!searchId || !pick) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch(
        `/api/spines/${encodeURIComponent(spine.id)}/candidates`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ searchId, releaseId: pick.releaseId }),
        },
      );
      if (!res.ok) {
        setAddError(await failureReason(res));
        return;
      }
      setOpen(false);
      toast(`Added ${pick.title} to spine #${number}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['spines'] }),
        queryClient.invalidateQueries({
          queryKey: ['discogs-candidates', spine.id],
        }),
      ]);
      window.dispatchEvent(new Event(STATUS_REFRESH_EVENT));
    } catch {
      setAddError(UNREACHABLE_REASON);
    } finally {
      setAdding(false);
    }
  }

  const inputId = `discogs-search-${spine.id}`;
  const errorId = `${inputId}-error`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Search aria-hidden="true" />
          Search Discogs…
        </Button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-2xl"
        showCloseButton={!adding}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
          inputRef.current?.select();
        }}
      >
        <DialogHeader>
          <DialogTitle>{`Search Discogs for spine #${number}`}</DialogTitle>
          <DialogDescription>{DIALOG_DESCRIPTION}</DialogDescription>
        </DialogHeader>
        <SpineReference spine={spine} />
        <form
          onSubmit={(e) => void submit(e)}
          className="flex items-start gap-2"
        >
          <Field className="flex-1 gap-1">
            <Label htmlFor={inputId} className="sr-only">
              Search Discogs
            </Label>
            <Input
              ref={inputRef}
              id={inputId}
              value={value}
              maxLength={DIALOG_INPUT_MAX}
              autoComplete="off"
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? errorId : undefined}
              onChange={(e) => {
                setValue(e.target.value);
                if (fieldError) setFieldError(null);
              }}
            />
            {fieldError ? (
              <FieldError id={errorId} className="text-xs">
                {fieldError}
              </FieldError>
            ) : null}
          </Field>
          <Button
            type="submit"
            variant="outline"
            disabled={!value.trim() || starting || adding}
          >
            {starting ? (
              <Spinner aria-hidden="true" role="presentation" />
            ) : (
              <Search aria-hidden="true" />
            )}
            Search
          </Button>
        </form>
        {startError ? (
          <p role="alert" className="text-xs break-words text-destructive">
            {`Couldn't start the search: ${startError}.`}
          </p>
        ) : null}
        <p role="status" aria-live="polite" className="sr-only">
          {searchId ? searchAnnouncement(query.data) : ''}
        </p>
        <div className="max-h-[50vh] min-h-40 overflow-y-auto">
          <Results
            searchId={searchId}
            query={query}
            selected={selected}
            onSelect={setSelected}
            disabled={adding}
          />
        </div>
        {addError ? (
          <p role="alert" className="text-sm break-words text-destructive">
            {`Couldn't add it: ${addError}.`}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={adding}
            onClick={() => onOpenChange(false)}
          >
            Close search
          </Button>
          <Button
            type="button"
            disabled={adding || !pick}
            onClick={() => void add()}
          >
            {adding ? (
              <>
                <Spinner />
                Adding…
              </>
            ) : (
              'Add to candidates'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
