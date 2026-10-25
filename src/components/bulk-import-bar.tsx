'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ListPlus } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import { BulkImportDialog } from '@/components/bulk-import-dialog';
import { useSpineSelection } from '@/components/spine-selection';
import { STATUS_REFRESH_EVENT } from '@/components/status-indicator';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import { importButtonLabel, progressLine } from '@/lib/bulk-copy';
import { eligibleShownIds, selectAllState } from '@/lib/bulk-selection';
import type { SpinesResponse } from '@/lib/scan-types';

// The sticky bulk bar (D-05, UI-SPEC Bulk bar): Select all shown over the
// eligible spines of the current filters, the selected count, the run's
// progress line, and the page's one accent action, Import {s} selected.
// It is the last child of the /spines body, so it rides at the viewport
// bottom and sits in flow at the end of the list.

export function BulkImportBar({
  data,
  folderName,
}: {
  data: SpinesResponse;
  folderName: string;
}) {
  const selection = useSpineSelection();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const selectAllRef = useRef<HTMLButtonElement>(null);
  const startedRef = useRef(false);
  const selectAllId = useId();
  const eligible = useMemo(() => eligibleShownIds(data.spines), [data.spines]);
  if (!selection) return null;

  const { selected } = selection;
  const s = selected.size;
  const e = eligible.length;
  const all = selectAllState(selected, eligible);
  const picked = data.spines.filter((sp) => selected.has(sp.id));
  const run = data.bulk;

  function onStarted() {
    if (!selection) return;
    startedRef.current = true;
    selection.clear();
    void queryClient.invalidateQueries({ queryKey: ['spines'] });
    window.dispatchEvent(new Event(STATUS_REFRESH_EVENT));
  }

  return (
    <div className="sticky bottom-4 z-30 rounded-xl border bg-card px-4 py-2 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Checkbox
            ref={selectAllRef}
            id={selectAllId}
            checked={
              all === 'checked'
                ? true
                : all === 'indeterminate'
                  ? 'indeterminate'
                  : false
            }
            onCheckedChange={() => {
              if (all === 'checked') selection.clear();
              else selection.selectMany(eligible);
            }}
          />
          <label htmlFor={selectAllId} className="text-sm">
            Select all shown (
            <span className="font-mono tabular-nums">{e}</span>)
          </label>
        </div>
        <span aria-live="polite" className="text-sm">
          <span className="font-mono tabular-nums">{s}</span> selected
        </span>
        {run?.running ? (
          <span
            title={progressLine(run)}
            className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
          >
            <Spinner aria-hidden="true" role="presentation" />
            <span className="min-w-0 truncate">{progressLine(run)}</span>
          </span>
        ) : null}
        <Button
          type="button"
          className="ml-auto"
          disabled={s === 0}
          onClick={() => setOpen(true)}
        >
          <ListPlus aria-hidden="true" />
          {importButtonLabel(s)}
        </Button>
      </div>
      <BulkImportDialog
        open={open}
        onOpenChange={setOpen}
        spines={picked}
        folderName={folderName}
        country={data.discogs.preferredCountry}
        threshold={data.confidenceThreshold}
        onStarted={onStarted}
        onCloseAutoFocus={(ev) => {
          // After Start import, focus goes to Select all shown; Keep
          // reviewing returns it to the Import button (Radix default).
          if (!startedRef.current) return;
          startedRef.current = false;
          ev.preventDefault();
          selectAllRef.current?.focus();
        }}
      />
    </div>
  );
}
