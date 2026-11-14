'use client';

import type { ReactNode } from 'react';
import type { ReportEmpty, ReportFilter } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { FormAlert } from '@components/auth/form-alert';
import { LoadError } from '@components/query-state';
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
  widerPeriods = WIDER_PERIODS,
  className,
}: {
  empty: ReportEmpty;
  period: string | null;
  onChange: (changes: ReportChanges) => void;
  action?: ReactNode;
  widerPeriods?: readonly string[];
  className?: string;
}) {
  const widenings = empty.filters.flatMap(f => wideningsOf(f, period, widerPeriods));
  return (
    <div className={cn('flex flex-col items-start gap-3 rounded-md border border-dashed px-4 py-6', className)}>
      <p className="font-medium">{empty.message}</p>
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
                      className={SUGGESTION}
                      onClick={() => onPick(value)}
                    >
                      {formatValue(value)}
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

/** Shaped like the report it stands in for, so nothing moves when the figures arrive. */
export function ReportSkeleton({ shape }: { shape: SkeletonShape }) {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading the report">
      <div className="flex h-4 items-center">
        <Skeleton className="h-3 w-72" />
      </div>
      {shape === 'sheet' ? (
        <SheetSkeleton />
      ) : shape === 'bars' ? (
        <div className="flex flex-col gap-3">
          {[78, 64, 52, 41, 33, 22, 15, 9].map((w, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-3 w-28 flex-none" />
              <Skeleton className="h-4 rounded-r-sm" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      ) : shape === 'line' ? (
        <div className="flex h-72 items-end gap-2 border-b border-l px-2 pb-2">
          {Array.from({ length: 14 }, (_, i) => (
            <Skeleton key={i} className="flex-1" style={{ height: `${92 - i * 5}%`, opacity: 0.5 }} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border-subtle rounded-md border">
          {Array.from({ length: shape === 'gantt' ? 9 : 7 }, (_, i) => (
            <div key={i} className="flex h-row items-center gap-3 px-3">
              <Skeleton className="h-3 w-40 flex-none" />
              {shape === 'gantt' ? (
                <Skeleton
                  className="h-3"
                  style={{ marginLeft: `${(i * 7) % 40}%`, width: `${18 + ((i * 11) % 24)}%` }}
                />
              ) : (
                Array.from({ length: 6 }, (_, j) => <Skeleton key={j} className="h-3 flex-1" />)
              )}
            </div>
          ))}
        </div>
      )}
      {shape === 'bars' || shape === 'line' ? (
        <div className="flex flex-col divide-y divide-border-subtle rounded-md border">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex h-row items-center gap-3 px-3">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="ml-auto h-3 w-12" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      ) : null}
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
