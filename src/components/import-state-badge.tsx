import {
  CircleCheck,
  CircleSlash,
  CircleX,
  Clock,
  TriangleAlert,
} from 'lucide-react';
import { SearchStateBadge } from '@/components/search-state-badge';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import type { SpineDto } from '@/lib/scan-types';

function FailedBadge() {
  return (
    <Badge variant="outline">
      <CircleX aria-hidden="true" className="text-destructive" />
      <span className="text-destructive">Import failed</span>
    </Badge>
  );
}

/**
 * The card's one state badge, last in the status slot (UI-SPEC E5, D-10).
 * Precedence: imported, then the Not on Discogs mark, then the current
 * bulk item's lookup (the finding badge while it runs, Import failed once it
 * failed, Phase 6), then the import's phase; with none of these, the Phase
 * 3 search badge shows unchanged. Outline badges only; destructive colors
 * only Import failed.
 */
export function ImportStateBadge({
  spine,
}: {
  spine: Pick<SpineDto, 'import' | 'notOnDiscogs' | 'discogs' | 'bulk'>;
}) {
  const phase = spine.import?.phase ?? null;
  if (phase === 'imported') {
    return (
      <Badge variant="outline">
        <CircleCheck aria-hidden="true" className="text-success" />
        Imported
      </Badge>
    );
  }
  if (spine.notOnDiscogs) {
    return (
      <Badge variant="outline">
        <CircleSlash aria-hidden="true" className="text-muted-foreground" />
        Not on Discogs
      </Badge>
    );
  }
  const lookup = spine.bulk?.item?.phase ?? null;
  if (lookup === 'finding') {
    return (
      <Badge variant="outline">
        <Spinner aria-hidden="true" role="presentation" className="size-3" />
        Finding pressing
      </Badge>
    );
  }
  if (lookup === 'failed' || phase === 'failed') return <FailedBadge />;
  switch (phase) {
    case 'waiting':
      return (
        <Badge variant="outline">
          <Clock aria-hidden="true" className="text-muted-foreground" />
          Waiting to import
        </Badge>
      );
    case 'importing':
      return (
        <Badge variant="outline">
          <Spinner aria-hidden="true" role="presentation" className="size-3" />
          Importing
        </Badge>
      );
    case 'already_in_collection':
      return (
        <Badge variant="outline">
          <TriangleAlert aria-hidden="true" className="text-warning" />
          Already in your collection
        </Badge>
      );
    default:
      return <SearchStateBadge discogs={spine.discogs} />;
  }
}
