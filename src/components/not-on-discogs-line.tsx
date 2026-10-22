'use client';

import { CircleSlash, Undo2 } from 'lucide-react';
import type { NotOnDiscogsControl } from '@/components/spine-action-menu';
import { Button } from '@/components/ui/button';

// The marked body (UI-SPEC Not on Discogs, D-14, REV-05): the marked copy
// and an Unmark button. Candidates, Search again and Search Discogs… are
// hidden by the caller; nothing about the spine is deleted.

export const MARKED_LINE =
  'Marked not on Discogs. It stays in this list but is never added to your collection.';

export function NotOnDiscogsLine({
  control,
}: {
  control: NotOnDiscogsControl;
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="flex items-start gap-1 text-xs text-muted-foreground">
        <CircleSlash aria-hidden="true" className="mt-px size-4 shrink-0" />
        <span className="min-w-0">{MARKED_LINE}</span>
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-unmark-button=""
        onClick={() => void control.run(false)}
      >
        <Undo2 aria-hidden="true" />
        Unmark
      </Button>
    </div>
  );
}
