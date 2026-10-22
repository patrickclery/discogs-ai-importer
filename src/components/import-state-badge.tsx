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

/**
 * The card's one state badge, last in the status slot (UI-SPEC E5, D-10).
 * Precedence: imported, then the Not on Discogs mark, then the import's
 * phase; with neither an import nor the mark, the Phase 3 search badge
 * shows unchanged. Outline badges only; destructive colors only Import
 * failed.
 */
export function ImportStateBadge({
  spine,
}: {
  spine: Pick<SpineDto, 'import' | 'notOnDiscogs' | 'discogs'>;
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
  switch (phase) {
    case 'failed':
      return (
        <Badge variant="outline">
          <CircleX aria-hidden="true" className="text-destructive" />
          <span className="text-destructive">Import failed</span>
        </Badge>
      );
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
