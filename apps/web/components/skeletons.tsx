import type { CSSProperties } from 'react';
import { Skeleton } from '@components/ui/skeleton';
import { cn } from '@lib/utils';

/**
 * One cell of a skeleton row. `title` and `lines` take the free width; the others are fixed, so a
 * spec reads like the row it stands in for.
 */
export type SkeletonCell =
  | 'check'
  | 'badge'
  | 'avatar'
  | 'avatar-md'
  | 'mark'
  | 'key'
  | 'title'
  | 'lines'
  | 'meta'
  | 'short'
  | 'chip'
  | 'button'
  | 'icon';

export const ISSUE_ROW: readonly SkeletonCell[] = ['badge', 'key', 'title', 'meta', 'avatar'];
export const PERSON_ROW: readonly SkeletonCell[] = ['avatar-md', 'lines', 'chip', 'icon'];

const varying = (i: number, from = 45, span = 40) => `${from + ((i * 17) % span)}%`;

function Cell({ cell, i }: { cell: SkeletonCell; i: number }) {
  switch (cell) {
    case 'check':
      return <Skeleton className="size-4 flex-none rounded-xs" />;
    case 'badge':
      return <Skeleton className="size-badge-letter flex-none rounded-xs" />;
    case 'avatar':
      return <Skeleton className="size-avatar-sm flex-none rounded-full" />;
    case 'avatar-md':
      return <Skeleton className="size-avatar flex-none rounded-full" />;
    case 'mark':
      return <Skeleton className="size-6 flex-none rounded-sm" />;
    case 'key':
      return <Skeleton className="h-3 w-14 flex-none" />;
    case 'title':
      return (
        <div className="min-w-0 flex-1">
          <Skeleton className="h-3" style={{ maxWidth: varying(i) }} />
        </div>
      );
    case 'lines':
      return (
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-4 items-center">
            <Skeleton className="h-3 w-full" style={{ maxWidth: varying(i, 30, 30) }} />
          </div>
          <div className="flex h-4 items-center">
            <Skeleton className="h-2.5 w-full" style={{ maxWidth: varying(i + 2, 20, 25) }} />
          </div>
        </div>
      );
    case 'meta':
      return <Skeleton className="h-3 w-16 flex-none" />;
    case 'short':
      return <Skeleton className="h-3 w-10 flex-none" />;
    case 'chip':
      return <Skeleton className="h-5 w-20 flex-none rounded-sm" />;
    case 'button':
      return <Skeleton className="h-control-sm w-20 flex-none rounded-md" />;
    case 'icon':
      return <Skeleton className="size-icon flex-none rounded-xs" />;
  }
}

export function PageTitleSkeleton() {
  return (
    <div className="flex min-h-10 items-center">
      <Skeleton className="h-7 w-40" />
    </div>
  );
}

export function RowsSkeleton({
  rows = 8,
  columns = ISSUE_ROW,
  bordered = true,
  className,
  rowClassName,
}: {
  rows?: number;
  columns?: readonly SkeletonCell[];
  bordered?: boolean;
  className?: string;
  /** The real row's height classes, when they differ from the list defaults. */
  rowClassName?: string;
}) {
  const tall = columns.includes('lines') || columns.includes('avatar-md');
  return (
    <div
      className={cn('flex flex-col divide-y divide-border-subtle', bordered && 'rounded-md border', className)}
      aria-hidden
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className={cn('flex items-center gap-3', tall ? 'h-row-lg' : 'h-row', bordered && 'px-3', rowClassName)}
        >
          {columns.map((cell, c) => (
            <Cell key={c} cell={cell} i={i} />
          ))}
        </div>
      ))}
    </div>
  );
}

export interface TableSkeletonColumn {
  /** The real column's width classes (`w-24`, `w-[22%]`); omit for the flexible column. */
  className?: string;
  align?: 'left' | 'right';
}

export function TableSkeleton({
  columns,
  rows = 6,
  bordered = true,
  className,
  rowClassName = 'h-10',
}: {
  columns: readonly TableSkeletonColumn[];
  rows?: number;
  bordered?: boolean;
  className?: string;
  rowClassName?: string;
}) {
  return (
    <div className={cn('overflow-hidden', bordered && 'rounded-md border', className)} aria-hidden>
      <table className="w-full table-fixed">
        <thead className="bg-app">
          <tr className="h-7 border-b">
            {columns.map((col, c) => (
              <th key={c} className={cn('px-3', col.className)}>
                <Skeleton className={cn('h-2.5 w-12', col.align === 'right' && 'ml-auto')} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i} className={rowClassName}>
              {columns.map((col, c) => (
                <td key={c} className={cn('px-3', col.className)}>
                  <Skeleton
                    className={cn('h-3', col.align === 'right' && 'ml-auto')}
                    style={{ width: col.className ? '70%' : varying(i + c) }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Labelled fields over a submit button, at the width the settings forms use. */
export function FormSkeleton({ fields = 3, className }: { fields?: number; className?: string }) {
  return (
    <div className={cn('flex max-w-xl flex-col gap-5', className)} aria-hidden>
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-3" style={{ width: `${18 + ((i * 7) % 12)}%` }} />
          <Skeleton className="h-control w-full rounded-md" />
        </div>
      ))}
      <Skeleton className="h-control w-28 rounded-md" />
    </div>
  );
}

/** A settings page: title with its tab strip, then a form at the settings width. */
export function SettingsSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="flex flex-col gap-5" role="status" aria-label="Loading">
      <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="ml-auto h-control w-96 max-w-full rounded-md max-sm:ml-0" />
      </div>
      <FormSkeleton fields={fields} className="max-w-4xl" />
    </div>
  );
}

export function TextSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('h-3 w-48', className)} />;
}

/** The default route skeleton: header, a toolbar line and an unboxed list, the shape most pages share. */
export function PageSkeleton({ rows = 8, toolbar = true }: { rows?: number; toolbar?: boolean }) {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading">
      <PageTitleSkeleton />
      {toolbar ? <Skeleton className="h-control w-full rounded-md" /> : null}
      <RowsSkeleton rows={rows} bordered={false} className="border-t" />
    </div>
  );
}

/** Header, the ruled stat band and the two columns both dashboards share. */
export function DashboardSkeleton({ stats = 4 }: { stats?: number }) {
  return (
    <div className="flex flex-col gap-5" role="status" aria-label="Loading">
      <PageTitleSkeleton />
      <div
        className="grid grid-cols-[repeat(var(--stats),minmax(0,1fr))] border-y max-sm:grid-cols-2"
        style={{ '--stats': stats } as CSSProperties}
      >
        {Array.from({ length: stats }, (_, i) => (
          <div key={i} className="flex flex-col gap-2 border-r py-3 pr-4 pl-4 first:pl-0 last:border-r-0">
            <Skeleton className="my-1 h-5 w-12" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="grid items-start gap-8 min-[1200px]:grid-cols-[minmax(0,1fr)_var(--rail)]">
        <RowsSkeleton rows={6} bordered={false} columns={['badge', 'key', 'title', 'meta']} />
        <div className="flex flex-col gap-3 max-[1199px]:hidden">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-3" style={{ width: `${55 + ((i * 13) % 30)}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
