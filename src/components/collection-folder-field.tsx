'use client';

import { useQueryClient } from '@tanstack/react-query';
import { cn } from 'cn';
import { RefreshCw } from 'lucide-react';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// Settings "Collection folder" (D-03, IMP-02; UI-SPEC E12). The folder list
// comes from the settings-table cache (GET /api/discogs/folders); it is read
// again from Discogs inline (POST { refresh: true }) when there is no cache,
// when the cache is older than an hour, or on Reload folders. Saving on
// change goes through the saveCollectionFolder action, like ModelSelect.

const SELECT_ID = 'collection-folder';
const ERROR_ID = 'collection-folder-error';
const MAX_CACHE_AGE_MS = 60 * 60_000;

type Folder = FoldersGetResult['folders'][number];

function fallbackName(id: number): string {
  return id === 1 ? 'Uncategorized' : `Folder ${id}`;
}

export function CollectionFolderField() {
  const queryClient = useQueryClient();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [current, setCurrent] = useState<number>(1);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();

  const apply = useCallback((s: FoldersGetResult | FoldersRefreshResult) => {
    if ('folders' in s) {
      setFolders(s.folders);
      setCurrent(s.selectedId);
    }
  }, []);

  const refresh = useCallback(() => {
    startLoad(async () => {
      let res: Response;
      try {
        res = await fetch('/api/discogs/folders', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refresh: true }),
        });
      } catch {
        return;
      }
      if (!res.ok) return;
      try {
        apply((await res.json()) as FoldersRefreshResult);
      } catch {
        // No usable answer: keep what is shown.
      }
    });
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    startLoad(async () => {
      let state: FoldersGetResult;
      try {
        const res = await fetch('/api/discogs/folders');
        if (!res.ok) return;
        state = (await res.json()) as FoldersGetResult;
      } catch {
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

  // The saved folder stays visible even before a list has been read.
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
      const res = await saveCollectionFolder(id);
      if (res.ok) {
        toast.success(`Imports now go to ${res.name}`);
        void queryClient.invalidateQueries({ queryKey: ['spines'] });
        window.dispatchEvent(new Event(STATUS_REFRESH_EVENT));
      } else {
        setCurrent(previous);
        setSaveError(res.formError);
      }
    });
  }

  const pending = loading || saving;

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
            <SelectValue />
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
                className={cn(loading && 'animate-spin')}
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
    </Field>
  );
}
