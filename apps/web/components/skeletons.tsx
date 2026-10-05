import { Skeleton } from '@components/ui/skeleton';
import { cn } from '@lib/utils';

export function PageTitleSkeleton() {
  return <Skeleton className="h-7 w-40" />;
}

export function RowsSkeleton({ rows = 8, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col divide-y divide-border-subtle rounded-md border', className)} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-row items-center gap-3 px-3">
          <Skeleton className="size-badge-letter rounded-xs" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 flex-1" style={{ maxWidth: `${45 + ((i * 17) % 40)}%` }} />
          <Skeleton className="ml-auto h-3 w-16" />
          <Skeleton className="size-avatar-sm rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function TextSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('h-3 w-48', className)} />;
}

export function PageSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-5" role="status" aria-label="Loading">
      <PageTitleSkeleton />
      <RowsSkeleton rows={rows} />
    </div>
  );
}
