'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { ChevronRight } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import type { WorkCalendar } from '@nothingleft/format';
import type { BurndownReport as Burndown, Sprint } from '@nothingleft/types';
import { StatRow, type Stat } from '@components/dashboard/stat-row';
import { ReportFrame } from '@components/reports/report-frame';
import { ReportPicker } from '@components/reports/report-picker';
import {
  calendarNote,
  durationUnitOf,
  formatCount,
  formatMinutes,
  ToggleGroup,
  UnitToggle,
  type DurationUnit,
} from '@components/reports/report-bits';
import { useDefaultProject, useNoProjects, useReportState } from '@components/reports/report-state';
import { EmptyState } from '@components/empty-state';
import { Button } from '@components/ui/button';
import { ProjectPicker } from '@components/reports/scope-pickers';
import {
  AXIS_TICK,
  ChartLegend,
  ChartTooltipBody,
  niceTicks,
  unitTicks,
  type TooltipRow,
} from '@components/reports/chart/chart-parts';
import { useReport } from '@hooks/use-reports';
import { useSprints } from '@hooks/use-sprints';
import { useProjects } from '@hooks/use-projects';
import { formatCalendarDate, formatCalendarDateShort, formatCalendarRange, todayCalendarDate } from '@lib/datetime';
import type { MarkPaint } from '@lib/reports/colors';
import { burndownSprintParam } from '@lib/reports/url';
import { cn } from '@lib/utils';
import { plural } from '@lib/numbers';

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

/** A figure in the report's unit: points to one decimal, issues whole, minutes in the viewer's unit. */
function formatter(data: Burndown, unit: DurationUnit) {
  const calendar = calendarOf(data);
  const format = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '–';
    if (value < 0) return `−${format(-value)}`;
    if (data.unit === 'minutes') return formatMinutes(value, unit, calendar);
    return Number.isInteger(value) ? formatCount(value) : value.toFixed(1);
  };
  return format;
}

/** The last day with a recorded figure: today's live one for a running sprint. */
const latestDay = (data: Burndown) => data.days.findLast(d => d.remaining !== null) ?? null;

export function BurndownReport() {
  const state = useReportState('burndown');
  const project = useDefaultProject(state);
  const result = useReport('burndown', state.query, project !== null);
  const sprints = useSprints(project);
  const sprint = result.data?.sprint.slug ?? state.query.sprint ?? '';
  const unit = durationUnitOf(state.params.get('unit'));
  const noProjects = useNoProjects();
  const projects = useProjects();
  const projectName = projects.data?.find(p => p.key === project)?.name;

  const STATES = ['active', 'planned', 'completed'];
  const list = sprints.data ?? [];
  // Completed sprints newest first: the one just finished is the one most often looked back on.
  const sprintOptions = list
    .map((s, i) => ({ s, i }))
    .toSorted(
      (a, b) =>
        STATES.indexOf(a.s.state) - STATES.indexOf(b.s.state) || (a.s.state === 'completed' ? b.i - a.i : a.i - b.i),
    )
    .map(({ s }) => ({ value: s.slug, label: s.name, group: SPRINT_GROUP[s.state] }));

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
      display={
        state.get('measure') === 'remaining_estimate' ? (
          <UnitToggle value={unit} onChange={u => state.set({ unit: u === 'duration' ? null : u })} />
        ) : null
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
      skeletonStats={['Remaining', 'Completed', 'Scope change since the start']}
      blocked={
        noProjects ? (
          <EmptyState
            title="You are not in any project yet."
            description="A burndown follows one project’s sprint. Once an admin adds you to a project, its sprints show up here."
          />
        ) : undefined
      }
      problemMessage={({ code, validValues }) =>
        code === 'report.no_active_sprint' && validValues.length === 0
          ? `${projectName ?? project} has no sprints yet. Plan one in the backlog and start it to follow its burndown.`
          : undefined
      }
      problemFixes={({ code, validValues }) =>
        code === 'report.no_active_sprint' && validValues.length === 0 && project ? (
          <Button variant="outline" size="xs" className="bg-surface text-text hover:bg-hover" asChild>
            <Link href={`/projects/${project}/backlog` as Route}>Plan a sprint in the backlog</Link>
          </Button>
        ) : null
      }
      summary={d =>
        `${d.sprint.name} in ${d.sprint.project.name}${
          d.sprint.start_date && d.sprint.end_date
            ? ` · ${formatCalendarRange(d.sprint.start_date, d.sprint.end_date)}`
            : ''
        } · ${SPRINT_GROUP[d.sprint.state].toLowerCase()}`
      }
    >
      {d => <BurndownBody data={d} unit={unit} onMeasure={measure => state.set({ measure })} />}
    </ReportFrame>
  );
}

/** Where the sprint stands against its plan, in a sentence: the question a burndown is opened to answer. */
function planSentence(data: Burndown, format: (v: number | null) => string) {
  const day = latestDay(data);
  if (!day || day.remaining === null || day.ideal === null) return null;
  const gap = day.remaining - day.ideal;
  const tolerance = Math.max(data.summary.start_scope ?? 0, 1) * 0.05;
  const when = day.live ? 'today' : `on ${formatCalendarDateShort(day.date)}`;
  if (Math.abs(gap) <= tolerance)
    return { tone: 'neutral', text: `On plan ${when}: ${format(day.remaining)} left, close to the ideal line.` };
  return gap > 0
    ? {
        tone: 'behind',
        text: `Behind plan by ${format(gap)} ${when}: ${format(day.remaining)} left where the ideal line is at ${format(day.ideal)}.`,
      }
    : {
        tone: 'ahead',
        text: `Ahead of plan by ${format(-gap)} ${when}: ${format(day.remaining)} left where the ideal line is at ${format(day.ideal)}.`,
      };
}

function BurndownBody({
  data,
  unit,
  onMeasure,
}: {
  data: Burndown;
  unit: DurationUnit;
  onMeasure: (measure: string) => void;
}) {
  const format = formatter(data, unit);
  if (data.unit === 'minutes' && data.days.every(d => !d.scope && !d.remaining)) {
    return (
      <EmptyState
        title="No issue in this sprint has an estimate, so there is no time to burn down."
        description="Estimate the sprint’s issues, or follow it by story points or by issues."
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="xs" onClick={() => onMeasure('story_points')}>
              Story points
            </Button>
            <Button variant="outline" size="xs" onClick={() => onMeasure('issue_count')}>
              Issues
            </Button>
          </div>
        }
      />
    );
  }
  const today = todayCalendarDate();
  const { summary } = data;
  const added = summary.scope_added ?? 0;
  const end = data.sprint.end_date;
  const daysTo = end ? Math.round((Date.parse(end) - Date.parse(today)) / 86_400_000) : null;
  const plan = planSentence(data, format);

  const stats: Stat[] = [
    { label: 'Remaining', value: format(summary.remaining) },
    { label: 'Completed', value: format(summary.completed) },
    {
      label: 'Scope change since the start',
      value: (
        <span className={cn(Math.round(added) !== 0 && 'text-warning-fg')}>
          {Math.round(added) === 0 ? format(0) : `${added > 0 ? '+' : ''}${format(added)}`}
        </span>
      ),
    },
  ];

  const timing =
    data.sprint.state === 'completed' && data.sprint.completed_at
      ? `Finished ${formatCalendarDateShort(data.sprint.completed_at.slice(0, 10))}`
      : data.sprint.state === 'active' && daysTo !== null && end
        ? daysTo > 0
          ? `${plural(daysTo, 'day')} left, ending ${formatCalendarDateShort(end)}`
          : daysTo === 0
            ? 'Ends today'
            : `Ended ${formatCalendarDateShort(end)}, ${-daysTo} ${daysTo === -1 ? 'day' : 'days'} ago, and still running`
        : null;

  return (
    <div className="flex flex-col gap-4">
      {plan ? (
        <p className={cn('text-base font-medium', plan.tone === 'behind' && 'text-warning-fg')}>{plan.text}</p>
      ) : null}
      <StatRow stats={stats} />
      <p className="text-xs text-text-secondary">
        Committed at the start: <span className="font-medium text-text tabular">{format(summary.start_scope)}</span>
        {timing ? ` · ${timing}` : null}
      </p>
      <ChartLegend
        items={[
          { key: 'remaining', label: 'Remaining', paint: REMAINING, shape: 'line' },
          { key: 'scope', label: 'Scope (total committed)', paint: SCOPE, shape: 'line' },
          { key: 'ideal', label: 'Ideal', paint: IDEAL, shape: 'line' },
          { key: 'off', label: 'Non-working day', paint: line('var(--chart-off-day)'), outlined: true },
          ...(data.days.some(d => d.remaining === null && d.date > (latestDay(data)?.date ?? ''))
            ? [{ key: 'ahead', label: 'Still to come', paint: line('var(--chart-future)'), outlined: true }]
            : []),
        ]}
      />
      <BurndownChart data={data} unit={unit} />
      {data.unit === 'minutes' && unit !== 'hours' ? (
        <p className="text-xs text-text-secondary">{calendarNote(calendarOf(data))}</p>
      ) : null}
      <DailyFigures data={data} unit={unit} />
    </div>
  );
}

function BurndownChart({ data, unit }: { data: Burndown; unit: DurationUnit }) {
  const format = formatter(data, unit);
  const peak = Math.max(1, ...data.days.flatMap(d => [d.remaining ?? 0, d.scope ?? 0, d.ideal ?? 0]));
  const ticks =
    data.unit === 'minutes'
      ? unitTicks(peak * 1.05, unit, calendarOf(data))
      : niceTicks(peak * 1.05, undefined, { minStep: data.unit === 'points' ? 0 : 1 });
  const top = ticks.at(-1)!;
  // The bridges join recorded days across a day with no figure (a missed nightly snapshot), dashed under the real lines.
  const rows = data.days.map(d => ({
    ...d,
    shade: d.working_day ? null : top,
    remainingBridge: d.remaining,
    scopeBridge: d.scope,
  }));
  // The live point is today in the snapshots' own days, which the viewer's calendar can be a day off.
  const today = data.days.find(d => d.live)?.date ?? null;
  const latest = latestDay(data);
  const lastIndex = latest ? data.days.indexOf(latest) : -1;
  const future = latest ? data.days.filter(d => d.date > latest.date) : [];

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
      <Bar dataKey="shade" fill="var(--chart-off-day)" isAnimationActive={false} activeBar={false} />
      {future.length > 0 ? (
        <ReferenceArea
          x1={future[0]!.date}
          x2={future.at(-1)!.date}
          fill="var(--chart-future)"
          fillOpacity={1}
          ifOverflow="extendDomain"
        />
      ) : null}
      {today ? (
        <ReferenceLine
          x={today}
          stroke="var(--border-strong)"
          strokeDasharray="2 3"
          label={{ value: 'Today', position: 'insideTopLeft', fill: 'var(--text-muted)', fontSize: 11 }}
        />
      ) : null}
      <Line
        dataKey="scopeBridge"
        type="stepAfter"
        stroke={SCOPE.fill}
        strokeWidth={1.5}
        strokeDasharray="3 3"
        connectNulls
        dot={false}
        activeDot={false}
        isAnimationActive={false}
      />
      <Line
        dataKey="remainingBridge"
        stroke={REMAINING.fill}
        strokeWidth={1.5}
        strokeDasharray="3 3"
        connectNulls
        dot={false}
        activeDot={false}
        isAnimationActive={false}
      />
      <Line
        dataKey="scope"
        type="stepAfter"
        stroke={SCOPE.fill}
        strokeWidth={1.5}
        dot={false}
        activeDot={{ r: 4, stroke: 'var(--bg-surface)', strokeWidth: 2 }}
        isAnimationActive={false}
      />
      <Line
        dataKey="remaining"
        stroke={REMAINING.fill}
        strokeWidth={2.5}
        strokeLinejoin="round"
        isAnimationActive={false}
        label={({ x, y, index }: { x?: number | string; y?: number | string; index?: number }) =>
          index === lastIndex && latest ? (
            <text
              key="latest"
              x={Number(x)}
              y={Number(y) - 12}
              textAnchor="middle"
              fill="var(--text)"
              fontSize={12}
              fontWeight={600}
              stroke="var(--bg-surface)"
              strokeWidth={4}
              paintOrder="stroke"
            >
              {format(latest.remaining)}
            </text>
          ) : (
            <g key={index} />
          )
        }
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
      {/* Drawn last, so the plan stays readable where the remaining line runs along it. */}
      <Line
        dataKey="ideal"
        stroke={IDEAL.fill}
        strokeWidth={2}
        strokeDasharray="6 4"
        dot={false}
        activeDot={false}
        isAnimationActive={false}
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
            day.completed !== null ? `${format(day.completed)} completed to date` : null,
            day.scope_added ? `${day.scope_added > 0 ? '+' : ''}${format(day.scope_added)} scope change to date` : null,
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

function DailyFigures({ data, unit }: { data: Burndown; unit: DurationUnit }) {
  const [open, setOpen] = useState(false);
  const format = formatter(data, unit);
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
                <th className="font-medium">Scope change to date</th>
                <th className="font-medium">Completed to date</th>
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
