'use client';

import { Fragment, useState, type ReactNode } from 'react';
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

const DATE_FIELDS = new Set(['start_date', 'due_date']);

export const fieldLabel = (field: string) =>
  field in FIELD_LABELS ? FIELD_LABELS[field as ImportField] : field.replace(/^custom:/, '');

export const rows = (n: number) => `${formatCount(n)} ${n === 1 ? 'row' : 'rows'}`;
export const issues = (n: number) => `${formatCount(n)} ${n === 1 ? 'issue' : 'issues'}`;

const isUnknownValue = (e: ImportRowError) => e.code.startsWith('issue.unknown_');

export function Figures({ items }: { items: { label: string; value: number; tone?: 'danger' }[] }) {
  return (
    <dl className="flex flex-wrap divide-x border-y py-2">
      {items.map(item => (
        <div key={item.label} className="flex flex-col-reverse px-5 first:pl-0">
          <dt className="text-xs text-text-secondary">{item.label}</dt>
          <dd
            className={cn(
              'text-xl font-semibold tabular',
              item.value === 0 && 'text-text-muted',
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

const valueText = (field: string, value: string) => (field === 'assignees' ? `@${value}` : `“${value}”`);

/** Each value the project lacks, grouped by the file's column, with what that column accepts under it. */
export function UnknownValues({
  project,
  projectName,
  run,
}: {
  project: string;
  projectName: string;
  run: ImportDryRun;
}) {
  const values = run.unknown_values;
  if (values.length === 0) return null;
  const columnOf = new Map<string, string>();
  const accepts = new Map<string, string[]>();
  for (const e of run.errors) {
    if (!e.field) continue;
    if (e.column && !columnOf.has(e.field)) columnOf.set(e.field, e.column);
    if (e.valid_values?.length && !accepts.has(e.field)) accepts.set(e.field, e.valid_values);
  }
  const byField = new Map<string, typeof values>();
  for (const v of values) byField.set(v.field, [...(byField.get(v.field) ?? []), v]);
  const other = run.errors.length >= run.failed_rows ? run.errors.filter(e => !isUnknownValue(e)).length : 0;
  const tabs = [...new Set(values.map(v => SETTINGS_TAB[v.field]).filter(Boolean))] as string[];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <GroupHeading>Values {projectName} does not have</GroupHeading>
        <p className="max-w-[72ch] text-sm text-pretty text-text-secondary">
          Add each one to the project, or replace it in the file; one fix clears every row that uses it.
        </p>
        {tabs.length > 0 ? (
          <p className="mt-1.5 text-sm text-text-secondary">
            Edit in project settings:{' '}
            {tabs.map((tab, i) => (
              <Fragment key={tab}>
                {i > 0 ? ' · ' : null}
                <Link
                  className="action-link rounded-xs font-medium text-text-secondary hover:text-text"
                  href={`/projects/${project}/settings?tab=${tab}` as Route}
                >
                  {TAB_LABEL[tab]}
                </Link>
              </Fragment>
            ))}
          </p>
        ) : null}
      </div>
      <dl className="grid grid-cols-[7.5rem_minmax(0,max-content)_5rem_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm max-sm:grid-cols-[6rem_minmax(0,1fr)_auto]">
        {[...byField].map(([field, list]) => (
          <Fragment key={field}>
            {list.map((v, i) => (
              <Fragment key={v.value}>
                <dt className={cn('col-start-1 truncate text-text-secondary', i > 0 && 'invisible')}>
                  {columnOf.get(field) ?? fieldLabel(field)}
                </dt>
                <dd className="truncate font-medium" title={v.value}>
                  {valueText(field, v.value)}
                </dd>
                <dd className="text-right text-text-secondary tabular">{rows(v.rows)}</dd>
              </Fragment>
            ))}
            {accepts.has(field) ? (
              <dd className="col-start-2 col-end-[-1] mb-1.5 max-w-[72ch] text-pretty text-text-secondary [contain:inline-size]">
                Accepts {accepts.get(field)!.join(', ')}
              </dd>
            ) : null}
          </Fragment>
        ))}
        {other > 0 ? (
          <>
            <dt className="col-start-1 text-text-secondary">Other reasons</dt>
            <dd className="text-text-secondary">See the rows below</dd>
            <dd className="text-right text-text-secondary tabular">{rows(other)}</dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}

const PAGE = 100;

/** The failed rows as the spreadsheet numbers them. */
export function ImportErrorsTable({
  errors,
  failed,
  accepted = false,
}: {
  errors: ImportRowError[];
  failed: number;
  /** List what each column accepts above the rows, where no unknown-values summary already does. */
  accepted?: boolean;
}) {
  const [limit, setLimit] = useState(PAGE);
  if (errors.length === 0) return null;
  const shown = errors.slice(0, limit);
  const total = Math.max(failed, errors.length);
  const remaining = errors.length - shown.length;
  const progress = `Showing ${formatCount(shown.length)} of ${formatCount(total)} failed ${total === 1 ? 'row' : 'rows'}`;
  return (
    <div className="flex flex-col gap-3">
      <AcceptedValues errors={errors} values={accepted} />
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

/** Formats always; listed values only when asked, since the dry run lists them beside each unknown value. */
function AcceptedValues({ errors, values }: { errors: ImportRowError[]; values: boolean }) {
  const byColumn = new Map<string, string>();
  for (const e of errors) {
    const column = e.column ?? (e.field ? fieldLabel(e.field) : null);
    if (!column || byColumn.has(column)) continue;
    if (e.field && DATE_FIELDS.has(e.field) && e.code === 'import.invalid_value') {
      byColumn.set(column, 'A date as YYYY-MM-DD, e.g. 2026-11-30');
    } else if (values && e.valid_values?.length) {
      byColumn.set(column, e.valid_values.join(', '));
    }
  }
  if (byColumn.size === 0) return null;
  return (
    <dl className="grid grid-cols-[minmax(7.5rem,max-content)_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
      {[...byColumn].map(([column, accepts]) => (
        <div key={column} className="contents">
          <dt className="text-text-secondary">{column} accepts</dt>
          <dd className="max-w-[72ch] text-pretty">{accepts}</dd>
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

/** The figures every finished import shows, whatever its outcome. */
export function ResultFigures({ job }: { job: ImportJob }) {
  return (
    <Figures
      items={[
        { label: 'Rows', value: job.total_rows ?? job.processed_rows },
        { label: 'Created', value: job.created_issues },
        { label: 'Failed', value: job.failed_rows, tone: 'danger' },
        { label: 'Not reached', value: notReached(job) },
      ]}
    />
  );
}

/**
 * What a stopped import left behind, in the spreadsheet's row numbers (the header is row 1). The generic
 * stop reason only repeats the title, so only a specific one is shown.
 */
export function stoppedSummary(job: ImportJob) {
  const missed = notReached(job);
  const first = job.processed_rows + 2;
  const last = (job.total_rows ?? 0) + 1;
  const reason = job.error && job.error.code !== 'import.failed' ? job.error.message : null;
  const created =
    job.created_issues > 0
      ? `${issues(job.created_issues)} ${job.created_issues === 1 ? 'was' : 'were'} created and are kept.`
      : 'Nothing was created.';
  const span = missed === 1 ? `Row ${formatCount(first)}` : `Rows ${formatCount(first)}–${formatCount(last)}`;
  const failed = rows(job.failed_rows);
  const rest =
    missed > 0 && job.failed_rows > 0
      ? `${span} ${missed === 1 ? 'was' : 'were'} not reached; import ${missed === 1 ? 'it' : 'them'} and the ${failed} that failed, once fixed, from a new file.`
      : missed > 0
        ? `${span} ${missed === 1 ? 'was' : 'were'} not reached; import ${missed === 1 ? 'it' : 'them'} from a new file.`
        : job.failed_rows > 0
          ? `Fix the ${failed} that failed and import ${job.failed_rows === 1 ? 'it' : 'them'} from a new file.`
          : null;
  return [reason, created, rest].filter(Boolean).join(' ');
}
