import Link from 'next/link';
import type { Route } from 'next';
import type { CSSProperties, ReactNode } from 'react';
import { Skeleton } from '@components/ui/skeleton';
import { cn } from '@lib/utils';

export interface Stat {
  label: string;
  value: ReactNode;
  /** `of 40h`, `across 3 projects` — small, beside the figure. */
  unit?: string;
  /** Overdue and the like: the figure in danger ink when non-zero. */
  alert?: boolean;
  delta?: { text: string; good: boolean } | null;
  /** Every number is a link to the list that produced it — DESIGN-SYSTEM § 8. */
  href?: Route;
  below?: ReactNode;
}

/** DESIGN-SYSTEM § 7: one ruled band, figures 22px/600 tabular, hairlines between, never boxes. */
export function StatRow({ stats, loading = false }: { stats: readonly Stat[]; loading?: boolean }) {
  return (
    <div
      className="grid grid-cols-[repeat(var(--stats),minmax(0,1fr))] border-y max-sm:grid-cols-2"
      style={{ '--stats': stats.length } as CSSProperties}
    >
      {stats.map((stat, i) => {
        const figure = (
          <span
            className={cn(
              'flex flex-wrap items-baseline gap-x-2 text-xl font-semibold tracking-tight tabular',
              stat.alert && stat.value !== 0 && stat.value !== '0' && 'text-danger-fg',
            )}
          >
            {loading ? <Skeleton className="my-1 h-5 w-12" /> : stat.value}
            {stat.unit && !loading ? (
              <span className="text-xs font-normal tracking-normal text-text-muted">{stat.unit}</span>
            ) : null}
            {stat.delta && !loading ? (
              <span
                className={cn(
                  'text-xs font-medium tracking-normal whitespace-nowrap',
                  stat.delta.good ? 'text-success-fg' : 'text-danger-fg',
                )}
              >
                {stat.delta.text}
              </span>
            ) : null}
          </span>
        );
        return (
          <div
            key={stat.label}
            className={cn(
              'flex flex-col gap-0.5 border-r py-3 pr-4 [&:not(:first-child)]:pl-4 last:border-r-0',
              'max-sm:[&:nth-child(2n)]:border-r-0 max-sm:[&:nth-child(2n+1)]:pl-0 max-sm:[&:nth-child(n+3)]:border-t',
              i === 0 && 'pl-0',
            )}
          >
            {stat.href ? (
              <Link href={stat.href} className="rounded-xs hover:underline hover:underline-offset-4">
                {figure}
              </Link>
            ) : (
              figure
            )}
            <span className="text-xs text-text-secondary">{stat.label}</span>
            {stat.below}
          </div>
        );
      })}
    </div>
  );
}
