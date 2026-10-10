'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import type { ImportDryRun, ImportField, ImportJob, ImportRowError } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Meter } from '@components/dashboard/meter';
import { cn } from '@lib/utils';
import { formatCount } from '@lib/numbers';

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

export const fieldLabel = (field: string) =>
  field in FIELD_LABELS ? FIELD_LABELS[field as ImportField] : field.replace(/^custom:/, '');

export const rows = (n: number) => `${formatCount(n)} ${n === 1 ? 'row' : 'rows'}`;
export const issues = (n: number) => `${formatCount(n)} ${n === 1 ? 'issue' : 'issues'}`;

export function Figures({ items }: { items: { label: string; value: number; tone?: 'danger' }[] }) {
  return (
    <dl className="flex flex-wrap divide-x border-y py-2">
      {items.map(item => (
        <div key={item.label} className="flex flex-col px-5 first:pl-0">
          <dd
            className={cn(
              'text-xl font-semibold tabular',
              item.tone === 'danger' && item.value > 0 && 'text-danger-fg',
            )}
          >
            {formatCount(item.value)}
          </dd>
          <dt className="text-2xs text-text-secondary">{item.label}</dt>
        </div>
      ))}
    </dl>
  );
}

export function UnknownValues({ project, values }: { project: string; values: ImportDryRun['unknown_values'] }) {
  if (values.length === 0) return null;
  const tabs = [...new Set(values.map(v => SETTINGS_TAB[v.field]).filter(Boolean))];
  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-medium">Values the project does not have</h3>
        <p className="text-sm text-text-secondary">
          Add each one to {project}, or replace it in the file; one fix clears every row that uses it.
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
                    {tab === 'statuses' ? 'Statuses' : tab === 'priorities' ? 'Priorities' : 'Types'}
                  </Link>
                </span>
              ))}
            </>
          ) : null}
        </p>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {values.map(v => (
          <li key={`${v.field}:${v.value}`} className="rounded-sm border px-2 py-0.5 text-xs text-text-secondary">
            {fieldLabel(v.field)} <span className="font-medium text-text">“{v.value}”</span>
            <span className="tabular text-text-secondary"> · {rows(v.rows)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SHOWN = 100;
const VALID_SHOWN = 6;

/** The failed rows as the spreadsheet numbers them, with the values that would have worked. */
export function ImportErrorsTable({ errors, failed }: { errors: ImportRowError[]; failed: number }) {
  const [all, setAll] = useState(false);
  if (errors.length === 0) return null;
  const shown = all ? errors : errors.slice(0, SHOWN);
  return (
    <div className="flex flex-col gap-2">
      <div className="max-h-[480px] overflow-auto rounded-md border">
        <table className="w-full min-w-[720px] table-fixed text-sm">
          <thead className="sticky top-0 bg-app text-left text-2xs text-text-secondary">
            <tr>
              <th className="h-7 w-16 px-3 text-right font-medium">Row</th>
              <th className="w-40 px-3 font-medium">Column</th>
              <th className="px-3 font-medium">Reason</th>
              <th className="w-[34%] px-3 font-medium">Valid values</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {shown.map((e, i) => (
              <tr key={`${e.row}:${e.column ?? ''}:${i}`} className="align-top">
                <td className="px-3 py-2 text-right font-mono text-xs tabular text-text-secondary">{e.row}</td>
                <td className="truncate px-3 py-2" title={e.column ?? undefined}>
                  {e.column ?? <span className="text-text-muted">Whole row</span>}
                </td>
                <td className="px-3 py-2 break-words">{e.message}</td>
                <td className="px-3 py-2">
                  <ValidValues values={e.valid_values ?? []} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-text-secondary">
        {errors.length > SHOWN && !all ? (
          <>
            Showing {SHOWN} of {formatCount(errors.length)}.{' '}
            <Button variant="link" className="h-auto p-0 text-xs" onClick={() => setAll(true)}>
              Show all
            </Button>
          </>
        ) : null}
        {failed > errors.length ? ` ${rows(failed)} failed; the first ${formatCount(errors.length)} are listed.` : null}
      </p>
    </div>
  );
}

function ValidValues({ values }: { values: string[] }) {
  const [open, setOpen] = useState(false);
  if (values.length === 0) return <span className="text-text-muted">—</span>;
  const shown = open ? values : values.slice(0, VALID_SHOWN);
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map(v => (
        <span key={v} className="rounded-xs bg-inset px-1.5 text-xs text-text-secondary">
          {v}
        </span>
      ))}
      {values.length > shown.length ? (
        <button type="button" className="text-xs text-text-secondary hover:text-text" onClick={() => setOpen(true)}>
          +{values.length - shown.length} more
        </button>
      ) : null}
    </span>
  );
}

export function ImportProgress({ job }: { job: ImportJob }) {
  const total = job.total_rows ?? 0;
  return (
    <div className="flex max-w-2xl flex-col gap-2">
      <Meter ratio={total > 0 ? job.processed_rows / total : 0} label="Rows imported" className="h-1.5" />
      <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 text-xs tabular text-text-secondary">
        <span>
          <span className="text-text">{formatCount(job.processed_rows)}</span> of {rows(total)}
        </span>
        <span>
          {issues(job.created_issues)} created · {formatCount(job.failed_rows)} failed
        </span>
      </div>
    </div>
  );
}
