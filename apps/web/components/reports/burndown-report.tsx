'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { ChevronRight } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDuration, type WorkCalendar } from '@nothingleft/format';
import type { BurndownReport as Burndown, Sprint } from '@nothingleft/types';
import { StatRow, type Stat } from '@components/dashboard/stat-row';
import { ReportFrame } from '@components/reports/report-frame';
import { ReportPicker } from '@components/reports/report-picker';
import { ToggleGroup, formatCount } from '@components/reports/report-bits';
import { useDefaultProject, useReportState } from '@components/reports/report-state';
import { ProjectPicker } from '@components/reports/scope-pickers';
import {
  AXIS_TICK,
  ChartLegend,
  ChartTooltipBody,
  durationTicks,
  niceTicks,
  type TooltipRow,
} from '@components/reports/chart/chart-parts';
import { useReport } from '@hooks/use-reports';
import { useSprints } from '@hooks/use-sprints';
import { formatCalendarDate, formatCalendarDateShort, formatCalendarRange, todayCalendarDate } from '@lib/datetime';
import type { MarkPaint } from '@lib/reports/colors';
import { burndownSprintParam } from '@lib/reports/url';
import { cn } from '@lib/utils';

const line = (fill: string): MarkPaint => ({ fill, hatched: false, faded: false });
const REMAINING = line('var(--chart-1)');
const SCOPE = line('var(--chart-2)');
const IDEAL = line('var(--chart-ideal)');

const SPRINT_GROUP: Record<Sprint['state'], string> = { active: 'Active', planned: 'Planned', completed: 'Completed' };
const MEASURES = [
  { value: 'story_points', label: 'Story points' },
  { value: 'issue_count', label: 'Issues' },
  { value: 'remaining_estimate', label: 'Remaining estimate' },
] as const;

const calendarOf = (data: Burndown): WorkCalendar => ({
  workdayMinutes: data.calendar.workday_minutes,
  workweekDays: data.calendar.workweek_days,
});

/** A figure in the report's unit: points to one decimal, issues whole, minutes as `1w 1d`. */
function formatter(data: Burndown) {
  const calendar = calendarOf(data);
  const format = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '--';
    // Scope can shrink, so a figure may be negative; the duration format has no sign of its own.
    if (value < 0) return `−${format(-value)}`;
    if (data.unit === 'minutes') return value === 0 ? '0m' : formatDuration(Math.round(value), calendar);
    return Number.isInteger(value) ? formatCount(value) : value.toFixed(1);
  };
  return format;
}

export function BurndownReport() {
  const state = useReportState('burndown');
  const project = useDefaultProject(state);
  const result = useReport('burndown', state.query, project !== null);
  const sprints = useSprints(project);
  const sprint = result.data?.sprint.slug ?? state.query.sprint ?? '';

  const sprintOptions = (sprints.data ?? [])
    .toSorted(
      (a, b) =>
        ['active', 'planned', 'completed'].indexOf(a.state) - ['active', 'planned', 'completed'].indexOf(b.state),
    )
    .map(s => ({ value: s.slug, label: s.name, group: SPRINT_GROUP[s.state] }));

  return (
    <ReportFrame
      state={state}
      result={result}
      scope={{ query: false, projects: false }}
      controls={
        <>
          <ProjectPicker value={project ?? ''} onChange={key => state.set({ project: key, sprint: null })} />
          <ReportPicker
            label="Sprint"
            value={sprint}
            fallback={sprint || 'Active sprint'}
            options={sprintOptions}
            loading={sprints.isPending && project !== null}
            searchable={sprintOptions.length > 8}
            disabled={project === null}
            onChange={slug => project && state.set({ sprint: burndownSprintParam(project, slug), project: null })}
          />
          <ToggleGroup
            label="Measure"
            value={state.get('measure')}
            options={MEASURES}
            onChange={measure => state.set({ measure })}
          />
        </>
      }
      pickValue={(field, value) =>
        field === 'sprint' && project
          ? state.set({ sprint: burndownSprintParam(project, value), project: null })
          : state.set({ [field]: value })
      }
      emptyAction={d =>
        d.sprint.state === 'planned' ? (
          <Link
            href={`/projects/${d.sprint.project.key}/backlog` as Route}
            className="text-xs font-medium text-brand-text hover:underline"
          >
            Start it from the backlog
          </Link>
        ) : null
      }
      skeleton="line"
      summary={d =>
        `${d.sprint.name} in ${d.sprint.project.name}${
          d.sprint.start_date && d.sprint.end_date
            ? ` · ${formatCalendarRange(d.sprint.start_date, d.sprint.end_date)}`
            : ''
        } · ${SPRINT_GROUP[d.sprint.state].toLowerCase()}`
      }
    >
      {d => <BurndownBody data={d} />}
    </ReportFrame>
  );
}

function BurndownBody({ data }: { data: Burndown }) {
  const format = formatter(data);
  const today = todayCalendarDate();
  const { summary } = data;
  const added = Math.round(summary.scope_added ?? 0);
  const daysLeft =
    data.sprint.state === 'active' && data.sprint.end_date
      ? Math.max(0, Math.round((Date.parse(data.sprint.end_date) - Date.parse(today)) / 86_400_000))
      : null;

  const stats: Stat[] = [
    { label: 'Committed at the start', value: format(summary.start_scope) },
    {
      label: 'Scope added since',
      value: (
        <span className={cn(added !== 0 && 'text-warning-fg')}>
          {added > 0 ? '+' : ''}
          {format(summary.scope_added)}
        </span>
      ),
    },
    { label: 'Completed', value: format(summary.completed) },
    { label: 'Remaining', value: format(summary.remaining) },
    data.sprint.state === 'completed' && data.sprint.completed_at
      ? { label: 'Finished', value: formatCalendarDateShort(data.sprint.completed_at.slice(0, 10)) }
      : { label: 'Days left', value: daysLeft ?? '--' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <StatRow stats={stats} />
      <ChartLegend
        items={[
          { key: 'remaining', label: 'Remaining', paint: REMAINING, shape: 'line' },
          { key: 'scope', label: 'Scope', paint: SCOPE, shape: 'line' },
          { key: 'ideal', label: 'Ideal', paint: IDEAL, shape: 'line' },
          { key: 'off', label: 'Non-working day', paint: line('var(--bg-inset)') },
        ]}
      />
      <BurndownChart data={data} today={today} />
      <DailyFigures data={data} />
    </div>
  );
}

function BurndownChart({ data, today }: { data: Burndown; today: string }) {
  const format = formatter(data);
  const peak = Math.max(1, ...data.days.flatMap(d => [d.remaining ?? 0, d.scope ?? 0, d.ideal ?? 0]));
  const ticks =
    data.unit === 'minutes' ? durationTicks(peak * 1.05, data.calendar.workday_minutes) : niceTicks(peak * 1.05);
  const top = ticks.at(-1)!;
  const rows = data.days.map(d => ({ ...d, shade: d.working_day ? null : top }));
  const showToday = data.sprint.state === 'active' && data.days.some(d => d.date === today);

  return (
    <ComposedChart
      data={rows}
      responsive
      style={{ width: '100%', height: 320 }}
      margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
      barCategoryGap={0}
      accessibilityLayer
    >
      <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
      <XAxis
        dataKey="date"
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={{ stroke: 'var(--border)' }}
        tickFormatter={(d: string) => formatCalendarDateShort(d)}
        minTickGap={24}
      />
      <YAxis
        domain={[0, top]}
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={false}
        width={data.unit === 'minutes' ? 56 : 40}
        allowDecimals={data.unit === 'points'}
        tickFormatter={(v: number) => format(v)}
        ticks={ticks}
      />
      <Bar dataKey="shade" fill="var(--bg-inset)" isAnimationActive={false} activeBar={false} />
      {showToday ? (
        <ReferenceLine
          x={today}
          stroke="var(--text)"
          strokeWidth={1}
          label={{ value: 'Today', position: 'insideTopRight', fill: 'var(--text-secondary)', fontSize: 12 }}
        />
      ) : null}
      <Line
        dataKey="ideal"
        stroke={IDEAL.fill}
        strokeWidth={1.5}
        strokeDasharray="4 4"
        dot={false}
        activeDot={false}
        isAnimationActive={false}
      />
      <Line
        dataKey="scope"
        type="stepAfter"
        stroke={SCOPE.fill}
        strokeWidth={2}
        dot={false}
        activeDot={{ r: 4, stroke: 'var(--bg-surface)', strokeWidth: 2 }}
        isAnimationActive={false}
      />
      <Line
        dataKey="remaining"
        stroke={REMAINING.fill}
        strokeWidth={2}
        strokeLinejoin="round"
        isAnimationActive={false}
        activeDot={{ r: 5, stroke: 'var(--bg-surface)', strokeWidth: 2 }}
        dot={({ cx, cy, payload, index }) =>
          cx === undefined || cy === undefined || payload.remaining === null ? (
            <g key={index} />
          ) : (
            <circle
              key={index}
              cx={cx}
              cy={cy}
              r={4}
              fill={payload.live ? 'var(--bg-surface)' : REMAINING.fill}
              stroke={payload.live ? REMAINING.fill : 'var(--bg-surface)'}
              strokeWidth={2}
            />
          )
        }
      />
      <Tooltip
        cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
        isAnimationActive={false}
        content={({ active, payload }) => {
          const day = active ? (payload?.[0]?.payload as (typeof rows)[number] | undefined) : undefined;
          if (!day) return null;
          const tooltipRows: TooltipRow[] = [
            { key: 'remaining', paint: REMAINING, value: format(day.remaining), label: 'remaining' },
            { key: 'scope', paint: SCOPE, value: format(day.scope), label: 'scope' },
            { key: 'ideal', paint: IDEAL, value: format(day.ideal), label: 'ideal' },
          ];
          const notes = [
            day.completed !== null ? `${format(day.completed)} completed` : null,
            day.scope_added
              ? `${day.scope_added > 0 ? '+' : ''}${format(day.scope_added)} scope since the start`
              : null,
            day.live ? 'Read live, not from a snapshot' : null,
            day.working_day ? null : 'Non-working day',
            day.remaining === null ? 'No figure recorded' : null,
          ].filter(Boolean);
          return (
            <ChartTooltipBody
              title={formatCalendarDate(day.date)}
              rows={tooltipRows}
              note={notes.join(' · ') || undefined}
            />
          );
        }}
      />
    </ComposedChart>
  );
}

function DailyFigures({ data }: { data: Burndown }) {
  const [open, setOpen] = useState(false);
  const format = formatter(data);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="flex h-7 items-center gap-1.5 rounded-sm px-1 text-xs font-medium text-text-secondary hover:text-text"
      >
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        Daily figures
      </button>
      {open ? (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead>
              <tr className="h-8 border-b text-right text-xs text-text-secondary">
                <th className="text-left font-medium">Day</th>
                <th className="font-medium">Remaining</th>
                <th className="font-medium">Ideal</th>
                <th className="font-medium">Scope</th>
                <th className="font-medium">Scope added</th>
                <th className="font-medium">Completed</th>
              </tr>
            </thead>
            <tbody>
              {data.days.map(d => (
                <tr
                  key={d.date}
                  className={cn('h-row border-b border-border-subtle text-right', !d.working_day && 'text-text-muted')}
                >
                  <td className="text-left">
                    {formatCalendarDate(d.date)}
                    {d.live ? <span className="ml-2 text-xs text-text-secondary">live</span> : null}
                  </td>
                  <td>{format(d.remaining)}</td>
                  <td>{format(d.ideal)}</td>
                  <td>{format(d.scope)}</td>
                  <td>
                    {d.scope_added ? `${d.scope_added > 0 ? '+' : ''}${format(d.scope_added)}` : format(d.scope_added)}
                  </td>
                  <td>{format(d.completed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
