'use client';

import type { WorkCalendar } from '@nothingleft/format';
import type { TimeReport as Time } from '@nothingleft/types';
import { BarTable, type BarTableColumn } from '@components/reports/bar-table';
import { PeriodPicker } from '@components/reports/period-picker';
import { ReportFrame } from '@components/reports/report-frame';
import { ReportPicker } from '@components/reports/report-picker';
import {
  calendarNote,
  DURATION_FACE,
  durationUnitOf,
  formatMinutes,
  HueNote,
  Minutes,
  plural,
  scopeText,
  UnitToggle,
  type DurationUnit,
} from '@components/reports/report-bits';
import { useReportState } from '@components/reports/report-state';
import { useReport } from '@hooks/use-reports';
import { useScopeAttributes, useScopeProjects } from '@hooks/use-report-scope';
import { formatCalendarRange } from '@lib/datetime';
import { markPaint, type MarkPaint } from '@lib/reports/colors';
import { cn } from '@lib/utils';

const GROUPS = [
  { value: 'work_type', label: 'Work type' },
  { value: 'user', label: 'Person' },
  { value: 'issue', label: 'Issue' },
  { value: 'project', label: 'Project' },
] as const;

const OTHER_NOUN: Record<string, readonly [string, string]> = {
  work_type: ['work type', 'work types'],
  user: ['person', 'people'],
  issue: ['issue', 'issues'],
  project: ['project', 'projects'],
};

const calendarOf = (data: Time): WorkCalendar => ({
  workdayMinutes: data.calendar.workday_minutes,
  workweekDays: data.calendar.workweek_days,
});

interface Row {
  key: string;
  label: string;
  amount: number;
  estimate: number | null;
  difference: number | null;
  share: number;
  query: string | null;
  paint: MarkPaint | null;
  folded: boolean;
  person?: { avatarUrl: string | null; nobody: boolean };
  projectKey?: string;
}

function rowsOf(data: Time): Row[] {
  const rows: Row[] = data.rows.map((r, i) => ({
    key: `${r.value ?? r.label}-${i}`,
    label: data.group_by === 'issue' && r.value ? `${r.value} ${r.label}` : r.label,
    amount: r.spent_minutes,
    // A project or issue whose estimate is zero has none: comparing logged time against it is noise.
    estimate: r.estimate_minutes || null,
    difference: r.estimate_minutes ? r.difference_minutes : null,
    share: r.share,
    query: r.query,
    // Colour only where it names something: a project's own; people and work types read by name.
    paint: data.group_by === 'project' && r.hue ? markPaint(r, 'project') : null,
    folded: false,
    ...(data.group_by === 'user' ? { person: { avatarUrl: r.avatar_url, nobody: false } } : {}),
    ...(data.group_by === 'project' && r.value ? { projectKey: r.value } : {}),
  }));
  // `other` also counts the listed rows without a series; only what lies beyond the 500 listed is missing here.
  const listed = data.rows.filter(r => r.series === null);
  const beyond = data.other
    ? {
        groups: data.other.groups - listed.length,
        minutes: data.other.spent_minutes - listed.reduce((sum, r) => sum + r.spent_minutes, 0),
      }
    : null;
  if (beyond && beyond.groups > 0) {
    const total = data.totals.spent_minutes || 1;
    rows.push({
      key: 'other',
      label: `Other · ${plural(beyond.groups, ...(OTHER_NOUN[data.group_by] ?? (['value', 'values'] as const)))}`,
      amount: beyond.minutes,
      estimate: null,
      difference: null,
      share: Math.round((beyond.minutes / total) * 1000) / 10,
      query: null,
      paint: null,
      folded: true,
    });
  }
  return rows;
}

export function TimeReport() {
  const state = useReportState('time');
  const result = useReport('time', state.query);
  const scope = useScopeProjects(state.get('projects').split(',').filter(Boolean));
  const attributes = useScopeAttributes(scope.keys, true);
  const groupBy = state.get('group_by');
  const unit = durationUnitOf(state.params.get('unit'));

  const options = [
    ...GROUPS,
    ...attributes.names.map(name => ({ value: `attribute:${name}`, label: name, group: 'Work item attributes' })),
  ];

  return (
    <ReportFrame
      state={state}
      result={result}
      scope={{ query: true, projects: true }}
      controls={
        <>
          <PeriodPicker
            value={{ period: state.params.get('period'), from: state.params.get('from'), to: state.params.get('to') }}
            resolved={result.isPlaceholderData ? null : (result.data?.scope.period ?? null)}
            pending={result.isPending || result.isPlaceholderData}
            onChange={v => state.set({ ...v })}
          />
          <ReportPicker
            label="Group by"
            value={groupBy}
            fallback={groupBy.replace(/^attribute:/, '')}
            options={options}
            onChange={v => state.set({ group_by: v })}
          />
        </>
      }
      display={<UnitToggle value={unit} onChange={u => state.set({ unit: u === 'duration' ? null : u })} />}
      skeleton="bars"
      summary={d => (
        <>
          <Minutes className="font-medium text-text">
            {formatMinutes(d.totals.spent_minutes, unit, calendarOf(d))}
          </Minutes>{' '}
          logged
          {d.scope.period ? ` ${formatCalendarRange(d.scope.period.from, d.scope.period.to)}` : ''} on issues{' '}
          {scopeText(d.scope, Boolean(state.get('projects')))}.
        </>
      )}
    >
      {d => {
        const rows = rowsOf(d);
        const calendar = calendarOf(d);
        const withEstimates = d.totals.estimate_minutes !== null;
        return (
          <div className="flex flex-col gap-3">
            <BarTable
              heading={GROUPS.find(g => g.value === d.group_by)?.label ?? 'Value'}
              amountHeading="Spent"
              rows={rows}
              formatAmount={m => formatMinutes(m, unit, calendar, { column: true })}
              amountClassName={DURATION_FACE}
              total={d.totals.spent_minutes}
              columns={withEstimates ? estimateColumns(d, unit, calendar) : []}
            />
            {d.truncated ? <p className="text-xs text-text-secondary">Only the first 500 groups are listed.</p> : null}
            <HueNote groups={d.rows} />
            <div className="flex flex-col gap-1 text-xs text-text-secondary">
              {withEstimates && d.estimate_sources.length > 0 ? (
                <p>{estimateSourcesText(d.estimate_sources)}</p>
              ) : (
                <p>
                  An estimate belongs to a whole issue, so a report by person or work type has none. Group by issue or
                  project to compare with estimates.
                </p>
              )}
              {unit !== 'hours' ? <p>{calendarNote(calendar)}</p> : null}
            </div>
          </div>
        );
      }}
    </ReportFrame>
  );
}

/** Which field each project's estimates come from, said once when every project uses the same one. */
function estimateSourcesText(sources: Time['estimate_sources']) {
  const fields = new Set(sources.map(s => s.field ?? 'Estimation'));
  if (fields.size === 1) {
    const [field] = fields;
    return sources.length === 1
      ? `Estimates come from ${sources[0]!.project.name}’s ${field} field.`
      : `Estimates come from each project’s ${field} field.`;
  }
  return `Estimates come from ${sources.map(s => `${s.project.name}: ${s.field ?? 'Estimation'}`).join(' · ')}.`;
}

function estimateColumns(data: Time, unit: DurationUnit, calendar: WorkCalendar): BarTableColumn<Row>[] {
  const format = (m: number) => formatMinutes(m, unit, calendar, { column: true });
  return [
    {
      heading: 'Estimate',
      cell: row =>
        row.estimate === null ? (
          <span className="text-text-muted">No estimate</span>
        ) : (
          <Minutes>{format(row.estimate)}</Minutes>
        ),
      total: data.totals.estimate_minutes ? (
        <Minutes>{format(data.totals.estimate_minutes)}</Minutes>
      ) : (
        <span className="text-text-muted">No estimate</span>
      ),
    },
    {
      heading: 'Difference',
      cell: row => <Difference minutes={row.estimate === null ? null : row.difference} format={format} />,
      total: (
        <Difference minutes={data.totals.estimate_minutes ? data.totals.difference_minutes : null} format={format} />
      ),
    },
  ];
}

function Difference({ minutes, format }: { minutes: number | null; format: (m: number) => string }) {
  if (minutes === null) return <span className="text-text-muted">–</span>;
  const over = minutes < 0;
  return (
    <Minutes className={cn(over && 'font-medium text-danger-fg')}>
      {over ? '−' : minutes > 0 ? '+' : ''}
      {format(Math.abs(minutes))}
    </Minutes>
  );
}
