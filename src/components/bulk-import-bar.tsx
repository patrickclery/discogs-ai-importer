'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ListPlus } from 'lucide-react';
import { type ReactNode, useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { BulkImportDialog } from '@/components/bulk-import-dialog';
import { useSpineSelection } from '@/components/spine-selection';
import { STATUS_REFRESH_EVENT } from '@/components/status-indicator';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  importButtonLabel,
  importDisabledReason,
  lastResultLine,
  progressLine,
  startSkipsToast,
} from '@/lib/bulk-copy';
import { eligibleShownIds, selectAllState } from '@/lib/bulk-selection';
import type { BulkStartResponse } from '@/lib/bulk-types';
import type { SpineDto, SpinesResponse } from '@/lib/scan-types';

// The sticky bulk bar (D-05, UI-SPEC Bulk bar): Select all shown over the
// eligible spines of the current filters, the selected count, Clear
// selection, the run's progress or last result, and the page's one accent
// action, Import {s} selected. It is the last child of the /spines body,
// so it rides at the viewport bottom and sits in flow at the end of the
// list. At 360px it wraps, Import on the second row.

const NOTHING_SHOWN = 'Nothing shown can be imported';

/** A disabled control inside a focusable span carrying its reason. */
function WithReason({
  reason,
  children,
}: {
  reason: string | null;
  children: ReactNode;
}) {
  if (!reason) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so keyboard users reach the disabled reason
          tabIndex={0}
          className="inline-flex max-w-full rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

/** Caption muted, one line, the full text on hover. */
function StatusLine({ text, busy }: { text: string; busy: boolean }) {
  return (
    <span
      title={text}
      className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
    >
      {busy ? <Spinner aria-hidden="true" role="presentation" /> : null}
      <span className="min-w-0 truncate">{text}</span>
    </span>
  );
}

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
  // The picks as they were when the dialog opened (WR-06): a poll must not
  // change the count the owner is confirming or the set Start sends. The
  // server re-checks each pick and reports the ones that changed.
  const [frozen, setFrozen] = useState<SpineDto[]>([]);
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
  const disabledReason = importDisabledReason({
    selected: s,
    connected: data.discogs.connected,
    needsReconnect: data.discogs.needsReconnect,
    running: run?.running ?? false,
    busy: run?.busy ?? false,
  });

  function focusSelectAll() {
    window.requestAnimationFrame(() => selectAllRef.current?.focus());
  }

  function onStarted(response: BulkStartResponse) {
    if (!selection) return;
    startedRef.current = true;
    selection.clear();
    if (response.skipped > 0) {
      toast.info(startSkipsToast(response.started, response.skipped));
    }
    void queryClient.invalidateQueries({ queryKey: ['spines'] });
    window.dispatchEvent(new Event(STATUS_REFRESH_EVENT));
  }

  return (
    <div className="sticky bottom-4 z-30 rounded-xl border bg-card px-4 py-2 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <WithReason reason={e === 0 ? NOTHING_SHOWN : null}>
            <Checkbox
              ref={selectAllRef}
              id={selectAllId}
              disabled={e === 0}
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
          </WithReason>
          <label htmlFor={selectAllId} className="text-sm">
            Select all shown (
            <span className="font-mono tabular-nums">{e}</span>)
          </label>
        </div>
        <span aria-live="polite" className="text-sm">
          <span className="font-mono tabular-nums">{s}</span> selected
        </span>
        {s > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              selection.clear();
              focusSelectAll();
            }}
          >
            Clear selection
          </Button>
        ) : null}
        {run?.running ? (
          <StatusLine text={progressLine(run)} busy />
        ) : run ? (
          <StatusLine text={lastResultLine(run)} busy={false} />
        ) : null}
        <div className="ml-auto">
          <WithReason reason={disabledReason}>
            <Button
              type="button"
              disabled={disabledReason !== null}
              onClick={() => {
                setFrozen(picked);
                setOpen(true);
              }}
            >
              <ListPlus aria-hidden="true" />
              {importButtonLabel(s)}
            </Button>
          </WithReason>
        </div>
      </div>
      <BulkImportDialog
        open={open}
        onOpenChange={setOpen}
        spines={frozen}
        folderName={folderName}
        country={data.discogs.preferredCountry}
        fallbackCountry={data.discogs.fallbackCountry}
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
