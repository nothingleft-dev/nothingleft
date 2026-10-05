'use client';

import { useRouter } from 'next/navigation';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDuration, type WorkCalendar } from '@nothingleft/format';
import type { TimeReport as Time } from '@nothingleft/types';
import { Duration } from '@components/duration';
import { PeriodPicker } from '@components/reports/period-picker';
import { ReportFrame } from '@components/reports/report-frame';
import { ReportPicker } from '@components/reports/report-picker';
import { DrillLink, plural, scopeText } from '@components/reports/report-bits';
import { useReportState } from '@components/reports/report-state';
import {
  AXIS_TICK,
  CategoryTick,
  ChartTooltipBody,
  durationTicks,
  Swatch,
} from '@components/reports/chart/chart-parts';
import { useReport } from '@hooks/use-reports';
import { useScopeAttributes, useScopeProjects } from '@hooks/use-report-scope';
import { formatCalendarRange } from '@lib/datetime';
import { listHref } from '@lib/issue-list/links';
import { markPaint, OTHER_FILL, type MarkPaint } from '@lib/reports/colors';
import { cn } from '@lib/utils';

const GROUPS = [
  { value: 'work_type', label: 'Work type' },
  { value: 'user', label: 'Person' },
  { value: 'issue', label: 'Issue' },
  { value: 'project', label: 'Project' },
] as const;

const calendarOf = (data: Time): WorkCalendar => ({
  workdayMinutes: data.calendar.workday_minutes,
  workweekDays: data.calendar.workweek_days,
});

interface Row {
  key: string;
  label: string;
  spent: number;
  estimate: number | null;
  difference: number | null;
  share: number;
  query: string | null;
  paint: MarkPaint;
}

function rowsOf(data: Time): Row[] {
  const rows: Row[] = data.rows.map((r, i) => ({
    key: `${r.value ?? r.label}-${i}`,
    label: data.group_by === 'issue' && r.value ? `${r.value} ${r.label}` : r.label,
    spent: r.spent_minutes,
    estimate: r.estimate_minutes,
    difference: r.difference_minutes,
    share: r.share,
    query: r.query,
    paint: markPaint(r, 'series'),
  }));
  if (data.other) {
    const total = data.totals.spent_minutes || 1;
    rows.push({
      key: 'other',
      label: `Other · ${plural(data.other.groups, 'value')}`,
      spent: data.other.spent_minutes,
      estimate: null,
      difference: null,
      share: Math.round((data.other.spent_minutes / total) * 1000) / 10,
      query: null,
      paint: { fill: OTHER_FILL, hatched: false, faded: false },
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
            resolved={result.data?.scope.period ?? null}
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
      skeleton="bars"
      summary={d => (
        <>
          <Duration minutes={d.totals.spent_minutes} calendar={calendarOf(d)} className="text-text" /> logged
          {d.scope.period ? ` ${formatCalendarRange(d.scope.period.from, d.scope.period.to)}` : ''} on issues{' '}
          {scopeText(d.scope)}.
        </>
      )}
    >
      {d => {
        const rows = rowsOf(d);
        const withEstimates = d.totals.estimate_minutes !== null;
        return (
          <div className="flex flex-col gap-5">
            <TimeBars rows={rows} calendar={calendarOf(d)} />
            <TimeTable data={d} rows={rows} withEstimates={withEstimates} />
            {withEstimates && d.estimate_sources.length > 0 ? (
              <p className="text-xs text-text-secondary">
                Estimates come from{' '}
                {d.estimate_sources.map(s => `${s.project.name}: ${s.field ?? 'Estimation'}`).join(' · ')}.
              </p>
            ) : (
              <p className="text-xs text-text-secondary">
                An estimate belongs to a whole issue, so a report by person or work type shows none. Group by issue or
                project to compare with estimates.
              </p>
            )}
          </div>
        );
      }}
    </ReportFrame>
  );
}

function TimeBars({ rows, calendar }: { rows: readonly Row[]; calendar: WorkCalendar }) {
  const ticks = durationTicks(Math.max(1, ...rows.map(r => r.spent)), calendar.workdayMinutes);
  const router = useRouter();
  const format = (m: number) => (m === 0 ? '0m' : formatDuration(m, calendar));
  return (
    <BarChart
      layout="vertical"
      data={rows as Row[]}
      responsive
      style={{ width: '100%', height: rows.length * 32 + 36 }}
      margin={{ top: 4, right: 80, bottom: 4, left: 8 }}
      barCategoryGap={8}
      accessibilityLayer
    >
      <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
      <XAxis
        type="number"
        tick={AXIS_TICK}
        axisLine={false}
        tickLine={false}
        ticks={ticks}
        domain={[0, ticks.at(-1)!]}
        tickFormatter={(v: number) => format(v)}
      />
      <YAxis
        type="category"
        dataKey="label"
        width={200}
        tick={<CategoryTick />}
        axisLine={{ stroke: 'var(--border)' }}
        tickLine={false}
        interval={0}
      />
      <Tooltip
        cursor={{ fill: 'var(--bg-hover)' }}
        isAnimationActive={false}
        content={({ active, payload }) => {
          const row = active ? (payload?.[0]?.payload as Row | undefined) : undefined;
          if (!row) return null;
          const notes = [
            `${row.share}% of the total`,
            row.estimate !== null ? `estimate ${format(row.estimate)}` : null,
          ].filter(Boolean);
          return (
            <ChartTooltipBody
              title={row.label}
              rows={[{ key: row.key, paint: row.paint, value: format(row.spent), label: 'spent' }]}
              note={notes.join(' · ')}
            />
          );
        }}
      />
      <Bar dataKey="spent" maxBarSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false}>
        {rows.map(row => (
          <Cell
            key={row.key}
            fill={row.paint.fill}
            cursor={row.query ? 'pointer' : 'default'}
            onClick={() => row.query && router.push(listHref(row.query))}
          />
        ))}
        <LabelList
          dataKey="spent"
          position="right"
          fill="var(--text-secondary)"
          fontSize={12}
          fontFamily="var(--font-mono)"
          formatter={(v: unknown) => format(Number(v))}
        />
      </Bar>
    </BarChart>
  );
}

function Difference({ minutes, calendar }: { minutes: number | null; calendar: WorkCalendar }) {
  if (minutes === null) return <span className="text-text-muted">--</span>;
  const over = minutes < 0;
  return (
    <span className={cn('font-mono', over && 'font-medium text-danger-fg')}>
      {over ? '−' : minutes > 0 ? '+' : ''}
      {Math.abs(minutes) === 0 ? '0m' : formatDuration(Math.abs(minutes), calendar)}
    </span>
  );
}

function TimeTable({ data, rows, withEstimates }: { data: Time; rows: readonly Row[]; withEstimates: boolean }) {
  const calendar = calendarOf(data);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular">
        <thead>
          <tr className="h-8 border-b text-right text-xs text-text-secondary">
            <th className="text-left font-medium">{GROUPS.find(g => g.value === data.group_by)?.label ?? 'Value'}</th>
            <th className="w-28 font-medium">Spent</th>
            <th className="w-28 font-medium">Estimate</th>
            <th className="w-32 font-medium">Difference</th>
            <th className="w-40 font-medium">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key} className="h-row border-b border-border-subtle text-right">
              <td className="max-w-0 text-left">
                <span className="flex min-w-0 items-center gap-2">
                  <Swatch paint={row.paint} />
                  <DrillLink query={row.query} className="truncate">
                    {row.label}
                  </DrillLink>
                </span>
              </td>
              <td>
                <Duration minutes={row.spent} calendar={calendar} />
              </td>
              <td>
                {row.estimate === null ? (
                  <span className="text-text-muted">--</span>
                ) : (
                  <Duration minutes={row.estimate} calendar={calendar} />
                )}
              </td>
              <td>
                <Difference minutes={row.difference} calendar={calendar} />
              </td>
              <td>
                <span className="flex items-center justify-end gap-2">
                  <span className="h-1 w-16 overflow-hidden rounded-full bg-inset" aria-hidden>
                    <span className="block h-full rounded-full bg-text-muted" style={{ width: `${row.share}%` }} />
                  </span>
                  <span className="w-12 text-text-secondary">{row.share}%</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="h-row text-right font-medium">
            <td className="text-left">Total</td>
            <td>
              <Duration minutes={data.totals.spent_minutes} calendar={calendar} />
            </td>
            <td>
              {data.totals.estimate_minutes === null ? (
                <span className="text-text-muted">--</span>
              ) : (
                <Duration minutes={data.totals.estimate_minutes} calendar={calendar} />
              )}
            </td>
            <td>
              <Difference minutes={withEstimates ? data.totals.difference_minutes : null} calendar={calendar} />
            </td>
            <td className="text-text-secondary">100%</td>
          </tr>
        </tfoot>
      </table>
      {data.truncated ? (
        <p className="mt-2 text-xs text-text-secondary">Only the first 500 groups are listed.</p>
      ) : null}
    </div>
  );
}
