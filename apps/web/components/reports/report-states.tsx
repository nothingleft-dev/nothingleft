'use client';

import type { ReactNode } from 'react';
import type { ReportEmpty, ReportFilter } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { FormAlert } from '@components/auth/form-alert';
import type { ReportChanges } from '@lib/reports/url';
import { EVERYONE } from '@lib/reports/url';
import { cn } from '@lib/utils';

interface Widening {
  label: string;
  changes: ReportChanges;
}

// A period is widened by a longer one, not dropped: dropping it means This week again.
const WIDER_PERIODS = ['This month', 'This year'] as const;

function wideningsOf(filter: ReportFilter, period: string | null): Widening[] {
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
      return WIDER_PERIODS.filter(p => p !== period).map(p => ({
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
  className,
}: {
  empty: ReportEmpty;
  period: string | null;
  onChange: (changes: ReportChanges) => void;
  action?: ReactNode;
  className?: string;
}) {
  const widenings = empty.filters.flatMap(f => wideningsOf(f, period));
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

export function ReportProblem({
  message,
  validValues,
  onPick,
}: {
  message: string;
  validValues: readonly string[];
  onPick?: (value: string) => void;
}) {
  return (
    <FormAlert title={message}>
      {validValues.length > 0 && onPick ? (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {validValues.slice(0, 24).map(value => (
            <button
              key={value}
              type="button"
              onClick={() => onPick(value)}
              className="h-6 rounded-sm border border-danger-fg/30 px-2 text-2xs font-medium hover:bg-danger-fg/10"
            >
              {value}
            </button>
          ))}
        </div>
      ) : null}
    </FormAlert>
  );
}

export function ReportFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <FormAlert title="The report could not be loaded.">
      <p>{message} Nothing was changed.</p>
      <Button variant="outline" size="xs" className="mt-2" onClick={onRetry}>
        Try again
      </Button>
    </FormAlert>
  );
}

export type SkeletonShape = 'bars' | 'grid' | 'line' | 'gantt' | 'sheet';

/** Shaped like the report it stands in for, so nothing moves when the figures arrive. */
export function ReportSkeleton({ shape }: { shape: SkeletonShape }) {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading the report">
      <Skeleton className="h-3 w-72" />
      {shape === 'bars' ? (
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
                Array.from({ length: shape === 'sheet' ? 9 : 6 }, (_, j) => <Skeleton key={j} className="h-3 flex-1" />)
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

export function ReportPageSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-control w-full" />
      <div className="flex gap-2">
        {[88, 112, 96].map(w => (
          <Skeleton key={w} className="h-7" style={{ width: w }} />
        ))}
      </div>
      <ReportSkeleton shape="bars" />
    </div>
  );
}
