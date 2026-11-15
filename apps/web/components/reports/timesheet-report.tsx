'use client';

import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDuration, type WorkCalendar } from '@nothingleft/format';
import type { MemberRef, ReportScope, TimesheetReport as Timesheet } from '@nothingleft/types';
import { RetryButton } from '@components/query-state';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@components/popover';
import { Duration } from '@components/duration';
import { IssueKey } from '@components/issue-key';
import { LetterBadge } from '@components/letter-badge';
import { PersonName } from '@components/former-member-chip';
import { MemberAvatar } from '@components/issues/member-avatar';
import { PeriodPicker, PERIOD_PRESETS } from '@components/reports/period-picker';
import { ReportFrame } from '@components/reports/report-frame';
import { ReportMultiPicker } from '@components/reports/report-picker';
import { plural } from '@components/reports/report-bits';
import { useReportState, type ReportState } from '@components/reports/report-state';
import { EDGE_END, EDGE_START, useScrollEdges } from '@components/reports/scroll-edges';
import { useMembers } from '@hooks/use-members';
import { useReport, useTimesheetWorkItems } from '@hooks/use-reports';
import { useSession } from '@hooks/use-session';
import { TIMESHEET_PAGE, type ReportQuery } from '@lib/api/reports';
import {
  formatCalendarDate,
  formatCalendarDateShort,
  formatCalendarRange,
  formatCalendarWeekday,
  todayCalendarDate,
} from '@lib/datetime';
import { EVERYONE } from '@lib/reports/url';
import { cn } from '@lib/utils';
import { LoadMore } from '@components/text-button';

const calendarOf = (data: Timesheet): WorkCalendar => ({
  workdayMinutes: data.calendar.workday_minutes,
  workweekDays: data.calendar.workweek_days,
});

// This year always exceeds the timesheet's 62-day limit, so it is neither offered nor suggested.
const PRESETS = PERIOD_PRESETS.filter(p => p !== 'This year');
const WIDER = ['This month'];

const PickerAvatar = ({ name, avatarUrl }: { name: string; avatarUrl: string | null }) => (
  <MemberAvatar member={{ name, avatar_url: avatarUrl }} className="size-5 flex-none" />
);

function PeoplePicker({ state }: { state: ReportState }) {
  const session = useSession();
  const slug = session.status === 'signed-in' ? session.user.current_organization_slug : null;
  const members = useMembers(slug, { limit: 200 });
  const raw = state.params.get('users');
  const values = raw === EVERYONE ? [] : raw ? raw.split(',').filter(Boolean) : ['me'];
  const me = session.status === 'signed-in' ? session.user : null;
  const options = [
    {
      value: 'me',
      label: 'Me',
      ...(me ? { mark: <PickerAvatar name={me.name} avatarUrl={me.avatar_url} /> } : {}),
    },
    ...(members.data ?? [])
      .filter(m => m.email === null || m.email !== me?.email)
      .map(m => ({
        value: m.username,
        label: m.name,
        group: 'People',
        mark: <PickerAvatar name={m.name} avatarUrl={m.avatar_url} />,
      })),
  ];
  return (
    <ReportMultiPicker
      label="People"
      values={values}
      options={options}
      loading={members.isPending}
      searchable
      onChange={next =>
        state.set({ users: next.length === 0 ? EVERYONE : next.join(',') === 'me' ? null : next.join(',') })
      }
      none="Everyone"
      many={n => `${n} people`}
      clearLabel="Everyone"
    />
  );
}

/** `Nimbus Live, Nimbus Mobile · saved view Bugs only`: what the figures cover, the chips already say how. */
function scopeNames(scope: ReportScope) {
  const names = scope.projects.map(p => p.name);
  const where =
    names.length <= 3 ? names.join(', ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more projects`;
  return [where, scope.view ? `saved view ${scope.view}` : null].filter(Boolean).join(' · ');
}

// `8-hour days, 5-day weeks`: what the `1d` and `1w` in the figures stand for.
function calendarNote(calendar: WorkCalendar, total: number) {
  const hours = `${Number((calendar.workdayMinutes / 60).toFixed(2))}-hour days`;
  return total >= calendar.workdayMinutes * calendar.workweekDays
    ? `${hours}, ${calendar.workweekDays}-day weeks`
    : hours;
}

function TimesheetSummary({ data, stale }: { data: Timesheet; stale: boolean }) {
  const calendar = calendarOf(data);
  const where = scopeNames(data.scope);
  const parts = [
    plural(data.rows.length, 'person', 'people'),
    data.scope.period ? (
      stale ? (
        <Skeleton className="inline-block h-3 w-24 align-middle" />
      ) : (
        formatCalendarRange(data.scope.period.from, data.scope.period.to)
      )
    ) : null,
    where || null,
    data.total >= calendar.workdayMinutes ? calendarNote(calendar, data.total) : null,
  ].filter(Boolean);
  return (
    <span
      className={cn(
        'flex max-w-[90ch] flex-wrap items-baseline gap-x-1.5 transition-opacity duration-(--dur-fast)',
        stale && 'opacity-50',
      )}
      inert={stale}
      aria-busy={stale}
    >
      <Duration minutes={data.total} calendar={calendar} className="text-sm font-semibold text-text" />
      {parts.map((part, i) => (
        <Fragment key={i}>
          <span aria-hidden>·</span>
          <span>{part}</span>
        </Fragment>
      ))}
    </span>
  );
}

export function TimesheetReport() {
  const state = useReportState('timesheet');
  const result = useReport('timesheet', state.query);

  return (
    <ReportFrame
      state={state}
      result={result}
      scope={{ query: true, projects: true }}
      widerPeriods={WIDER}
      controls={
        <>
          <PeriodPicker
            value={{ period: state.params.get('period'), from: state.params.get('from'), to: state.params.get('to') }}
            resolved={result.isPlaceholderData ? null : (result.data?.scope.period ?? null)}
            pending={result.isPending || result.isPlaceholderData}
            presets={PRESETS}
            onChange={v => state.set({ ...v })}
          />
          <PeoplePicker state={state} />
        </>
      }
      skeleton="sheet"
      summary={d => <TimesheetSummary data={d} stale={result.isPlaceholderData} />}
    >
      {d => (
        <>
          <TimesheetGrid data={d} scope={state.query} stale={result.isPlaceholderData} />
          <PeopleTotals data={d} scope={state.query} stale={result.isPlaceholderData} />
        </>
      )}
    </ReportFrame>
  );
}

interface Drill {
  member: MemberRef;
  from: string;
  to: string;
  minutes: number;
}

// JetBrains Mono's advance is 0.6em; at the table's 14px every character of a duration is 8.4px wide.
const MONO_CHAR_PX = 8.4;
const CELL_INSET_PX = 28;
const PERSON_PX = 256;
const NARROW_PERSON_PX = 176;
const NARROW_GRID_PX = 800;
const MIN_DAY_PX = 72;
const LONG_DAY_PX = 112;
const MIN_TOTAL_PX = 128;
const WEEK = 7;

const widthFor = (minutesList: readonly number[], calendar: WorkCalendar, floor: number) => {
  const chars = Math.max(0, ...minutesList.map(m => (m > 0 ? formatDuration(m, calendar).length : 2)));
  return Math.max(floor, Math.ceil(chars * MONO_CHAR_PX) + CELL_INSET_PX);
};

interface DayFit {
  dayPx: number;
  totalPx: number;
  visible: number;
}

/**
 * When the days overflow, a whole number of them fills the room between Person and Total, so a snapped scroll
 * never shows part of a day. Total takes the pixels left over.
 */
const personWidth = (width: number) => (width > 0 && width < NARROW_GRID_PX ? NARROW_PERSON_PX : PERSON_PX);

function fitDays(width: number, days: number, dayFloor: number, totalFloor: number): DayFit | null {
  const person = personWidth(width);
  const room = width - person - totalFloor;
  if (width === 0 || days * dayFloor <= room) return null;
  const visible = Math.max(1, Math.floor(room / dayFloor));
  const dayPx = Math.max(dayFloor, Math.floor(room / visible));
  return { dayPx, visible, totalPx: Math.max(totalFloor, width - person - visible * dayPx) };
}

/** The first column a long period opens on: all the logged days if they fit, nearest to today and the day after. */
function openingColumn(dayTotals: readonly number[], todayIndex: number, visible: number) {
  const lastStart = dayTotals.length - visible;
  const clamp = (n: number, lo = 0, hi = lastStart) => Math.min(Math.max(n, lo, 0), hi, lastStart);
  const nearToday = todayIndex >= 0 ? todayIndex + 2 - visible : null;
  const logged = dayTotals.flatMap((m, i) => (m > 0 ? [i] : []));
  const first = logged[0];
  const last = logged.at(-1);
  if (first === undefined || last === undefined) return clamp(nearToday ?? 0);
  if (last - first < visible) return clamp(nearToday ?? 0, last + 1 - visible, first);
  return clamp(nearToday !== null && dayTotals[todayIndex]! > 0 ? nearToday : first);
}

const CORNER = 'z-30 bg-surface';

function TimesheetGrid({ data, scope, stale }: { data: Timesheet; scope: ReportQuery; stale: boolean }) {
  const calendar = calendarOf(data);
  const today = todayCalendarDate();
  const period = data.scope.period;
  const { ref: scroller, edges, measure } = useScrollEdges();
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, [scroller]);

  const dayFloor = widthFor(
    [...data.day_totals, ...data.rows.flatMap(r => r.minutes)],
    calendar,
    data.days.length > WEEK ? LONG_DAY_PX : MIN_DAY_PX,
  );
  const totalFloor = widthFor([data.total, ...data.rows.map(r => r.total)], calendar, MIN_TOTAL_PX);
  const fit = fitDays(width, data.days.length, dayFloor, totalFloor);
  const totalPx = fit?.totalPx ?? totalFloor;
  const personPx = personWidth(width);
  const minWidth = personPx + data.days.length * (fit?.dayPx ?? dayFloor) + totalPx;

  // Keyed on the dates, not the response, so a refetch never moves a grid the reader has scrolled.
  const span = `${data.days[0]?.date}..${data.days.at(-1)?.date}`;
  const todayIndex = data.days.findIndex(day => day.date === today);
  const opening = fit ? openingColumn(data.day_totals, todayIndex, fit.visible) * fit.dayPx : 0;
  const opened = useRef<string | null>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || width === 0) return;
    if (opened.current !== span) {
      opened.current = span;
      el.scrollTo({ left: opening, behavior: 'instant' });
    }
    measure();
  }, [span, width, opening, scroller, measure]);

  const page = (direction: 1 | -1) => {
    if (fit) scroller.current?.scrollBy({ left: direction * Math.min(WEEK, fit.visible) * fit.dayPx });
  };

  const startEdge = cn('sticky left-0 border-r', edges.start && EDGE_START);
  const endEdge = cn('sticky right-0 border-l', edges.end && EDGE_END);

  return (
    <div
      ref={scroller}
      onScroll={measure}
      className={cn(
        'max-h-[max(22rem,calc(100dvh-17rem))] snap-x snap-mandatory scroll-pt-11 scroll-pb-9 overflow-auto overscroll-x-contain rounded-md border transition-opacity duration-(--dur-fast) motion-safe:scroll-smooth max-sm:hidden',
        stale && 'opacity-50',
      )}
      style={{ scrollPaddingLeft: personPx, scrollPaddingRight: totalPx }}
      inert={stale}
      aria-busy={stale}
    >
      <table
        className="w-full table-fixed border-separate border-spacing-0 text-sm whitespace-nowrap"
        style={{ minWidth }}
      >
        <colgroup>
          <col style={{ width: personPx }} />
          {data.days.map(day => (
            <col key={day.date} style={fit ? { width: fit.dayPx } : undefined} />
          ))}
          <col style={{ width: totalPx }} />
        </colgroup>
        <thead>
          <tr>
            <th
              className={cn(
                startEdge,
                CORNER,
                'top-0 h-11 border-b pr-2 pl-3 text-left text-xs font-normal text-text-secondary',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                Person
                {fit ? (
                  <span className="flex gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Earlier days"
                      title="Earlier days"
                      disabled={!edges.start}
                      onClick={() => page(-1)}
                    >
                      <ChevronLeft className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Later days"
                      title="Later days"
                      disabled={!edges.end}
                      onClick={() => page(1)}
                    >
                      <ChevronRight className="size-3.5" />
                    </Button>
                  </span>
                ) : null}
              </span>
            </th>
            {data.days.map(day => (
              <th
                key={day.date}
                data-day={day.date}
                className={cn(
                  'sticky top-0 z-20 h-11 snap-start border-b px-2.5 text-right text-2xs font-normal text-text-secondary tabular',
                  day.working_day ? 'bg-surface' : 'bg-app',
                  day.date === today && 'text-text',
                )}
              >
                <span className="block">{formatCalendarWeekday(day.date)}</span>
                <span className={cn('block text-xs', day.date === today ? 'font-semibold' : 'text-text-secondary')}>
                  {formatCalendarDateShort(day.date)}
                </span>
              </th>
            ))}
            <th className={cn(endEdge, CORNER, 'top-0 h-11 border-b px-2.5 text-right text-xs font-semibold')}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map(row => (
            <tr key={row.member.username} className="[&:last-child>*]:border-b-0">
              <th
                title={row.member.name}
                className={cn(
                  startEdge,
                  'z-10 h-row border-b border-b-border-subtle bg-surface px-3 text-left font-normal',
                )}
              >
                <PersonLabel member={row.member} />
              </th>
              {row.minutes.map((minutes, i) => {
                const day = data.days[i]!;
                return (
                  <td
                    key={day.date}
                    className={cn(
                      'h-row border-b border-b-border-subtle p-0.5 text-right',
                      !day.working_day && 'bg-app',
                    )}
                  >
                    {minutes > 0 ? (
                      <DrillCell
                        drill={{ member: row.member, from: day.date, to: day.date, minutes }}
                        scope={scope}
                        calendar={calendar}
                        disabled={stale}
                        align="start"
                      />
                    ) : null}
                  </td>
                );
              })}
              <td
                className={cn(
                  endEdge,
                  'z-10 h-row border-b border-b-border-subtle bg-surface p-0.5 text-right font-medium',
                )}
              >
                {row.total > 0 && period ? (
                  <DrillCell
                    drill={{ member: row.member, from: period.from, to: period.to, minutes: row.total }}
                    scope={scope}
                    calendar={calendar}
                    disabled={stale}
                    align="end"
                  />
                ) : (
                  <span className="px-2 font-mono text-text-muted tabular">0m</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th className={cn(startEdge, CORNER, 'bottom-0 h-row border-t px-3 text-left font-semibold')}>Total</th>
            {data.day_totals.map((minutes, i) => (
              <td
                key={data.days[i]!.date}
                className={cn(
                  'sticky bottom-0 z-20 h-row border-t px-2.5 text-right font-medium',
                  data.days[i]!.working_day ? 'bg-surface' : 'bg-app',
                )}
              >
                {minutes > 0 ? <Duration minutes={minutes} calendar={calendar} /> : null}
              </td>
            ))}
            <td className={cn(endEdge, CORNER, 'bottom-0 h-row border-t px-2.5 text-right font-semibold')}>
              <Duration minutes={data.total} calendar={calendar} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const PersonLabel = ({ member }: { member: MemberRef }) => (
  <span className="flex min-w-0 items-center gap-2">
    <MemberAvatar member={member} className="size-avatar-sm flex-none" />
    <PersonName person={member} className="min-w-0" />
  </span>
);

/** On a phone a day column does not fit beside the names, so each person's total opens their entries instead. */
function PeopleTotals({ data, scope, stale }: { data: Timesheet; scope: ReportQuery; stale: boolean }) {
  const calendar = calendarOf(data);
  const period = data.scope.period;
  return (
    <div
      className={cn(
        'rounded-md border text-sm transition-opacity duration-(--dur-fast) sm:hidden',
        stale && 'opacity-50',
      )}
      inert={stale}
      aria-busy={stale}
    >
      <div className="flex h-9 items-center justify-between border-b px-3 text-xs text-text-secondary">
        <span>Person</span>
        <span className="font-semibold text-text">Total</span>
      </div>
      <ul aria-label="Time by person" className="divide-y divide-border-subtle">
        {data.rows.map(row => (
          <li key={row.member.username} className="p-0.5">
            {row.total > 0 && period ? (
              <DrillCell
                drill={{ member: row.member, from: period.from, to: period.to, minutes: row.total }}
                scope={scope}
                calendar={calendar}
                disabled={stale}
                align="end"
                label={<PersonLabel member={row.member} />}
                className="h-10 justify-between gap-3 px-2.5 font-medium"
              />
            ) : (
              <span className="flex h-10 items-center justify-between gap-3 px-2.5">
                <PersonLabel member={row.member} />
                <span className="font-mono text-text-muted tabular">0m</span>
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="flex h-row items-center justify-between border-t px-3 font-semibold">
        <span>Total</span>
        <Duration minutes={data.total} calendar={calendar} />
      </div>
    </div>
  );
}

function DrillCell({
  drill,
  scope,
  calendar,
  align,
  label,
  className,
  disabled,
}: {
  drill: Drill;
  scope: ReportQuery;
  calendar: WorkCalendar;
  align: 'start' | 'end';
  label?: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`${drill.member.name}, ${formatCalendarRange(drill.from, drill.to)}: the time entries`}
          className={cn(
            'flex h-8 w-full items-center justify-end rounded-xs px-2 hover:bg-hover',
            open && 'bg-active',
            className,
          )}
        >
          {label}
          <Duration minutes={drill.minutes} calendar={calendar} className="flex-none whitespace-nowrap" />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} collisionPadding={16} className="w-[440px] max-w-[calc(100vw-32px)] p-0">
        {open ? <WorkItems drill={drill} scope={scope} calendar={calendar} /> : null}
      </PopoverContent>
    </Popover>
  );
}

// A cell names its own person and days; the report's period and people give way to them.
const PERIOD_AND_PEOPLE = new Set(['period', 'from', 'to', 'users']);

// Key, title with its badges, duration: one row per entry, the columns shared across rows.
const ENTRY_GRID = 'grid grid-cols-[max-content_minmax(0,1fr)_auto] gap-x-2';
const ENTRY_ROW = 'col-span-full grid grid-cols-subgrid items-center gap-y-0.5 px-3 py-2';

function WorkItems({ drill, scope, calendar }: { drill: Drill; scope: ReportQuery; calendar: WorkCalendar }) {
  const rest = Object.fromEntries(Object.entries(scope).filter(([key]) => !PERIOD_AND_PEOPLE.has(key)));
  const items = useTimesheetWorkItems({ ...rest, user: drill.member.username, from: drill.from, to: drill.to });
  const rows = items.data?.pages.flatMap(p => p.data) ?? [];
  const total = items.data?.pages.at(-1)?.meta.pagination?.total ?? rows.length;
  const single = drill.from === drill.to;
  const when = single ? formatCalendarDate(drill.from) : formatCalendarRange(drill.from, drill.to);

  return (
    <div className="flex max-h-[min(60vh,440px)] flex-col">
      <div className="flex items-baseline gap-2 border-b px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate font-medium">
          {drill.member.name} · {when}
        </span>
        <Duration minutes={drill.minutes} calendar={calendar} className="font-semibold" />
      </div>
      <div className="scroll-fade min-h-0 flex-1 overflow-y-auto">
        {items.isPending ? (
          <div className={ENTRY_GRID} aria-hidden>
            {[60, 80, 48].map((w, i) => (
              <div key={i} className={cn(ENTRY_ROW, single ? 'min-h-9' : 'min-h-[3.625rem]')}>
                <Skeleton className="h-3 w-12" />
                <span className="flex items-center gap-2">
                  <Skeleton className="h-3" style={{ width: `${w}%` }} />
                  <Skeleton className="size-4 flex-none" />
                </span>
                <Skeleton className="h-3 w-10" />
                {single ? null : <Skeleton className="col-start-2 h-3 w-16" />}
              </div>
            ))}
          </div>
        ) : items.isError && !items.data ? (
          <div className="flex items-center gap-3 px-3 py-3">
            <p className="min-w-0 flex-1 text-xs text-danger-fg">
              Could not load {drill.member.name}’s entries for {when}.
            </p>
            <RetryButton onRetry={() => void items.refetch()} size="xs" />
          </div>
        ) : (
          <ul className={cn(ENTRY_GRID, 'divide-y divide-border-subtle')}>
            {rows.map(item => {
              const note = item.description_md?.split('\n')[0]?.trim() ?? '';
              return (
                <li key={item.id} className={ENTRY_ROW}>
                  <Link
                    href={`/issue/${item.issue}` as Route}
                    className="group col-span-2 grid grid-cols-subgrid items-center"
                  >
                    <IssueKey issueKey={item.issue} />
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 truncate group-hover:underline">{item.issue_title}</span>
                      {item.work_type || item.attributes.length > 0 ? (
                        <span className="flex flex-none items-center gap-1">
                          {item.work_type ? (
                            <LetterBadge
                              letter={item.work_type.short_label}
                              label={item.work_type.name}
                              variant="outlined"
                            />
                          ) : null}
                          {item.attributes.map(a => (
                            <LetterBadge
                              key={a.attribute}
                              letter={a.value.short_label}
                              label={`${a.attribute}: ${a.value.name}`}
                              variant="outlined"
                            />
                          ))}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                  <Duration minutes={item.duration_minutes} calendar={calendar} className="text-right" />
                  {!single || note ? (
                    <span className="col-span-2 col-start-2 flex min-w-0 gap-1.5 text-xs text-text-secondary">
                      {!single ? (
                        <span className="flex-none tabular">{formatCalendarDateShort(item.work_date)}</span>
                      ) : null}
                      {!single && note ? <span aria-hidden>·</span> : null}
                      {note ? <span className="truncate">{note}</span> : null}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {items.hasNextPage ? (
        <div className="border-t p-2">
          <LoadMore size="xs" pending={items.isFetchingNextPage} onClick={() => void items.fetchNextPage()}>
            Load {Math.min(TIMESHEET_PAGE, total - rows.length)} more
          </LoadMore>
        </div>
      ) : null}
    </div>
  );
}
