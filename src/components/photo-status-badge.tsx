import { cn } from 'cn';
import { CircleCheck, CircleX, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { type BadgeStatus, badgeFor } from '@/lib/photo-status';

/**
 * The single status-to-badge mapping (UI-SPEC), via badgeFor(). /upload rows,
 * client upload rows (02-07) and /spines section headers (02-08) all use it.
 */
export function PhotoStatusBadge({
  status,
  label,
  className,
}: {
  status: BadgeStatus;
  /** Overrides the mapped label (the icon still follows the status). */
  label?: string;
  className?: string;
}) {
  const view = badgeFor(status);
  return (
    <Badge variant="outline" className={cn('shrink-0', className)}>
      {view.tone === 'muted' ? (
        <Clock aria-hidden="true" className="text-muted-foreground" />
      ) : view.tone === 'spinner' ? (
        <Spinner aria-hidden="true" role="presentation" className="size-3" />
      ) : view.tone === 'success' ? (
        <CircleCheck aria-hidden="true" className="text-success" />
      ) : (
        <CircleX aria-hidden="true" className="text-destructive" />
      )}
      <span
        className={view.tone === 'destructive' ? 'text-destructive' : undefined}
      >
        {label ?? view.label}
      </span>
    </Badge>
  );
}
