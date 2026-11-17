import type { ComponentProps } from 'react';
import { Skeleton } from '@components/ui/skeleton';
import { cn } from '@lib/utils';

export function SettingsList({ className, ...props }: ComponentProps<'ul'>) {
  return <ul className={cn('flex flex-col divide-y divide-border-subtle rounded-md border', className)} {...props} />;
}

export function SettingsListRow({ className, ...props }: ComponentProps<'li'>) {
  return <li className={cn('flex min-h-14 items-center gap-3 px-4 py-2', className)} {...props} />;
}

/** The rows of a `SettingsList` before it loads: an icon, a name over a meta line, and the trailing cells. */
export function SettingsListSkeleton({
  rows,
  label,
  trailing = ['w-16'],
}: {
  rows: number;
  label: string;
  /** Width classes of the cells right of the text, in order. */
  trailing?: readonly string[];
}) {
  return (
    <div className="flex flex-col divide-y divide-border-subtle rounded-md border" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex min-h-14 items-center gap-3 px-4 py-2">
          <Skeleton className="size-icon flex-none rounded-xs" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5" style={{ maxWidth: `${30 + ((i * 17) % 25)}%` }} />
            <Skeleton className="h-3" style={{ maxWidth: `${45 + ((i * 13) % 20)}%` }} />
          </div>
          {trailing.map((width, c) => (
            <Skeleton key={c} className={cn('h-3 flex-none max-sm:hidden', width)} />
          ))}
        </div>
      ))}
    </div>
  );
}
