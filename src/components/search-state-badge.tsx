import { Circle, CircleX, Clock, Disc3, SearchX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import type { SpineDiscogsDto } from '@/lib/discogs-types';

/**
 * Where the spine's Discogs lookup stands (D-11, UI-SPEC search-state
 * badge), appended last in the card's status slot. Outline badges only;
 * destructive colors only Search failed.
 */
export function SearchStateBadge({
  discogs,
}: {
  discogs: SpineDiscogsDto | null;
}) {
  const state = discogs?.state ?? 'not_searched';
  switch (state) {
    case 'queued':
      return (
        <Badge variant="outline">
          <Clock aria-hidden="true" className="text-muted-foreground" />
          Queued
        </Badge>
      );
    case 'searching':
      return (
        <Badge variant="outline">
          <Spinner aria-hidden="true" role="presentation" className="size-3" />
          Searching
        </Badge>
      );
    case 'done': {
      const n = discogs?.candidateCount ?? 0;
      return (
        <Badge variant="outline">
          <Disc3 aria-hidden="true" className="text-muted-foreground" />
          <span>
            <span className="font-mono tabular-nums">{n}</span>
            {n === 1 ? ' candidate' : ' candidates'}
          </span>
        </Badge>
      );
    }
    case 'no_match':
      return (
        <Badge variant="outline">
          <SearchX aria-hidden="true" className="text-muted-foreground" />
          No matches
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="outline">
          <CircleX aria-hidden="true" className="text-destructive" />
          <span className="text-destructive">Search failed</span>
        </Badge>
      );
    default:
      return (
        <Badge variant="outline">
          <Circle aria-hidden="true" className="text-muted-foreground" />
          Not searched
        </Badge>
      );
  }
}
