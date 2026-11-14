'use client';

import type { ReactNode } from 'react';
import type { Route } from 'next';
import type { ReportEmpty, ReportFilter } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { FormAlert } from '@components/auth/form-alert';
import { LoadError } from '@components/query-state';
import { StatRow } from '@components/dashboard/stat-row';
import type { ReportChanges } from '@lib/reports/url';
import { EVERYONE } from '@lib/reports/url';
import { cn } from '@lib/utils';

interface Widening {
  label: string;
  changes: ReportChanges;
}

// A period is widened by a longer one, not dropped: dropping it means This week again.
export const WIDER_PERIODS: readonly string[] = ['This month', 'This year'];

function wideningsOf(filter: ReportFilter, period: string | null, wider: readonly string[]): Widening[] {
  switch (filter.kind) {
    case 'clause':
      return [{ label: `Drop ${filter.label}`, changes: { q: filter.widen_query } }];
    case 'view':
      return [{ label: `Drop ${filter.label}`, changes: { view: null } }];
    case 'projects':
      return [{ label: 'Every project', changes: { projects: null } }];
    case 'users':
      return [{ label: 'Everyone', changes: { users: EVERYONE } }];
    case 'unresolved_only':
      return [{ label: 'Include resolved issues', changes: { unresolved_only: 'false' } }];
    case 'include_unassigned':
      return [{ label: 'Include unassigned issues', changes: { include_unassigned: null } }];
    case 'period':
      return wider
        .filter(p => p !== period)
        .map(p => ({
          label: p,
          changes: { period: p, from: null, to: null },
        }));
  }
}

/** The API's sentence, verbatim, and one way out per filter that produced it. */
export function ReportEmptyState({
  empty,
  period,
  onChange,
  action,
  description,
  widerPeriods = WIDER_PERIODS,
  className,
}: {
  empty: ReportEmpty;
  period: string | null;
  onChange: (changes: ReportChanges) => void;
  action?: ReactNode;
  description?: string;
  widerPeriods?: readonly string[];
  className?: string;
}) {
  const widenings = empty.filters.flatMap(f => wideningsOf(f, period, widerPeriods));
  return (
    <div className={cn('flex flex-col items-start gap-3 rounded-md border px-4 py-6', className)}>
      <div className="flex flex-col gap-1">
        <p className="font-medium">{empty.message}</p>
        {description ? <p className="text-xs text-text-secondary">{description}</p> : null}
      </div>
      {action}
      {widenings.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-secondary">Widen it:</span>
          {widenings.map(w => (
            <Button key={w.label} variant="outline" size="xs" onClick={() => onChange(w.changes)}>
              {w.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Inside a tinted alert a suggestion keeps the page's own ink and surface, like the ones outside it.
export const SUGGESTION = 'bg-surface text-text hover:bg-hover';

/** `Sentence one. The rest.`: the first sentence as the title, any hint after it underneath. */
function splitMessage(message: string) {
  const end = message.search(/[.!?]\s/);
  return end === -1
    ? { title: message, hint: null }
    : { title: message.slice(0, end + 1), hint: message.slice(end + 2) };
}

export function ReportProblem({
  message,
  validValues,
  onPick,
  formatValue = v => v,
  fixes,
}: {
  message: string;
  validValues: readonly string[];
  onPick?: (value: string) => void;
  formatValue?: (value: string) => string;
  /** One-click ways out that are not a value of the field at fault, such as a shorter period. */
  fixes?: ReactNode;
}) {
  const { title, hint } = splitMessage(message);
  const chips = validValues.length > 0 && onPick;
  return (
    <FormAlert title={title}>
      {hint || chips || fixes ? (
        <div className="flex flex-col gap-2">
          {hint ? <p>{hint}</p> : null}
          {chips || fixes ? (
            <div className="flex flex-wrap gap-1.5">
              {chips
                ? validValues.slice(0, 24).map(value => (
                    <Button
                      key={value}
                      variant="outline"
                      size="xs"
                      className={cn(SUGGESTION, 'max-w-full')}
                      title={formatValue(value)}
                      onClick={() => onPick(value)}
                    >
                      <span className="truncate">{formatValue(value)}</span>
                    </Button>
                  ))
                : null}
              {fixes}
            </div>
          ) : null}
        </div>
      ) : null}
    </FormAlert>
  );
}

export function ReportFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <LoadError onRetry={onRetry} detail={message}>
      The report could not be loaded.
    </LoadError>
  );
}

export type SkeletonShape = 'bars' | 'grid' | 'line' | 'gantt' | 'sheet';

const BAR_WIDTHS = [78, 64, 52, 41, 33, 22, 15, 9];

/** The bar table's own template: name, bar, figure and share, unboxed, with its header and total rows. */
function BarTableSkeleton() {
  const row = (label: ReactNode, bar: ReactNode, key: number | string, className = 'border-b border-border-subtle') => (
    <div key={key} className={cn('flex h-row items-center gap-0', className)}>
      <div className="flex w-[30%] flex-none items-center gap-2 pr-4">{label}</div>
      <div className="flex min-w-0 flex-1 items-center px-2">{bar}</div>
      <div className="flex w-28 flex-none justify-end">
        <Skeleton className="h-3 w-8" />
      </div>
      <div className="flex w-20 flex-none justify-end">
        <Skeleton className="h-3 w-10" />
      </div>
    </div>
  );
  return (
    <div className="flex flex-col">
      <div className="flex h-8 items-center border-b">
        <Skeleton className="h-3 w-16" />
      </div>
      {BAR_WIDTHS.map((w, i) =>
        row(
          <>
            <Skeleton className="size-6 flex-none rounded-full" />
            <Skeleton className="h-3 w-28" />
          </>,
          <Skeleton className="h-3 rounded-l-none" style={{ width: `${w}%` }} />,
          i,
        ),
      )}
      {row(<Skeleton className="h-3 w-10" />, null, 'total', '')}
    </div>
  );
}

/** A line falling across the plot, the shape a burndown draws. */
function LineSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">
        {[72, 128, 56].map(w => (
          <Skeleton key={w} className="h-3" style={{ width: w }} />
        ))}
      </div>
      <div className="relative h-80 border-b border-l">
        {[0.25, 0.5, 0.75].map(y => (
          <div key={y} className="absolute inset-x-0 border-t border-border-subtle" style={{ top: `${y * 100}%` }} />
        ))}
        <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <polyline
            points="0,12 18,22 36,30 54,44 72,58 100,96"
            fill="none"
            stroke="var(--bg-hover)"
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            className="animate-pulse"
          />
        </svg>
      </div>
    </div>
  );
}

/** Shaped like the report it stands in for, so nothing moves when the figures arrive. */
/** A stat row's cell while it loads: its label, and whether the loaded cell is a link (which insets the row). */
export type SkeletonStat = string | { label: string; linked: true };

export function ReportSkeleton({ shape, stats }: { shape: SkeletonShape; stats?: readonly SkeletonStat[] }) {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading the report">
      <div className="flex h-4 items-center">
        <Skeleton className="h-3 w-72" />
      </div>
      {stats?.length ? (
        <StatRow
          state="loading"
          stats={stats.map(stat =>
            typeof stat === 'string'
              ? { label: stat, value: null }
              : { label: stat.label, value: null, href: '/' as Route },
          )}
        />
      ) : null}
      {shape === 'sheet' ? (
        <SheetSkeleton />
      ) : shape === 'bars' ? (
        <BarTableSkeleton />
      ) : shape === 'line' ? (
        <LineSkeleton />
      ) : shape === 'gantt' ? (
        <div className="flex flex-col gap-3">
          <div className="flex gap-4">
            {[72, 56, 44, 64, 96].map(w => (
              <Skeleton key={w} className="h-3" style={{ width: w }} />
            ))}
          </div>
          <div className="grid grid-cols-[minmax(220px,320px)_minmax(0,1fr)] overflow-hidden rounded-md border max-sm:grid-cols-[132px_minmax(0,1fr)]">
            <div className="border-r">
              <div className="h-11 border-b" />
              {Array.from({ length: 9 }, (_, i) => (
                <div
                  key={i}
                  className="flex h-8 items-center gap-2.5 border-b border-border-subtle px-3 last:border-b-0"
                >
                  <Skeleton className="h-3 w-12 flex-none" />
                  <Skeleton className="h-3 w-32" />
                </div>
              ))}
            </div>
            <div>
              <div className="h-11 border-b" />
              {Array.from({ length: 9 }, (_, i) => (
                <div key={i} className="flex h-8 items-center border-b border-border-subtle last:border-b-0">
                  <Skeleton
                    className="h-4"
                    style={{ marginLeft: `${(i * 7) % 40}%`, width: `${18 + ((i * 11) % 24)}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-md border">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex h-9 items-center">
              <div className="w-56 flex-none px-3 max-sm:w-36">
                <Skeleton className="h-3 w-28" />
              </div>
              {Array.from({ length: 6 }, (_, j) => (
                <div key={j} className="flex w-28 flex-none justify-center">
                  <Skeleton className="h-3 w-6" />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// The timesheet's own column template: a person column, a week of days and a total.
const SHEET_DAYS = 7;
const SHEET_ROWS = [
  [1, 1, 1, 1, 0, 0, 0],
  [1, 0, 1, 1, 1, 0, 0],
  [0, 1, 1, 0, 1, 0, 0],
];

function SheetSkeleton() {
  const day = (filled: boolean, weekend: boolean, key: number, height = 'h-row') => (
    <div key={key} className={cn('flex flex-1 items-center justify-end px-2.5', height, weekend && 'bg-app')}>
      {filled ? <Skeleton className="h-3 w-12" /> : null}
    </div>
  );
  const weekend = (i: number) => i >= 5;
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="flex border-b">
        <div className="flex h-11 w-64 flex-none items-center border-r px-3 max-sm:w-32">
          <Skeleton className="h-3 w-12" />
        </div>
        {Array.from({ length: SHEET_DAYS }, (_, i) => day(true, weekend(i), i, 'h-11'))}
        <div className="flex h-11 w-32 flex-none items-center justify-end border-l px-2.5">
          <Skeleton className="h-3 w-10" />
        </div>
      </div>
      {SHEET_ROWS.map((row, r) => (
        <div key={r} className="flex border-b border-border-subtle">
          <div className="flex h-row w-64 flex-none items-center gap-2 border-r px-3 max-sm:w-32">
            <Skeleton className="size-5 flex-none rounded-full max-sm:hidden" />
            <Skeleton className="h-3 w-28" />
          </div>
          {row.map((filled, i) => day(Boolean(filled), weekend(i), i))}
          <div className="flex h-row w-32 flex-none items-center justify-end border-l px-2.5">
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
      <div className="flex">
        <div className="flex h-row w-64 flex-none items-center border-r px-3 max-sm:w-32">
          <Skeleton className="h-3 w-10" />
        </div>
        {Array.from({ length: SHEET_DAYS }, (_, i) => day(i < 5, weekend(i), i))}
        <div className="flex h-row w-32 flex-none items-center justify-end border-l px-2.5">
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </div>
  );
}

/** The route's loading state: the report page's header, scope controls and body, before its code arrives. */
export function ReportPageSkeleton({ shape = 'bars', controls = 3 }: { shape?: SkeletonShape; controls?: number }) {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading">
      <div className="flex min-h-10 items-center gap-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="ml-auto h-7 w-[136px]" />
      </div>
      <Skeleton className="h-control w-full" />
      <div className="flex flex-wrap gap-2">
        {[140, 158, 244, 120, 152].slice(0, controls).map(w => (
          <Skeleton key={w} className="h-7" style={{ width: w }} />
        ))}
      </div>
      <ReportSkeleton shape={shape} />
    </div>
  );
}
