'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { addCalendarDays, calendarDaysBetween, type WorkWeek } from '@nothingleft/format';
import type { GanttBar, GanttReport as Gantt } from '@nothingleft/types';
import { IssueKey } from '@components/issue-key';
import { IssueModal } from '@components/issues/issue-modal';
import { MemberAvatar } from '@components/issues/member-avatar';
import { StatusDot } from '@components/issues/value-marks';
import { ReportFrame } from '@components/reports/report-frame';
import { ReportEmptyState } from '@components/reports/report-states';
import { DrillLink, plural, ToggleGroup } from '@components/reports/report-bits';
import { useDefaultProject, useReportState } from '@components/reports/report-state';
import { ProjectPicker } from '@components/reports/scope-pickers';
import { ChartLegend, ChartTooltipBody } from '@components/reports/chart/chart-parts';
import { useReport } from '@hooks/use-reports';
import { useWorkWeek } from '@hooks/use-work-calendar';
import {
  formatCalendarDate,
  formatCalendarMonth,
  formatCalendarRange,
  formatCalendarWeekday,
  todayCalendarDate,
} from '@lib/datetime';
import { categoryFill, type MarkPaint } from '@lib/reports/colors';
import { cn } from '@lib/utils';

const ROW = 32;
const BAND = 28;
const BAR = 16;
const DAY_WIDTH = { week: 28, month: 10 } as const;
type Zoom = keyof typeof DAY_WIDTH;

const GROUPS = [
  { value: 'epic', label: 'Epic' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'none', label: 'None' },
] as const;

const HATCH = 'repeating-linear-gradient(135deg, var(--palette-gray-solid) 0 2px, var(--palette-gray-bg) 2px 5px)';
const OVERDUE = 'var(--palette-red-solid)';

const BAR_FILL = 'color-mix(in oklab, var(--text) 16%, var(--bg-surface))';

// A neutral bar with the status category on its left edge: the board's dot, stretched (owner, 27 Sep 2026).
function barStyle(bar: GanttBar, overdue: boolean): CSSProperties {
  const category = bar.status.category;
  const edge = category === 'cancelled' ? 'var(--palette-gray-solid)' : categoryFill(category);
  return {
    background: category === 'cancelled' ? HATCH : BAR_FILL,
    boxShadow: [`inset 4px 0 0 ${edge}`, overdue ? `inset -5px 0 0 ${OVERDUE}` : null].filter(Boolean).join(', '),
    opacity: category === 'backlog' ? 0.6 : 1,
  };
}

const paint = (fill: string, extra: Partial<MarkPaint> = {}): MarkPaint => ({
  fill,
  hatched: false,
  faded: false,
  ...extra,
});

const isOverdue = (bar: GanttBar, today: string) => !bar.resolved && bar.due_date !== null && bar.due_date < today;

export function GanttReport() {
  const state = useReportState('gantt');
  const project = useDefaultProject(state);
  const result = useReport('gantt', state.query, project !== null);
  const zoom: Zoom = state.params.get('zoom') === 'month' ? 'month' : 'week';

  return (
    <ReportFrame
      state={state}
      result={result}
      scope={{ query: true, projects: false, project: project ?? undefined }}
      controls={
        <>
          <ProjectPicker value={project ?? ''} onChange={key => state.set({ project: key })} />
          <ToggleGroup
            label="Group by"
            value={state.get('group_by')}
            options={GROUPS}
            onChange={v => state.set({ group_by: v })}
          />
        </>
      }
      display={
        <ToggleGroup
          label="Zoom"
          value={zoom}
          options={[
            { value: 'week', label: 'Days' },
            { value: 'month', label: 'Weeks' },
          ]}
          onChange={v => state.set({ zoom: v === 'month' ? 'month' : null })}
        />
      }
      skeleton="gantt"
      ownEmpty
      summary={d =>
        `${plural(d.bar_count, 'issue')} on the timeline in ${d.project.name}${
          d.range ? ` · ${formatCalendarRange(d.range.start, d.range.end)}` : ''
        }${d.dependencies.length ? ` · ${plural(d.dependencies.length, 'dependency', 'dependencies')}` : ''}.`
      }
    >
      {d => (
        <div className="flex flex-col gap-6">
          {d.empty ? (
            <ReportEmptyState
              empty={{ ...d.empty, filters: d.empty.filters.filter(f => f.kind !== 'projects') }}
              period={null}
              onChange={changes => state.set(changes, 'push')}
            />
          ) : (
            <GanttTimeline data={d} zoom={zoom} />
          )}
          <MissingDates data={d} />
        </div>
      )}
    </ReportFrame>
  );
}

interface Placed {
  bar: GanttBar;
  x: number;
  width: number;
  mid: number;
}

function useIssueModal() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const open = (key: string | null) => {
    const next = new URLSearchParams(params);
    if (key) next.set('issue', key);
    else next.delete('issue');
    const search = next.toString();
    router.push((search ? `${pathname}?${search}` : pathname) as Route, { scroll: false });
  };
  return { openKey: params.get('issue'), open };
}

const isWorking = (date: string, week: WorkWeek) => {
  const offset = (new Date(`${date}T00:00:00Z`).getUTCDay() - week.weekStartsOn + 7) % 7;
  return offset < week.workweekDays;
};

function GanttTimeline({ data, zoom }: { data: Gantt; zoom: Zoom }) {
  const week = useWorkWeek();
  const today = todayCalendarDate();
  const scroller = useRef<HTMLDivElement>(null);
  const modal = useIssueModal();
  const [hover, setHover] = useState<string | null>(null);
  const [tip, setTip] = useState<{ bar: GanttBar; x: number; y: number } | null>(null);
  const dayWidth = DAY_WIDTH[zoom];

  // Two days of air either side, so the first and last bars do not sit on the edge.
  const start = addCalendarDays(data.range!.start, -2);
  const end = addCalendarDays(data.range!.end, 3);
  const dayCount = calendarDaysBetween(start, end);
  const days = useMemo(() => Array.from({ length: dayCount }, (_, i) => addCalendarDays(start, i)), [start, dayCount]);
  const indexOf = (date: string) => calendarDaysBetween(start, date) - 1;
  const width = dayCount * dayWidth;

  const { rows, placed, height } = useMemo(() => {
    const placedBars = new Map<string, Placed>();
    const layout: ({ kind: 'band'; group: Gantt['groups'][number] } | { kind: 'bar'; bar: GanttBar })[] = [];
    let y = 0;
    for (const group of data.groups) {
      if (data.group_by !== 'none') {
        layout.push({ kind: 'band', group });
        y += BAND;
      }
      for (const bar of group.bars) {
        layout.push({ kind: 'bar', bar });
        const x = indexOf(bar.start_date!) * dayWidth + 2;
        const w = Math.max(dayWidth - 4, (indexOf(bar.due_date!) - indexOf(bar.start_date!) + 1) * dayWidth - 4);
        placedBars.set(bar.key, { bar, x, width: w, mid: y + ROW / 2 });
        y += ROW;
      }
    }
    return { rows: layout, placed: placedBars, height: y };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- indexOf depends only on start.
  }, [data, dayWidth, start]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const t = calendarDaysBetween(start, today) - 1;
    if (t > 0 && t < dayCount) el.scrollLeft = Math.max(0, t * dayWidth - el.clientWidth / 3);
  }, [start, today, dayCount, dayWidth]);

  const months = useMemo(() => {
    const out: { label: string; days: number }[] = [];
    for (const d of days) {
      const label = formatCalendarMonth(d);
      if (out.at(-1)?.label === label) out.at(-1)!.days += 1;
      else out.push({ label, days: 1 });
    }
    return out;
  }, [days]);

  const related = (key: string) =>
    hover !== null &&
    (key === hover ||
      data.dependencies.some(d => (d.from === hover && d.to === key) || (d.to === hover && d.from === key)));

  return (
    <div className="flex flex-col gap-3">
      <ChartLegend
        items={[
          { key: 'unstarted', label: 'Not started', paint: paint(categoryFill('unstarted')) },
          { key: 'started', label: 'Started', paint: paint(categoryFill('started')) },
          { key: 'done', label: 'Done', paint: paint(categoryFill('done')) },
          { key: 'cancelled', label: 'Cancelled', paint: paint('', { hatched: true }) },
          { key: 'overdue', label: 'Past its due date', paint: paint(OVERDUE) },
          { key: 'dep', label: 'Depends on', paint: paint('var(--text-muted)'), shape: 'line' },
          { key: 'conflict', label: 'Starts before its prerequisite ends', paint: paint(OVERDUE), shape: 'line' },
        ]}
      />
      <div className="relative grid grid-cols-[minmax(220px,320px)_minmax(0,1fr)] max-sm:grid-cols-[132px_minmax(0,1fr)] overflow-hidden rounded-md border text-sm">
        <div className="border-r">
          <div className="flex h-11 items-end border-b px-3 pb-1.5 text-xs text-text-muted">Issue</div>
          {rows.map(row =>
            row.kind === 'band' ? (
              <div
                key={`band-${row.group.value ?? row.group.label}`}
                className="flex items-center gap-2 border-b border-border-subtle bg-app px-3 text-xs font-medium text-text-secondary"
                style={{ height: BAND }}
              >
                <DrillLink query={row.group.query} className="truncate">
                  {row.group.label}
                </DrillLink>
                <span className="font-normal text-text-muted tabular">{row.group.bars.length}</span>
              </div>
            ) : (
              <div
                key={row.bar.key}
                className={cn(
                  'flex items-center gap-2.5 border-b border-border-subtle px-3',
                  related(row.bar.key) && 'bg-hover',
                )}
                style={{ height: ROW }}
                onPointerEnter={() => setHover(row.bar.key)}
                onPointerLeave={() => setHover(null)}
              >
                <Link href={`/issue/${row.bar.key}` as Route} className="w-16 flex-none hover:underline max-sm:w-auto">
                  <IssueKey issueKey={row.bar.key} resolved={row.bar.resolved} />
                </Link>
                <button
                  type="button"
                  onClick={() => modal.open(row.bar.key)}
                  className={cn(
                    'min-w-0 flex-1 truncate text-left hover:underline',
                    row.bar.resolved && 'text-text-muted',
                  )}
                >
                  {row.bar.title}
                </button>
                {row.bar.assignees[0] ? (
                  <MemberAvatar member={row.bar.assignees[0]} className="size-avatar-sm max-sm:hidden" />
                ) : null}
              </div>
            ),
          )}
        </div>

        <div ref={scroller} className="overflow-x-auto">
          <div style={{ width }}>
            <div className="h-11 border-b">
              <div className="flex h-[22px]">
                {months.map((m, i) => (
                  <span
                    key={`${m.label}-${i}`}
                    className="truncate border-l border-border-subtle px-1.5 pt-1 text-xs font-medium text-text-secondary first:border-l-0"
                    style={{ width: m.days * dayWidth }}
                  >
                    {m.days * dayWidth > 48 ? m.label : ''}
                  </span>
                ))}
              </div>
              <div className="flex h-[22px]">
                {days.map(d => {
                  const monday = new Date(`${d}T00:00:00Z`).getUTCDay() === week.weekStartsOn;
                  const label = zoom === 'week' ? String(Number(d.slice(8))) : monday ? String(Number(d.slice(8))) : '';
                  return (
                    <span
                      key={d}
                      className={cn(
                        'flex-none text-center text-2xs leading-[22px] tabular',
                        isWorking(d, week) ? 'text-text-muted' : 'text-text-disabled',
                        d === today && 'font-semibold text-text',
                        zoom === 'month' && 'overflow-visible text-left',
                      )}
                      style={{ width: dayWidth }}
                      aria-label={`${formatCalendarWeekday(d)} ${formatCalendarDate(d)}`}
                    >
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="relative" style={{ height }}>
              {days.map((d, i) =>
                isWorking(d, week) ? null : (
                  <div key={d} className="absolute inset-y-0 bg-app" style={{ left: i * dayWidth, width: dayWidth }} />
                ),
              )}
              {rows.map((row, i) => {
                const top = rows.slice(0, i).reduce((sum, r) => sum + (r.kind === 'band' ? BAND : ROW), 0);
                return (
                  <div
                    key={`line-${i}`}
                    className={cn(
                      'absolute inset-x-0 border-b border-border-subtle',
                      row.kind === 'band' && 'bg-app/60',
                    )}
                    style={{ top, height: row.kind === 'band' ? BAND : ROW }}
                  />
                );
              })}
              {calendarDaysBetween(start, today) > 0 && today <= end ? (
                <div
                  className="absolute inset-y-0 z-[3] w-px bg-text"
                  style={{ left: (calendarDaysBetween(start, today) - 1) * dayWidth + dayWidth / 2 }}
                  aria-hidden
                />
              ) : null}

              <svg
                className="pointer-events-none absolute inset-0 z-[1] overflow-visible"
                width={width}
                height={height}
                aria-hidden
              >
                <defs>
                  <marker
                    id="gantt-arrow"
                    viewBox="0 0 8 8"
                    refX="7"
                    refY="4"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto"
                  >
                    <path d="M0 0 8 4 0 8z" fill="var(--text-muted)" />
                  </marker>
                  <marker
                    id="gantt-arrow-conflict"
                    viewBox="0 0 8 8"
                    refX="7"
                    refY="4"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto"
                  >
                    <path d="M0 0 8 4 0 8z" fill={OVERDUE} />
                  </marker>
                  <marker
                    id="gantt-arrow-hover"
                    viewBox="0 0 8 8"
                    refX="7"
                    refY="4"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto"
                  >
                    <path d="M0 0 8 4 0 8z" fill="var(--text)" />
                  </marker>
                </defs>
                {data.dependencies.map(dep => {
                  const from = placed.get(dep.from);
                  const to = placed.get(dep.to);
                  if (!from || !to) return null;
                  const conflict = to.bar.start_date! <= from.bar.due_date!;
                  const x1 = from.x + from.width;
                  const x2 = to.x - 1;
                  const lane = to.mid - ROW / 2;
                  const d =
                    x2 - x1 < 16
                      ? `M${x1} ${from.mid} h8 V${lane} H${x2 - 10} V${to.mid} H${x2}`
                      : `M${x1} ${from.mid} h8 V${to.mid} H${x2}`;
                  const lit = hover !== null && (dep.from === hover || dep.to === hover);
                  const dim = hover !== null && !lit;
                  return (
                    <path
                      key={`${dep.from}-${dep.to}`}
                      d={d}
                      fill="none"
                      stroke={conflict ? OVERDUE : lit ? 'var(--text)' : 'var(--text-muted)'}
                      strokeWidth={lit ? 2 : 1.5}
                      strokeLinejoin="round"
                      opacity={dim ? 0.35 : 1}
                      markerEnd={`url(#${conflict ? 'gantt-arrow-conflict' : lit ? 'gantt-arrow-hover' : 'gantt-arrow'})`}
                    />
                  );
                })}
              </svg>

              {[...placed.values()].map(({ bar, x, width: w, mid }) => (
                <button
                  key={bar.key}
                  type="button"
                  aria-label={`${bar.key} ${bar.title}, ${formatCalendarRange(bar.start_date!, bar.due_date!)}`}
                  onClick={() => modal.open(bar.key)}
                  onPointerEnter={e => {
                    setHover(bar.key);
                    const frame = e.currentTarget.closest('.grid')!.getBoundingClientRect();
                    const box = e.currentTarget.getBoundingClientRect();
                    setTip({ bar, x: box.left - frame.left + Math.min(box.width, 240) / 2, y: box.top - frame.top });
                  }}
                  onPointerLeave={() => {
                    setHover(null);
                    setTip(null);
                  }}
                  className={cn(
                    'absolute z-[2] rounded-sm',
                    'hover:outline-2 hover:outline-offset-1 hover:outline-text focus-visible:outline-offset-1',
                    related(bar.key) && hover !== bar.key && 'outline-1 outline-offset-1 outline-text-muted',
                  )}
                  style={{
                    left: x,
                    top: mid - BAR / 2,
                    width: w,
                    height: BAR,
                    ...barStyle(bar, isOverdue(bar, today)),
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {tip ? (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full pb-1.5"
            style={{ left: tip.x, top: tip.y }}
          >
            <ChartTooltipBody
              title={`${tip.bar.key} ${tip.bar.title}`}
              rows={[]}
              note={[
                formatCalendarRange(tip.bar.start_date!, tip.bar.due_date!),
                tip.bar.status.name,
                isOverdue(tip.bar, today) ? 'past its due date' : null,
                tip.bar.assignees.map(a => a.name).join(', ') || 'Unassigned',
                tip.bar.depends_on.length ? `depends on ${tip.bar.depends_on.join(', ')}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          </div>
        ) : null}
      </div>
      {data.truncated ? (
        <p className="text-xs text-text-secondary">
          Only the first 500 bars are drawn. Narrow the query to see the rest.
        </p>
      ) : null}
      <IssueModal issueKey={modal.openKey} onClose={() => modal.open(null)} />
    </div>
  );
}

function missingText(bar: GanttBar) {
  if (!bar.start_date && !bar.due_date) return 'No start date, no due date';
  return bar.start_date ? 'No due date' : 'No start date';
}

/** Never dropped: a timeline that quietly omits half the work is worse than none. */
function MissingDates({ data }: { data: Gantt }) {
  const { missing } = data;
  if (missing.count === 0) {
    return <p className="text-xs text-text-secondary">Every issue here has both a start date and a due date.</p>;
  }
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium">
        {plural(missing.count, 'issue')} {missing.count === 1 ? 'has' : 'have'} no start or due date
      </h2>
      <p className="text-xs text-text-secondary">Give each a start date and a due date to put it on the timeline.</p>
      <div className="flex flex-col rounded-md border">
        {missing.issues.map(bar => (
          <div
            key={bar.key}
            className="grid h-row grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border-subtle px-3 last:border-b-0 md:grid-cols-[64px_minmax(0,1fr)_180px_140px_200px]"
          >
            <Link href={`/issue/${bar.key}` as Route} className="hover:underline">
              <IssueKey issueKey={bar.key} resolved={bar.resolved} />
            </Link>
            <span className={cn('truncate', bar.resolved && 'text-text-muted')}>{bar.title}</span>
            <span className="truncate text-xs text-text-secondary max-md:hidden">{bar.group}</span>
            <span className="flex items-center gap-2 text-xs text-text-secondary max-md:hidden">
              <StatusDot category={bar.status.category} color={bar.status.color} />
              {bar.status.name}
            </span>
            <span className="text-right text-xs text-text-muted">{missingText(bar)}</span>
          </div>
        ))}
      </div>
      {missing.truncated ? (
        <p className="text-xs text-text-secondary">The first 500 are listed; the count covers them all.</p>
      ) : null}
    </section>
  );
}
