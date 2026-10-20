import { Skeleton } from '@/components/ui/skeleton';

/** UI-SPEC: title, filter bar, one section header, three spine cards. */
export default function SpinesLoading() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-9 w-80" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    </div>
  );
}
