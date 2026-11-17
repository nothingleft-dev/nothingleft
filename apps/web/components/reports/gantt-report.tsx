'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
import { ReportPicker } from '@components/reports/report-picker';
import { ReportEmptyState } from '@components/reports/report-states';
import { DrillLink, plural, ToggleGroup } from '@components/reports/report-bits';
import { useDefaultProject, useNoProjects, useReportState } from '@components/reports/report-state';
import { ProjectPicker } from '@components/reports/scope-pickers';
import { ChartTooltipBody } from '@components/reports/chart/chart-parts';
import { EDGE_FADE_START } from '@components/reports/scroll-edges';
import { EmptyState } from '@components/empty-state';
import { useReport } from '@hooks/use-reports';
import { useWorkWeek } from '@hooks/use-work-calendar';
import {
  formatCalendarDate,
  formatCalendarMonth,
  formatCalendarRange,
  formatCalendarWeekday,
  todayCalendarDate,
} from '@lib/datetime';
import { categoryFill } from '@lib/reports/colors';
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

// The timeline runs on past the frame: its last 24 px fade out. The start keeps a shade instead, so the sticky
// status edges stay readable there.
const TIMELINE_FADE_END =
  'pointer-events-none absolute inset-y-0 right-0 z-[4] w-6 bg-linear-to-l from-surface to-transparent';

const HATCH = 'repeating-linear-gradient(135deg, var(--palette-gray-solid) 0 2px, var(--palette-gray-bg) 2px 5px)';
const OVERDUE = 'var(--palette-red-solid)';

// A step darker than the shaded non-working days, with a hairline that holds the bar's edge in both themes.
const BAR_FILL = 'color-mix(in oklab, var(--text) 22%, var(--bg-surface))';
const BAR_RIM = 'color-mix(in oklab, var(--text) 34%, var(--bg-surface))';

const edgeOf = (category: GanttBar['status']['category']) =>
  category === 'cancelled' ? 'var(--palette-gray-solid)' : categoryFill(category);

// A neutral bar with the status category on its left edge: the board's dot, stretched (owner, 27 Sep 2026).
function barStyle(category: GanttBar['status']['category'], overdue: boolean): CSSProperties {
  return {
    background: category === 'cancelled' ? HATCH : BAR_FILL,
    boxShadow: [`inset 0 0 0 1px ${BAR_RIM}`, overdue ? `inset -5px 0 0 ${OVERDUE}` : null].filter(Boolean).join(', '),
    opacity: category === 'backlog' ? 0.6 : 1,
  };
}

/** The legend's sample: a short bar drawn exactly as the timeline draws one. */
function KeyBar({ category, overdue = false }: { category: GanttBar['status']['category']; overdue?: boolean }) {
  return (
    <span
      aria-hidden
      className="relative inline-flex h-2.5 w-5 flex-none overflow-hidden rounded-[3px]"
      style={barStyle(category, overdue)}
    >
      <span className="w-1 flex-none" style={{ background: edgeOf(category) }} />
    </span>
  );
}

function GanttKey() {
  const item = (key: string, label: string, mark: ReactNode) => (
    <li key={key} className="inline-flex items-center gap-1.5">
      {mark}
      {label}
    </li>
  );
  const line = (colour: string) => (
    <i aria-hidden className="inline-block h-0.5 w-3 flex-none rounded-full" style={{ background: colour }} />
  );
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
      {item('unstarted', 'Not started', <KeyBar category="unstarted" />)}
      {item('started', 'Started', <KeyBar category="started" />)}
      {item('done', 'Done', <KeyBar category="done" />)}
      {item('cancelled', 'Cancelled', <KeyBar category="cancelled" />)}
      {item('overdue', 'Past its due date', <KeyBar category="started" overdue />)}
      {item('dep', 'Depends on', line('var(--text-muted)'))}
      {item('conflict', 'Starts before its prerequisite ends', line(OVERDUE))}
    </ul>
  );
}

const isOverdue = (bar: GanttBar, today: string) => !bar.resolved && bar.due_date !== null && bar.due_date < today;

export function GanttReport() {
  const state = useReportState('gantt');
  const project = useDefaultProject(state);
  const result = useReport('gantt', state.query, project !== null);
  const zoom: Zoom = state.params.get('zoom') === 'month' ? 'month' : 'week';
  const noProjects = useNoProjects();

  return (
    <ReportFrame
      state={state}
      result={result}
      scope={{ query: true, projects: false, project: project ?? undefined }}
      controls={
        <>
          <ProjectPicker value={project ?? ''} onChange={key => state.set({ project: key })} />
          <ReportPicker
            label="Group by"
            value={state.get('group_by')}
            options={GROUPS}
            width="w-44"
            onChange={v => state.set({ group_by: v })}
          />
        </>
      }
      display={
        result.data?.empty ? null : (
          <ToggleGroup
            label="Zoom"
            value={zoom}
            options={[
              { value: 'week', label: 'Days' },
              { value: 'month', label: 'Weeks' },
            ]}
            onChange={v => state.set({ zoom: v === 'month' ? 'month' : null })}
          />
        )
      }
      skeleton="gantt"
      blocked={
        noProjects ? (
          <EmptyState
            title="You are not in any project yet."
            description="A Gantt chart draws one project’s issues. Once an admin adds you to a project, its issues show up here."
          />
        ) : undefined
      }
      ownEmpty
      summary={d =>
        `${plural(d.bar_count, 'issue')} on the timeline in ${d.project.name}${
          d.range ? ` · ${formatCalendarRange(d.range.start, d.range.end).replaceAll(' ', '\u00a0')}` : ''
        }${d.dependencies.length ? ` · ${plural(d.dependencies.length, 'dependency', 'dependencies')}` : ''}.`
      }
    >
      {d => (
        <div className="flex flex-col gap-6">
          {d.empty?.reason === 'no_dates' ? (
            <p className="text-text-secondary">Nothing to draw yet.</p>
          ) : d.empty ? (
            <ReportEmptyState
              empty={{ ...d.empty, filters: d.empty.filters.filter(f => f.kind !== 'projects') }}
              period={null}
              onChange={changes => state.set(changes, 'push')}
            />
          ) : (
            <GanttTimeline data={d} zoom={zoom} />
          )}
          <MissingDates data={d} drawn={!d.empty || d.empty.reason === 'no_dates'} />
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

const scrollToX = (el: HTMLElement, left: number) => {
  el.scrollLeft = Math.max(0, left);
};

/** Where the timeline is scrolled to, and how wide its window is. */
function useView() {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ left: 0, width: 0, content: 0 });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setView(prev =>
      prev.left === el.scrollLeft && prev.width === el.clientWidth && prev.content === el.scrollWidth
        ? prev
        : { left: el.scrollLeft, width: el.clientWidth, content: el.scrollWidth },
    );
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [measure]);
  return { ref, view, measure };
}

function GanttTimeline({ data, zoom }: { data: Gantt; zoom: Zoom }) {
  const week = useWorkWeek();
  const today = todayCalendarDate();
  const { ref: scroller, view, measure } = useView();
  const modal = useIssueModal();
  const [hover, setHover] = useState<string | null>(null);
  const [tip, setTip] = useState<{ bar: GanttBar; x: number; y: number } | null>(null);

  // Two days of air either side, so the first and last bars do not sit on the edge.
  const start = addCalendarDays(data.range!.start, -2);
  const end = addCalendarDays(data.range!.end, 3);
  const dayCount = calendarDaysBetween(start, end);
  // A short range stretches to fill the frame rather than leaving its right side empty.
  const dayWidth = Math.max(DAY_WIDTH[zoom], view.width > 0 ? view.width / dayCount : 0);
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
    if (t > 0 && t < dayCount) scrollToX(el, t * dayWidth - el.clientWidth / 3);
    measure();
  }, [scroller, measure, start, today, dayCount, dayWidth]);

  const months = useMemo(() => {
    const out: { label: string; days: number }[] = [];
    for (const d of days) {
      const label = formatCalendarMonth(d);
      if (out.at(-1)?.label === label) out.at(-1)!.days += 1;
      else out.push({ label, days: 1 });
    }
    return out;
  }, [days]);

  // Keys are mono, so the longest one in characters sets the column and every title starts right after it.
  const keyWidth = `${Math.max(4, ...data.groups.flatMap(g => g.bars.map(b => b.key.length)))}ch`;

  const related = (key: string) =>
    hover !== null &&
    (key === hover ||
      data.dependencies.some(d => (d.from === hover && d.to === key) || (d.to === hover && d.from === key)));

  return (
    <div className="flex flex-col gap-3">
      <GanttKey />
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
                <Link
                  href={`/issue/${row.bar.key}` as Route}
                  className="flex-none font-mono text-2xs hover:underline max-sm:w-auto"
                  style={{ width: keyWidth }}
                >
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
                ) : (
                  <span
                    title="Unassigned"
                    className="size-avatar-sm flex-none rounded-full border border-dashed border-border-strong max-sm:hidden"
                  />
                )}
              </div>
            ),
          )}
        </div>

        <div className="relative min-w-0">
          <div ref={scroller} onScroll={measure} className="overflow-x-auto overscroll-x-contain">
            <div style={{ width }}>
              <div className="h-11 border-b">
                <div className="flex h-[22px]">
                  {months.map((m, i) => (
                    <span
                      key={`${m.label}-${i}`}
                      className="flex-none border-l border-border-subtle pt-1 text-xs font-medium whitespace-nowrap text-text-secondary first:border-l-0"
                      style={{ width: m.days * dayWidth }}
                    >
                      {/* Sticky inside its own month, so the month in view is always named. */}
                      {m.days * dayWidth > 72 ? (
                        <span className="sticky left-0 inline-block px-1.5">{m.label}</span>
                      ) : null}
                    </span>
                  ))}
                </div>
                <div className="flex h-[22px]">
                  {days.map(d => {
                    const monday = new Date(`${d}T00:00:00Z`).getUTCDay() === week.weekStartsOn;
                    const isToday = d === today;
                    const label = zoom === 'week' || monday || isToday ? String(Number(d.slice(8))) : '';
                    return (
                      <span
                        key={d}
                        className={cn(
                          'relative flex flex-none items-center justify-center text-2xs tabular',
                          'text-text-muted',
                          !isWorking(d, week) && 'bg-app',
                          zoom === 'month' && !isToday && 'justify-start overflow-visible whitespace-nowrap',
                        )}
                        style={{ width: dayWidth }}
                        aria-label={`${formatCalendarWeekday(d)} ${formatCalendarDate(d)}${isToday ? ', today' : ''}`}
                      >
                        {isToday ? (
                          <span className="z-[1] rounded-xs bg-text px-1 leading-4 font-semibold text-surface">
                            {label}
                          </span>
                        ) : (
                          label
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="relative" style={{ height }}>
                {days.map((d, i) =>
                  isWorking(d, week) ? null : (
                    <div
                      key={d}
                      className="absolute inset-y-0 bg-app"
                      style={{ left: i * dayWidth, width: dayWidth }}
                    />
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
                      ...barStyle(bar.status.category, isOverdue(bar, today)),
                    }}
                  >
                    {/* Sticky, so a bar that starts left of the window still shows its status at the window's edge. */}
                    <span
                      aria-hidden
                      className="sticky left-0 block h-full w-1 rounded-l-sm"
                      style={{ background: edgeOf(bar.status.category) }}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
          {view.left > 0 ? <div className={cn(EDGE_FADE_START, 'z-[4]')} /> : null}
          {view.left + view.width < view.content - 1 ? <div className={TIMELINE_FADE_END} /> : null}
          {view.width > 0
            ? [...placed.values()].map(({ bar, x, width: w, mid }) => {
                const before = x + w < view.left;
                const after = x > view.left + view.width;
                if (!before && !after) return null;
                const Icon = before ? ChevronLeft : ChevronRight;
                return (
                  <button
                    key={`off-${bar.key}`}
                    type="button"
                    aria-label={`${bar.key} is ${before ? 'earlier' : 'later'} on the timeline; scroll to it`}
                    title={formatCalendarRange(bar.start_date!, bar.due_date!)}
                    onClick={() =>
                      scroller.current?.scrollTo({ left: Math.max(0, x - view.width / 3), behavior: 'smooth' })
                    }
                    className={cn(
                      'absolute z-[5] flex size-5 items-center justify-center rounded-xs bg-surface text-text-muted hover:bg-hover hover:text-text',
                      before ? 'left-1' : 'right-1',
                    )}
                    style={{ top: 44 + mid - 10 }}
                  >
                    <Icon className="size-3.5" />
                  </button>
                );
              })
            : null}
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
function MissingDates({ data, drawn }: { data: Gantt; drawn: boolean }) {
  const { missing } = data;
  if (missing.count === 0) {
    return drawn ? (
      <p className="text-xs text-text-secondary">Every issue here has both a start date and a due date.</p>
    ) : null;
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
