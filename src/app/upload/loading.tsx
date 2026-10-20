import { Skeleton } from '@/components/ui/skeleton';

export default function UploadLoading() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}
