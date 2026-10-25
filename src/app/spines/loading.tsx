import { Skeleton } from '@/components/ui/skeleton';

/** Eight card placeholders, in the order they render. */
const CARD_KEYS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'] as const;

/**
 * UI-SPEC Loading: the title, the status filter row and the filter bar, one
 * section header, then the compact grid (D-12) of 8 card skeletons, Compact
 * being the default layout.
 */
export default function SpinesLoading() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-8 w-32" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-full max-w-3xl" />
        <Skeleton className="h-9 w-80" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-14 w-full" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {CARD_KEYS.map((k) => (
            <Skeleton key={k} className="h-64 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
