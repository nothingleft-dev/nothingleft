'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import type { ImportDryRun, ImportField, ImportJob, ImportRowError } from '@nothingleft/types';
import { Meter } from '@components/dashboard/meter';
import { cn } from '@lib/utils';
import { formatCount } from '@lib/numbers';
import { LoadMore } from '@components/text-button';

export const FIELD_LABELS: Record<ImportField, string> = {
  title: 'Title',
  description: 'Description',
  status: 'Status',
  priority: 'Priority',
  type: 'Type',
  assignees: 'Assignees',
  estimate: 'Estimate',
  story_points: 'Story points',
  start_date: 'Start date',
  due_date: 'Due date',
  tags: 'Tags',
  sprint: 'Sprint',
  parent: 'Parent',
};

const SETTINGS_TAB: Partial<Record<string, string>> = { status: 'statuses', priority: 'priorities', type: 'types' };
const TAB_LABEL: Record<string, string> = { statuses: 'Statuses', priorities: 'Priorities', types: 'Types' };

export const fieldLabel = (field: string) =>
  field in FIELD_LABELS ? FIELD_LABELS[field as ImportField] : field.replace(/^custom:/, '');

export const rows = (n: number) => `${formatCount(n)} ${n === 1 ? 'row' : 'rows'}`;
export const issues = (n: number) => `${formatCount(n)} ${n === 1 ? 'issue' : 'issues'}`;

export function Figures({ items }: { items: { label: string; value: number; tone?: 'danger' }[] }) {
  return (
    <dl className="flex flex-wrap divide-x border-y py-2">
      {items.map(item => (
        <div key={item.label} className="flex flex-col-reverse px-5 first:pl-0">
          <dt className="text-xs text-text-secondary">{item.label}</dt>
          <dd
            className={cn(
              'text-xl font-semibold tabular',
              item.tone === 'danger' && item.value > 0 && 'text-danger-fg',
            )}
          >
            {formatCount(item.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function GroupHeading({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold">{children}</h3>;
}

export function UnknownValues({
  project,
  projectName,
  values,
}: {
  project: string;
  projectName: string;
  values: ImportDryRun['unknown_values'];
}) {
  if (values.length === 0) return null;
  const tabs = [...new Set(values.map(v => SETTINGS_TAB[v.field]).filter(Boolean))] as string[];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <GroupHeading>Values {projectName} does not have</GroupHeading>
        <p className="text-sm text-pretty text-text-secondary">
          Add each one to the project, or replace it in the file; one fix clears every row that uses it.
          {tabs.length > 0 ? (
            <>
              {' '}
              {tabs.map((tab, i) => (
                <span key={tab}>
                  {i > 0 ? ' · ' : null}
                  <Link
                    className="text-brand-text hover:underline"
                    href={`/projects/${project}/settings?tab=${tab}` as Route}
                  >
                    {TAB_LABEL[tab]}
                  </Link>
                </span>
              ))}
            </>
          ) : null}
        </p>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {values.map(v => (
          <li key={`${v.field}:${v.value}`} className="flex flex-wrap gap-x-2">
            <span className="text-text-secondary">{fieldLabel(v.field)}</span>
            <span className="font-medium">“{v.value}”</span>
            <span className="text-text-secondary tabular">{rows(v.rows)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const PAGE = 100;

/** The failed rows as the spreadsheet numbers them; what each column accepts is listed once above them. */
export function ImportErrorsTable({ errors, failed }: { errors: ImportRowError[]; failed: number }) {
  const [limit, setLimit] = useState(PAGE);
  if (errors.length === 0) return null;
  const shown = errors.slice(0, limit);
  const total = Math.max(failed, errors.length);
  const remaining = errors.length - shown.length;
  const progress = `Showing ${formatCount(shown.length)} of ${formatCount(total)} failed ${total === 1 ? 'row' : 'rows'}`;
  return (
    <div className="flex flex-col gap-3">
      <AcceptedValues errors={errors} />
      <div className="max-h-[480px] overflow-auto rounded-md border">
        <table className="w-full min-w-[560px] table-fixed text-sm">
          <thead className="sticky top-0 bg-app text-left text-xs text-text-secondary">
            <tr>
              <th className="h-7 w-16 px-3 text-right font-medium">Row</th>
              <th className="w-44 px-3 font-medium">Column</th>
              <th className="px-3 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {shown.map((e, i) => (
              <tr key={`${e.row}:${e.column ?? ''}:${i}`} className="align-baseline">
                <td className="px-3 py-2 text-right text-text-secondary tabular">{e.row}</td>
                <td className="truncate px-3 py-2" title={e.column ?? undefined}>
                  {e.column ?? <span className="text-text-secondary">Whole row</span>}
                </td>
                <td className="px-3 py-2 break-words">{e.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {remaining > 0 ? (
        <LoadMore onClick={() => setLimit(l => l + PAGE)} progress={progress}>
          Show {formatCount(Math.min(PAGE, remaining))} more
        </LoadMore>
      ) : total > shown.length ? (
        <p className="text-xs text-text-secondary tabular">
          {progress}. Only the first {formatCount(errors.length)} are kept.
        </p>
      ) : null}
    </div>
  );
}

function AcceptedValues({ errors }: { errors: ImportRowError[] }) {
  const byColumn = new Map<string, string[]>();
  for (const e of errors) {
    if (e.column && e.valid_values?.length && !byColumn.has(e.column)) byColumn.set(e.column, e.valid_values);
  }
  if (byColumn.size === 0) return null;
  return (
    <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
      {[...byColumn].map(([column, values]) => (
        <div key={column} className="contents">
          <dt className="text-text-secondary">{column} accepts</dt>
          <dd className="text-pretty">{values.join(', ')}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ImportProgress({ job }: { job: ImportJob }) {
  const total = job.total_rows ?? 0;
  return (
    <div className="flex flex-col gap-2">
      <Meter ratio={total > 0 ? job.processed_rows / total : 0} label="Rows imported" className="h-1.5" />
      <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 text-xs tabular text-text-secondary">
        <span>
          <span className="text-text">{formatCount(job.processed_rows)}</span> of {rows(total)}
        </span>
        <span>
          {formatCount(job.created_issues)} created ·{' '}
          <span className={cn(job.failed_rows > 0 && 'text-danger-fg')}>{formatCount(job.failed_rows)} failed</span>
        </span>
      </div>
    </div>
  );
}

/** Rows a stopped import never got to; they are in neither count. */
export const notReached = (job: ImportJob) => Math.max(0, (job.total_rows ?? 0) - job.processed_rows);
