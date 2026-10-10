import Link from 'next/link';
import type { Route } from 'next';
import type { CSSProperties, ReactNode } from 'react';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { SectionError, StaleNotice } from '@components/dashboard/section';
import { cn } from '@lib/utils';

export interface Stat {
  label: string;
  value: ReactNode;
  /** `of 40h`, `across 3 projects` — small, beside the figure. */
  unit?: string;
  /** What the figure is measured against, on hover of the unit. */
  unitHint?: string;
  /** Overdue and the like: the figure in danger ink when non-zero. */
  alert?: boolean;
  /** `good: null` is no change, in neutral ink. */
  delta?: { text: string; good: boolean | null } | null;
  /** Every number is a link to the list that produced it — DESIGN-SYSTEM § 8. */
  href?: Route;
  below?: ReactNode;
}

export type StatRowState = 'loading' | 'ready' | 'failed' | 'stale';

/** DESIGN-SYSTEM § 7: one ruled band, figures 22px/600 tabular, hairlines between, never boxes. */
export function StatRow({
  stats,
  state = 'ready',
  onRetry,
}: {
  stats: readonly Stat[];
  state?: StatRowState;
  onRetry?: () => void;
}) {
  const known = state === 'ready' || state === 'stale';
  return (
    <div className="flex flex-col">
      <div
        className="grid grid-cols-[repeat(var(--stats),minmax(0,1fr))] border-y max-sm:grid-cols-2"
        style={{ '--stats': stats.length } as CSSProperties}
      >
        {stats.map((stat, i) => {
          const figure = (
            <span
              className={cn(
                'flex flex-wrap items-baseline gap-x-2 text-xl font-semibold tracking-tight tabular',
                known && stat.alert && stat.value !== 0 && stat.value !== '0' && 'text-danger-fg',
              )}
            >
              {state === 'loading' ? (
                <Skeleton className="my-1 h-5 w-12" />
              ) : known ? (
                <span className="group-hover/stat:underline group-hover/stat:underline-offset-4">{stat.value}</span>
              ) : (
                <span className="text-text-muted" aria-label="Not available">
                  –
                </span>
              )}
              {stat.unit && known ? (
                stat.unitHint ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs font-normal tracking-normal text-text-muted">{stat.unit}</span>
                    </TooltipTrigger>
                    <TooltipContent>{stat.unitHint}</TooltipContent>
                  </Tooltip>
                ) : (
                  <span className="text-xs font-normal tracking-normal text-text-muted">{stat.unit}</span>
                )
              ) : null}
              {stat.delta && known ? (
                <span
                  className={cn(
                    'text-xs font-medium tracking-normal whitespace-nowrap',
                    stat.delta.good === null
                      ? 'text-text-muted'
                      : stat.delta.good
                        ? 'text-success-fg'
                        : 'text-danger-fg',
                  )}
                >
                  {stat.delta.text}
                </span>
              ) : null}
            </span>
          );
          const label = <span className="text-xs text-text-secondary">{stat.label}</span>;
          return (
            <div
              key={stat.label}
              className={cn(
                'flex flex-col gap-0.5 border-r py-3 pr-4 [&:not(:first-child)]:pl-4 last:border-r-0',
                'max-sm:[&:nth-child(2n)]:border-r-0 max-sm:[&:nth-child(2n+1)]:pl-0 max-sm:[&:nth-child(n+3)]:border-t',
                i === 0 && 'pl-0',
              )}
            >
              {stat.href && known ? (
                <Link href={stat.href} className="group/stat -mx-1 flex flex-col gap-0.5 rounded-xs px-1">
                  {figure}
                  {label}
                </Link>
              ) : (
                <>
                  {figure}
                  {label}
                </>
              )}
              {known ? stat.below : null}
            </div>
          );
        })}
      </div>
      {state === 'failed' && onRetry ? (
        <SectionError onRetry={onRetry}>These figures could not be loaded.</SectionError>
      ) : null}
      {state === 'stale' && onRetry ? (
        <StaleNotice onRetry={onRetry}>These figures could not be refreshed and may be out of date.</StaleNotice>
      ) : null}
    </div>
  );
}

export function statRowState(query: { isPending: boolean; isError: boolean; data: unknown }): StatRowState {
  if (query.isPending) return 'loading';
  if (query.isError) return query.data === undefined ? 'failed' : 'stale';
  return 'ready';
}

export function weekDelta(delta: number): NonNullable<Stat['delta']> {
  return {
    text: `${delta > 0 ? '+' : delta === 0 ? '±' : ''}${delta} vs last week`,
    good: delta === 0 ? null : delta > 0,
  };
}
