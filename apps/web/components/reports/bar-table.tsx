'use client';

import type { ReactNode } from 'react';
import { ProjectMarkByKey } from '@components/projects/project-mark';
import { DrillLink, formatShare, PersonMark } from '@components/reports/report-bits';
import { cssPaint } from '@components/reports/chart/chart-parts';
import type { MarkPaint } from '@lib/reports/colors';
import { cn } from '@lib/utils';

export interface BarTableRow {
  key: string;
  label: string;
  amount: number;
  share: number;
  query: string | null;
  /** Null draws the bar in neutral ink: colour only where it carries meaning, such as a status. */
  paint: MarkPaint | null;
  /** Set when the rows are people; `nobody` is the empty group (Unassigned). */
  person?: { avatarUrl: string | null; nobody: boolean };
  /** Set when the rows are projects: the key whose mark sits beside the name. */
  projectKey?: string;
  /** Other: plain text, a lighter bar. */
  folded?: boolean;
}

export interface BarTableColumn<T> {
  heading: string;
  cell: (row: T) => ReactNode;
  total?: ReactNode;
}

/**
 * One row per group: name, bar, figure and share side by side, so the chart and its numbers are
 * read together instead of the same names listed twice.
 */
export function BarTable<T extends BarTableRow>({
  heading,
  amountHeading,
  rows,
  formatAmount,
  total,
  columns = [],
  amountClassName,
}: {
  heading: string;
  amountHeading: string;
  rows: readonly T[];
  formatAmount: (amount: number) => string;
  total: number;
  columns?: readonly BarTableColumn<T>[];
  /** Durations wear the mono face. */
  amountClassName?: string;
}) {
  const max = Math.max(1, ...rows.map(r => r.amount));
  const bar = (row: T, className: string) => (
    <span
      aria-hidden
      className={cn(
        'block min-w-0.5 rounded-r-[3px]',
        row.paint === null &&
          (row.folded ? 'bg-border-strong' : 'bg-text-muted transition-colors group-hover/row:bg-text-secondary'),
        className,
      )}
      style={{ width: `${(row.amount / max) * 100}%`, ...(row.paint ? cssPaint(row.paint) : {}) }}
    />
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm sm:min-w-[560px] [&_td:not(:first-child)]:tabular">
        <thead>
          <tr className="h-8 border-b text-right text-xs text-text-secondary">
            <th className="w-px pr-6 text-left font-medium whitespace-nowrap max-sm:w-full">{heading}</th>
            <th className="font-medium max-sm:hidden">
              <span className="sr-only">Bar</span>
            </th>
            <th className="w-20 pl-3 font-medium whitespace-nowrap">{amountHeading}</th>
            {columns.map(c => (
              <th key={c.heading} className="w-28 pl-3 font-medium whitespace-nowrap max-sm:hidden">
                {c.heading}
              </th>
            ))}
            <th className="w-20 pl-3 font-medium">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key} className="group/row h-row border-b border-border-subtle text-right hover:bg-hover">
              <td className="w-px pr-6 text-left max-sm:w-full max-sm:max-w-0 max-sm:py-2 max-sm:pr-3">
                <span className="flex w-max max-w-80 min-w-40 flex-col gap-1.5 max-sm:w-auto max-sm:max-w-none max-sm:min-w-0">
                  <span className="flex min-w-0 items-center gap-2">
                    {row.person ? (
                      <PersonMark name={row.label} avatarUrl={row.person.avatarUrl} nobody={row.person.nobody} />
                    ) : null}
                    {row.projectKey ? <ProjectMarkByKey projectKey={row.projectKey} /> : null}
                    <DrillLink
                      query={row.query}
                      className={cn('truncate', row.folded && 'text-text-secondary')}
                      title={row.label}
                    >
                      {row.label}
                    </DrillLink>
                  </span>
                  {bar(row, 'h-1 sm:hidden')}
                </span>
              </td>
              <td className="px-2 max-sm:hidden">
                <span className="flex h-3 items-center">{bar(row, 'h-3')}</span>
              </td>
              <td className={cn('pl-3 font-medium whitespace-nowrap max-sm:pt-2.5 max-sm:align-top', amountClassName)}>
                <DrillLink query={row.query}>{formatAmount(row.amount)}</DrillLink>
              </td>
              {columns.map(c => (
                <td key={c.heading} className="pl-3 whitespace-nowrap max-sm:hidden">
                  {c.cell(row)}
                </td>
              ))}
              <td className="pl-3 text-text-secondary max-sm:pt-2.5 max-sm:align-top">
                {formatShare(row.share, row.amount)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="h-row text-right font-medium">
            <td className="text-left">Total</td>
            <td className="max-sm:hidden" />
            <td className={cn('pl-3 whitespace-nowrap', amountClassName)}>{formatAmount(total)}</td>
            {columns.map(c => (
              <td key={c.heading} className="pl-3 whitespace-nowrap max-sm:hidden">
                {c.total ?? null}
              </td>
            ))}
            <td className="pl-3 text-text-secondary">100%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
