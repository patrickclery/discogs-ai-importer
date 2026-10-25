import { MapPin, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { countryBadgeText } from '@/lib/bulk-copy';
import { countryBadgeOf } from '@/lib/bulk-view';
import type { SpineDto } from '@/lib/scan-types';

/**
 * The bulk import's country badge (D-15, UI-SPEC Country badge), before the
 * state badge. Preferred: a muted map pin and the release's country as
 * Discogs writes it. Otherwise a warning triangle (the icon only carries
 * the warning color) and `Fallback: {country}`. Nothing for a spine whose
 * current import did not come from a bulk run. A long country truncates,
 * with the full text on hover.
 */
export function CountryBadge({
  spine,
}: {
  spine: Pick<SpineDto, 'import' | 'bulk'>;
}) {
  const badge = countryBadgeOf(spine);
  if (badge === null) return null;
  const text = countryBadgeText(badge);
  return (
    <Badge variant="outline" className="max-w-full">
      {badge.kind === 'preferred' ? (
        <MapPin aria-hidden="true" className="text-muted-foreground" />
      ) : (
        <TriangleAlert aria-hidden="true" className="text-warning" />
      )}
      <span className="truncate" title={text}>
        {text}
      </span>
    </Badge>
  );
}
