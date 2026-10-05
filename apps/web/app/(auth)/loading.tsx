import { Skeleton } from '@components/ui/skeleton';

export default function Loading() {
  return (
    <div className="flex flex-col gap-5" role="status" aria-label="Loading">
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-control-lg w-full" />
      <Skeleton className="h-control-lg w-full" />
      <Skeleton className="h-control-lg w-full" />
    </div>
  );
}
