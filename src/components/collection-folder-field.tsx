'use client';

import { useQueryClient } from '@tanstack/react-query';
import { cn } from 'cn';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import type {
  FoldersGetResult,
  FoldersRefreshResult,
} from '@/app/api/discogs/folders/route';
import { saveCollectionFolder } from '@/app/settings/actions';
import { STATUS_REFRESH_EVENT } from '@/components/status-indicator';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { failureReason, UNREACHABLE_REASON } from '@/lib/failure-reason';

// Settings "Collection folder" (D-03, IMP-02; UI-SPEC E12). The folder list
// comes from the settings-table cache (GET /api/discogs/folders); it is read
// again from Discogs inline (POST { refresh: true }) when there is no cache,
// when the cache is older than an hour, or on Reload folders. Saving on
// change goes through the saveCollectionFolder action, like ModelSelect.
// Folder names are third-party text: rendered as React text, never re-cased
// (T-04-23).

const SELECT_ID = 'collection-folder';
const ERROR_ID = 'collection-folder-error';
const MAX_CACHE_AGE_MS = 60 * 60_000;

type Folder = FoldersGetResult['folders'][number];

function fallbackName(id: number): string {
  return id === 1 ? 'Uncategorized' : `Folder ${id}`;
}

function clean(reason: string): string {
  return reason.slice(0, 160).replace(/[.\s]+$/, '');
}

/** The {reason} of "Couldn't load your folders: {reason}." */
function loadReason(r: Exclude<FoldersRefreshResult, { ok: true }>): string {
  switch (r.kind) {
    case 'rejected':
      return 'Discogs refused the connection';
    case 'unreachable':
      return "Discogs didn't answer";
    case 'busy':
      return 'Discogs asked the app to wait';
    default:
      return clean(r.reason);
  }
}

export function CollectionFolderField() {
  const queryClient = useQueryClient();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [current, setCurrent] = useState<number>(1);
  // null until the first GET answers; false means no list was ever read.
  const [hasCache, setHasCache] = useState<boolean | null>(null);
  const [savedMissing, setSavedMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();

  const apply = useCallback((s: FoldersGetResult) => {
    setFolders(s.folders);
    setCurrent(s.selectedId);
    setSavedMissing(s.savedMissing);
    setHasCache(s.fetchedAt !== null);
  }, []);

  const refresh = useCallback(() => {
    setLoadError(null);
    startLoad(async () => {
      let res: Response;
      try {
        res = await fetch('/api/discogs/folders', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refresh: true }),
        });
      } catch {
        setLoadError(UNREACHABLE_REASON);
        return;
      }
      if (!res.ok) {
        setLoadError(clean(await failureReason(res)));
        return;
      }
      let body: FoldersRefreshResult;
      try {
        body = (await res.json()) as FoldersRefreshResult;
      } catch {
        setLoadError('the app sent no result');
        return;
      }
      if (body.ok) apply({ ...body, connected: true });
      else setLoadError(loadReason(body));
    });
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    startLoad(async () => {
      let state: FoldersGetResult;
      try {
        const res = await fetch('/api/discogs/folders');
        if (!res.ok) {
          const reason = clean(await failureReason(res));
          if (!cancelled) {
            setHasCache(false);
            setLoadError(reason);
          }
          return;
        }
        state = (await res.json()) as FoldersGetResult;
      } catch {
        if (!cancelled) {
          setHasCache(false);
          setLoadError(UNREACHABLE_REASON);
        }
        return;
      }
      if (cancelled) return;
      apply(state);
      const stale =
        state.fetchedAt === null ||
        Date.now() - state.fetchedAt > MAX_CACHE_AGE_MS;
      if (state.connected && stale) refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [apply, refresh]);

  // The saved folder (or Uncategorized) stays visible even without a list,
  // for example while it loads or after a load failure.
  const options: (Folder | { id: number; name: string; count: null })[] =
    folders.some((f) => f.id === current)
      ? folders
      : [{ id: current, name: fallbackName(current), count: null }, ...folders];

  function onChange(next: string) {
    const id = Number(next);
    if (id === current) return;
    const previous = current;
    setCurrent(id);
    setSaveError(null);
    startSave(async () => {
      let res: Awaited<ReturnType<typeof saveCollectionFolder>>;
      try {
        res = await saveCollectionFolder(id);
      } catch {
        res = { ok: false, formError: UNREACHABLE_REASON };
      }
      if (res.ok) {
        setSavedMissing(false);
        toast.success(`Imports now go to ${res.name}`);
        void queryClient.invalidateQueries({ queryKey: ['spines'] });
        window.dispatchEvent(new Event(STATUS_REFRESH_EVENT));
      } else {
        setCurrent(previous);
        setSaveError(
          `Not saved: ${clean(res.formError)}. Pick the folder again to retry.`,
        );
      }
    });
  }

  const pending = loading || saving;
  // First open with no cached list: nothing to pick until the read answers.
  const firstLoad = hasCache !== true && loading;

  return (
    <Field data-disabled={pending ? true : undefined}>
      <FieldLabel htmlFor={SELECT_ID}>Collection folder</FieldLabel>
      <div className="flex items-center gap-2">
        <Select
          value={String(current)}
          onValueChange={onChange}
          disabled={pending}
        >
          <SelectTrigger
            id={SELECT_ID}
            className="w-64 max-w-full"
            aria-invalid={saveError ? true : undefined}
            aria-describedby={saveError ? ERROR_ID : undefined}
          >
            {firstLoad ? (
              <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                <Spinner aria-hidden="true" />
                Loading folders…
              </span>
            ) : (
              <SelectValue />
            )}
          </SelectTrigger>
          <SelectContent>
            {options.map((f) => (
              <SelectItem key={f.id} value={String(f.id)}>
                <span className="min-w-0 truncate">{f.name}</span>
                {f.count !== null ? (
                  <span className="font-mono text-muted-foreground">
                    {f.count}
                  </span>
                ) : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label="Reload folders from Discogs"
              disabled={pending}
              onClick={refresh}
            >
              <RefreshCw
                aria-hidden="true"
                className={cn(pending && 'animate-spin')}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reload folders</TooltipContent>
        </Tooltip>
      </div>
      <FieldDescription>
        New imports go into this folder on Discogs. Each spine keeps the folder
        it was added to.
      </FieldDescription>
      {saveError ? <FieldError id={ERROR_ID}>{saveError}</FieldError> : null}
      {loadError ? (
        <p role="alert" className="text-xs text-destructive">
          {`Couldn't load your folders: ${loadError}. `}
          <button
            type="button"
            className="underline underline-offset-4 disabled:opacity-50"
            disabled={pending}
            onClick={refresh}
          >
            Try again
          </button>
        </p>
      ) : null}
      {savedMissing ? (
        <p className="flex items-start gap-2 text-xs text-foreground">
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0 text-warning"
          />
          <span className="min-w-0">
            {
              "Your chosen folder isn't on Discogs any more. Imports go to Uncategorized until you pick another."
            }
          </span>
        </p>
      ) : null}
    </Field>
  );
}
