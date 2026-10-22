'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CircleSlash, EllipsisVertical, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { announceSpineAction } from '@/components/import-ui-context';
import { STATUS_REFRESH_EVENT } from '@/components/status-indicator';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { failureReason, UNREACHABLE_REASON } from '@/lib/failure-reason';
import type { SpineDto } from '@/lib/scan-types';
import { spineNumber } from '@/lib/spine-review';

// The card action menu (UI-SPEC E10, D-14, REV-05): "Mark not on Discogs" /
// "Unmark not on Discogs". Both post { flag } to
// /api/spines/{id}/not-on-discogs; nothing is deleted and the mark is always
// reversible (from the menu, the marked line, or the toast's Undo).

/** Whether the spine offers "Mark not on Discogs" (UI-SPEC Action menu). */
export function canMarkNotOnDiscogs(
  spine: Pick<SpineDto, 'notOnDiscogs' | 'import' | 'reviewStatus'>,
): boolean {
  if (spine.notOnDiscogs) return false;
  if (spine.import !== null && spine.import.phase !== 'failed') return false;
  return (
    spine.reviewStatus === 'pending' ||
    spine.reviewStatus === 'not_found' ||
    spine.reviewStatus === 'failed'
  );
}

/** Mark or unmark, shared by the menu, the marked line and the not-found row. */
export type NotOnDiscogsControl = {
  run: (flag: boolean) => Promise<void>;
};

export function useNotOnDiscogs(
  spine: Pick<SpineDto, 'id' | 'index'>,
): NotOnDiscogsControl {
  const queryClient = useQueryClient();
  const [, setError] = useState<string | null>(null);
  const number = spineNumber(spine);

  async function run(flag: boolean): Promise<void> {
    setError(null);
    try {
      const res = await fetch(
        `/api/spines/${encodeURIComponent(spine.id)}/not-on-discogs`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ flag }),
        },
      );
      if (!res.ok) {
        setError(await failureReason(res));
        return;
      }
      if (flag) {
        toast(`Spine #${number} marked not on Discogs`, {
          action: { label: 'Undo', onClick: () => void run(false) },
        });
      } else {
        toast(`Spine #${number} unmarked`);
      }
      await queryClient.invalidateQueries({ queryKey: ['spines'] });
      window.dispatchEvent(new Event(STATUS_REFRESH_EVENT));
      announceSpineAction(spine.id, number);
    } catch {
      setError(UNREACHABLE_REASON);
    }
  }
  return { run };
}

export function SpineActionMenu({
  spine,
  control,
}: {
  spine: SpineDto;
  control: NotOnDiscogsControl;
}) {
  const number = spineNumber(spine);
  const canMark = canMarkNotOnDiscogs(spine);
  const canUnmark = spine.notOnDiscogs;
  // UI-SPEC: no trigger when the menu would be empty.
  if (!canMark && !canUnmark) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`More actions for spine #${number}`}
        >
          <EllipsisVertical aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canMark ? (
          <DropdownMenuItem onSelect={() => void control.run(true)}>
            <CircleSlash aria-hidden="true" className="size-4" />
            Mark not on Discogs
          </DropdownMenuItem>
        ) : null}
        {canUnmark ? (
          <DropdownMenuItem onSelect={() => void control.run(false)}>
            <Undo2 aria-hidden="true" className="size-4" />
            Unmark not on Discogs
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
