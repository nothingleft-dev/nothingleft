import type { CSSProperties } from 'react';
import { Search } from 'lucide-react';
import { PageTitle } from '@components/page-title';
import { Skeleton } from '@components/ui/skeleton';
import { COLUMNS, DEFAULT_COLUMNS, gridTemplate, shownColumns } from '@lib/issue-list/columns';
import { cn } from '@lib/utils';

const SHOWN = shownColumns(DEFAULT_COLUMNS, COLUMNS);
// Phone and desktop tracks switch in CSS: this renders before any client code, while the route's chunks load.
const TRACKS = {
  '--tracks-desktop': gridTemplate(SHOWN),
  '--tracks-phone': 'minmax(64px,auto) minmax(0,1fr) 7rem',
} as CSSProperties;
const ROW_GRID = 'grid grid-cols-(--tracks-phone) items-center gap-2 md:grid-cols-(--tracks-desktop)';

function StatusSkeleton() {
  return (
    <span className="flex items-center gap-2">
      <Skeleton className="size-2 rounded-full" />
      <Skeleton className="h-3 w-16" />
    </span>
  );
}

/** The route-level stand-in for an issue list: the title, bar, toolbar and grouped table the list shows while it loads. */
export function IssueListSkeleton({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading">
      <PageTitle>{title}</PageTitle>
      <div className="flex h-control-lg items-center gap-2 rounded-sm border border-border-strong bg-surface pl-3">
        <Search aria-hidden className="size-icon-sm flex-none text-text-muted" />
        <span className="flex min-w-0 items-center truncate text-text-muted">
          <span className="font-sans text-sm leading-none max-lg:hidden">Search or query</span>
          <span className="px-1.5 font-sans text-sm leading-none max-lg:hidden">·</span>
          <span className="truncate font-mono text-xs leading-none">assignee: me #Unresolved</span>
        </span>
      </div>
      <div className="flex items-center gap-2 md:min-h-[30px]">
        <Skeleton className="h-3 w-16" />
        <span className="flex-1" />
        <Skeleton className="h-control-sm w-[134px]" />
        <Skeleton className="h-control-sm w-[86px] max-md:hidden" />
        <Skeleton className="h-control-sm w-[108px]" />
      </div>
      <div aria-hidden className="flex flex-col" style={TRACKS}>
        <div className={cn(ROW_GRID, 'h-row-dense border-b px-2 max-md:hidden')}>
          <span />
          <Skeleton className="h-2.5 w-2" />
          <Skeleton className="h-2.5 w-2" />
          <Skeleton className="h-2.5 w-6" />
          <Skeleton className="h-2.5 w-8" />
          {SHOWN.map(c => (
            <span key={c.id} className={cn('flex', c.align === 'right' && 'justify-end')}>
              <Skeleton className="h-2.5 w-10" />
            </span>
          ))}
        </div>
        {[5, 7].map((count, run) => (
          <div key={run}>
            <div className="pt-3">
              <div className="flex h-8 items-center gap-2 rounded-sm bg-app px-2">
                <Skeleton className="size-3 rounded-full" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            {Array.from({ length: count }, (_, row) => {
              const i = run * 5 + row;
              return (
                <div key={i} className={cn(ROW_GRID, 'h-row border-b border-border-subtle px-2 max-md:px-1')}>
                  <span className="max-md:hidden" />
                  <Skeleton className="size-badge-letter rounded-xs max-md:hidden" />
                  <Skeleton className="size-badge-letter rounded-xs max-md:hidden" />
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-3" style={{ width: `${40 + ((i * 23) % 50)}%` }} />
                  <span className="md:hidden">
                    <StatusSkeleton />
                  </span>
                  {SHOWN.map(c => (
                    <span key={c.id} className={cn('flex min-w-0 max-md:hidden', c.align === 'right' && 'justify-end')}>
                      {c.id === 'status' ? <StatusSkeleton /> : <Skeleton className="h-3 w-16" />}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
