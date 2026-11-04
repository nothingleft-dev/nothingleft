'use client';

import type { ReactNode } from 'react';
import { ProjectMarkByKey } from '@components/projects/project-mark';
import { DrillLink, PersonMark } from '@components/reports/report-bits';
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
}: {
  heading: string;
  amountHeading: string;
  rows: readonly T[];
  formatAmount: (amount: number) => string;
  total: number;
  columns?: readonly BarTableColumn<T>[];
}) {
  const max = Math.max(1, ...rows.map(r => r.amount));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm tabular">
        <thead>
          <tr className="h-8 border-b text-right text-xs text-text-secondary">
            <th className="w-[30%] text-left font-medium">{heading}</th>
            <th className="font-medium">
              <span className="sr-only">Bar</span>
            </th>
            <th className="w-28 font-medium">{amountHeading}</th>
            {columns.map(c => (
              <th key={c.heading} className="w-28 font-medium">
                {c.heading}
              </th>
            ))}
            <th className="w-20 font-medium">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key} className="group/row h-row border-b border-border-subtle text-right hover:bg-hover">
              <td className="max-w-0 pr-4 text-left">
                <span className="flex min-w-0 items-center gap-2">
                  {row.person ? (
                    <PersonMark name={row.label} avatarUrl={row.person.avatarUrl} nobody={row.person.nobody} />
                  ) : null}
                  {row.projectKey ? <ProjectMarkByKey projectKey={row.projectKey} /> : null}
                  <DrillLink query={row.query} className={cn('truncate', row.folded && 'text-text-secondary')}>
                    {row.label}
                  </DrillLink>
                </span>
              </td>
              <td className="px-2">
                <span className="flex h-3 items-center" aria-hidden>
                  <span
                    className={cn(
                      'block h-3 min-w-0.5 rounded-r-[3px]',
                      row.paint === null &&
                        (row.folded
                          ? 'bg-border-strong'
                          : 'bg-text-muted transition-colors group-hover/row:bg-text-secondary'),
                    )}
                    style={{ width: `${(row.amount / max) * 100}%`, ...(row.paint ? cssPaint(row.paint) : {}) }}
                  />
                </span>
              </td>
              <td className="font-medium">
                <DrillLink query={row.query}>{formatAmount(row.amount)}</DrillLink>
              </td>
              {columns.map(c => (
                <td key={c.heading}>{c.cell(row)}</td>
              ))}
              <td className="text-text-secondary">{row.share}%</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="h-row text-right font-medium">
            <td className="text-left">Total</td>
            <td />
            <td>{formatAmount(total)}</td>
            {columns.map(c => (
              <td key={c.heading}>{c.total ?? null}</td>
            ))}
            <td className="text-text-secondary">100%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
