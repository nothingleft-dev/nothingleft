'use client';

import { useLayoutEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { formatDuration, type WorkCalendar } from '@nothingleft/format';
import type { MemberRef, ReportScope, TimesheetReport as Timesheet } from '@nothingleft/types';
import { RetryButton } from '@components/query-state';
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
import type { ReportQuery } from '@lib/api/reports';
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
      summary={d => (
        <span className="flex max-w-[90ch] flex-wrap gap-x-1.5">
          <Duration minutes={d.total} calendar={calendarOf(d)} className="font-medium text-text" />
          <span aria-hidden>·</span>
          <span>{plural(d.rows.length, 'person', 'people')}</span>
          {d.scope.period ? (
            <>
              <span aria-hidden>·</span>
              <span>{formatCalendarRange(d.scope.period.from, d.scope.period.to)}</span>
            </>
          ) : null}
          {scopeNames(d.scope) ? (
            <>
              <span aria-hidden>·</span>
              <span>{scopeNames(d.scope)}</span>
            </>
          ) : null}
        </span>
      )}
    >
      {d => <TimesheetGrid data={d} scope={state.query} />}
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
const MIN_DAY_PX = 72;
const MIN_TOTAL_PX = 128;

const widthFor = (minutesList: readonly number[], calendar: WorkCalendar, floor: number) => {
  const chars = Math.max(0, ...minutesList.map(m => (m > 0 ? formatDuration(m, calendar).length : 2)));
  return Math.max(floor, Math.ceil(chars * MONO_CHAR_PX) + CELL_INSET_PX);
};

const CORNER = 'z-30 bg-surface';

function scrollToToday(el: HTMLElement, today: string) {
  const days = [...el.querySelectorAll<HTMLElement>('thead [data-day]')];
  const column = days.find(th => th.dataset.day === today);
  if (!column) return;
  const origin = el.getBoundingClientRect().left - el.scrollLeft;
  const startOf = (th: HTMLElement) => th.getBoundingClientRect().left - origin;
  const person = el.querySelector<HTMLElement>('thead th')?.offsetWidth ?? 0;
  const total = el.querySelector<HTMLElement>('thead th:last-child')?.offsetWidth ?? 0;
  const want = startOf(column) + column.offsetWidth * 2 - (el.clientWidth - total);
  const starts = days.map(th => startOf(th) - person);
  const todayAtStart = startOf(column) - person;
  el.scrollLeft = want <= 0 ? 0 : Math.min(starts.find(s => s >= want) ?? want, todayAtStart);
}

function TimesheetGrid({ data, scope }: { data: Timesheet; scope: ReportQuery }) {
  const calendar = calendarOf(data);
  const today = todayCalendarDate();
  const period = data.scope.period;
  const { ref: scroller, edges, measure } = useScrollEdges();

  const dayPx = widthFor([...data.day_totals, ...data.rows.flatMap(r => r.minutes)], calendar, MIN_DAY_PX);
  const totalPx = widthFor([data.total, ...data.rows.map(r => r.total)], calendar, MIN_TOTAL_PX);
  const minWidth = PERSON_PX + data.days.length * dayPx + totalPx;

  // A long period opens on today and the day after, with whole columns showing beside the sticky Person column.
  // Keyed on the dates, not the response, so a refetch never moves a grid the reader has scrolled.
  const span = `${data.days[0]?.date}..${data.days.at(-1)?.date}`;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && span) scrollToToday(el, today);
    measure();
  }, [today, span, scroller, measure]);

  const startEdge = cn('sticky left-0 border-r', edges.start && EDGE_START);
  const endEdge = cn('sticky right-0 border-l', edges.end && EDGE_END);

  return (
    <div
      ref={scroller}
      onScroll={measure}
      className="max-h-[max(22rem,calc(100dvh-17rem))] scroll-pt-11 scroll-pb-9 scroll-pl-64 overflow-auto overscroll-x-contain rounded-md border max-sm:scroll-pl-32"
      style={{ scrollPaddingRight: totalPx }}
    >
      <table
        className="w-full table-fixed border-separate border-spacing-0 text-sm whitespace-nowrap"
        style={{ minWidth }}
      >
        <colgroup>
          <col className="w-64 max-sm:w-32" />
          {data.days.map(day => (
            <col key={day.date} />
          ))}
          <col style={{ width: totalPx }} />
        </colgroup>
        <thead>
          <tr>
            <th
              className={cn(
                startEdge,
                CORNER,
                'top-0 h-11 border-b px-3 text-left text-xs font-normal text-text-secondary',
              )}
            >
              Person
            </th>
            {data.days.map(day => (
              <th
                key={day.date}
                data-day={day.date}
                className={cn(
                  'sticky top-0 z-20 h-11 border-b px-2.5 text-right text-2xs font-normal text-text-secondary tabular',
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
                <span className="flex min-w-0 items-center gap-2">
                  <MemberAvatar member={row.member} className="size-avatar-sm flex-none max-sm:hidden" />
                  <PersonName person={row.member} className="min-w-0" />
                </span>
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

function DrillCell({
  drill,
  scope,
  calendar,
  align,
}: {
  drill: Drill;
  scope: ReportQuery;
  calendar: WorkCalendar;
  align: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${drill.member.name}, ${formatCalendarRange(drill.from, drill.to)}: the time entries`}
          className={cn('flex h-8 w-full items-center justify-end rounded-xs px-2 hover:bg-hover', open && 'bg-active')}
        >
          <Duration minutes={drill.minutes} calendar={calendar} />
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

// Key, title, badges, duration: one row per entry, the columns shared across rows.
const ENTRY_GRID = 'grid grid-cols-[max-content_minmax(0,1fr)_auto_auto] gap-x-2';
const ENTRY_ROW = 'col-span-full grid grid-cols-subgrid items-center gap-y-0.5 px-3 py-2';

function WorkItems({ drill, scope, calendar }: { drill: Drill; scope: ReportQuery; calendar: WorkCalendar }) {
  const rest = Object.fromEntries(Object.entries(scope).filter(([key]) => !PERIOD_AND_PEOPLE.has(key)));
  const items = useTimesheetWorkItems({ ...rest, user: drill.member.username, from: drill.from, to: drill.to });
  const rows = items.data?.pages.flatMap(p => p.data) ?? [];
  const single = drill.from === drill.to;

  return (
    <div className="flex max-h-[min(60vh,440px)] flex-col">
      <div className="flex items-baseline gap-2 border-b px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate font-medium">
          {drill.member.name} · {single ? formatCalendarDate(drill.from) : formatCalendarRange(drill.from, drill.to)}
        </span>
        <Duration minutes={drill.minutes} calendar={calendar} className="font-semibold" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.isPending ? (
          <div className={ENTRY_GRID} aria-hidden>
            {[60, 80, 48].map((w, i) => (
              <div key={i} className={cn(ENTRY_ROW, single ? 'min-h-9' : 'min-h-[3.625rem]')}>
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3" style={{ width: `${w}%` }} />
                <Skeleton className="size-4" />
                <Skeleton className="h-3 w-10" />
                {single ? null : <Skeleton className="col-start-2 h-3 w-16" />}
              </div>
            ))}
          </div>
        ) : items.isError && !items.data ? (
          <div className="flex items-center gap-3 px-3 py-3">
            <p className="min-w-0 flex-1 text-xs text-danger-fg">{items.error.message}</p>
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
                    className="col-span-2 grid grid-cols-subgrid items-center hover:underline"
                  >
                    <IssueKey issueKey={item.issue} />
                    <span className="truncate">{item.issue_title}</span>
                  </Link>
                  <span className="flex items-center gap-1">
                    {item.work_type ? (
                      <LetterBadge letter={item.work_type.short_label} label={item.work_type.name} variant="outlined" />
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
                  <Duration minutes={item.duration_minutes} calendar={calendar} className="text-right" />
                  {!single || note ? (
                    <span className="col-span-3 col-start-2 flex min-w-0 gap-1.5 text-xs text-text-secondary">
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
          <LoadMore size="xs" pending={items.isFetchingNextPage} onClick={() => void items.fetchNextPage()} />
        </div>
      ) : null}
    </div>
  );
}
