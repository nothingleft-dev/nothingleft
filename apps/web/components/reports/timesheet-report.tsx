'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import type { WorkCalendar } from '@nothingleft/format';
import type { MemberRef, TimesheetReport as Timesheet } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { Duration } from '@components/duration';
import { IssueKey } from '@components/issue-key';
import { LetterBadge } from '@components/letter-badge';
import { PersonName } from '@components/former-member-chip';
import { MemberAvatar } from '@components/issues/member-avatar';
import { PickerSkeleton } from '@components/issues/pickers';
import { PeriodPicker } from '@components/reports/period-picker';
import { ReportFrame } from '@components/reports/report-frame';
import { ReportMultiPicker } from '@components/reports/report-picker';
import { plural, scopeText } from '@components/reports/report-bits';
import { useReportState, type ReportState } from '@components/reports/report-state';
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

const calendarOf = (data: Timesheet): WorkCalendar => ({
  workdayMinutes: data.calendar.workday_minutes,
  workweekDays: data.calendar.workweek_days,
});

function PeoplePicker({ state }: { state: ReportState }) {
  const session = useSession();
  const slug = session.status === 'signed-in' ? session.user.current_organization_slug : null;
  const members = useMembers(slug, { limit: 200 });
  const raw = state.params.get('users');
  const values = raw === EVERYONE ? [] : raw ? raw.split(',').filter(Boolean) : ['me'];
  const options = [
    { value: 'me', label: 'Me' },
    ...(members.data ?? []).map(m => ({ value: m.username, label: m.name, group: 'People' })),
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

export function TimesheetReport() {
  const state = useReportState('timesheet');
  const result = useReport('timesheet', state.query);

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
          <PeoplePicker state={state} />
        </>
      }
      skeleton="sheet"
      summary={d => (
        <>
          <Duration minutes={d.total} calendar={calendarOf(d)} className="text-text" /> logged by{' '}
          {plural(d.rows.length, 'person', 'people')}
          {d.scope.period ? ` ${formatCalendarRange(d.scope.period.from, d.scope.period.to)}` : ''} on issues{' '}
          {scopeText(d.scope)}.
        </>
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

function TimesheetGrid({ data, scope }: { data: Timesheet; scope: ReportQuery }) {
  const calendar = calendarOf(data);
  const today = todayCalendarDate();
  const period = data.scope.period;
  const scroller = useRef<HTMLDivElement>(null);

  // A month opens on today's end of it, where the time is being logged.
  useEffect(() => {
    const el = scroller.current;
    const column = el?.querySelector<HTMLElement>(`[data-day="${today}"]`);
    if (el && column) el.scrollLeft = Math.max(0, column.offsetLeft + column.offsetWidth * 2 - el.clientWidth + 96);
  }, [today, data.days]);

  return (
    <div ref={scroller} className="overflow-x-auto rounded-md border">
      <table className="w-full border-separate border-spacing-0 text-sm whitespace-nowrap tabular">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 h-11 min-w-52 border-b bg-surface px-3 text-left text-xs font-normal text-text-muted">
              Person
            </th>
            {data.days.map(day => (
              <th
                key={day.date}
                data-day={day.date}
                className={cn(
                  'h-11 min-w-16 border-b px-1 text-center text-2xs font-normal text-text-muted',
                  !day.working_day && 'bg-app text-text-disabled',
                  day.date === today && 'text-text',
                )}
              >
                <span className="block">{formatCalendarWeekday(day.date)}</span>
                <span className={cn('block text-xs', day.date === today ? 'font-semibold' : 'text-text-secondary')}>
                  {formatCalendarDateShort(day.date)}
                </span>
              </th>
            ))}
            <th className="sticky right-0 z-10 h-11 min-w-20 border-b border-l bg-surface px-3 text-right text-xs font-semibold">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map(row => (
            <tr key={row.member.username}>
              <th className="sticky left-0 z-10 h-row border-b border-border-subtle bg-surface px-3 text-left font-normal">
                <span className="flex min-w-0 items-center gap-2">
                  <MemberAvatar member={row.member} />
                  <span className="truncate">
                    <PersonName person={row.member} />
                  </span>
                </span>
              </th>
              {row.minutes.map((minutes, i) => {
                const day = data.days[i]!;
                return (
                  <td
                    key={day.date}
                    className={cn(
                      'h-row border-b border-border-subtle p-0.5 text-center',
                      !day.working_day && 'bg-app',
                    )}
                  >
                    {minutes > 0 ? (
                      <DrillCell
                        drill={{ member: row.member, from: day.date, to: day.date, minutes }}
                        scope={scope}
                        calendar={calendar}
                      />
                    ) : null}
                  </td>
                );
              })}
              <td className="sticky right-0 z-10 h-row border-b border-l border-border-subtle bg-surface p-0.5 text-right font-semibold">
                {row.total > 0 && period ? (
                  <DrillCell
                    drill={{ member: row.member, from: period.from, to: period.to, minutes: row.total }}
                    scope={scope}
                    calendar={calendar}
                    align="end"
                  />
                ) : (
                  <span className="px-2 text-text-muted">0m</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th className="sticky left-0 z-10 h-row bg-surface px-3 text-left font-semibold">Total</th>
            {data.day_totals.map((minutes, i) => (
              <td
                key={data.days[i]!.date}
                className={cn('h-row text-center font-semibold', !data.days[i]!.working_day && 'bg-app')}
              >
                {minutes > 0 ? <Duration minutes={minutes} calendar={calendar} /> : null}
              </td>
            ))}
            <td className="sticky right-0 z-10 h-row border-l bg-surface px-3 text-right font-semibold">
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
  align = 'center',
}: {
  drill: Drill;
  scope: ReportQuery;
  calendar: WorkCalendar;
  align?: 'center' | 'end';
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${drill.member.name}, ${formatCalendarRange(drill.from, drill.to)}: the time entries`}
          className={cn(
            'flex h-8 w-full items-center rounded-xs px-2 hover:bg-hover',
            align === 'end' ? 'justify-end' : 'justify-center',
            open && 'bg-active',
          )}
        >
          <Duration minutes={drill.minutes} calendar={calendar} />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align === 'end' ? 'end' : 'center'} className="w-[420px] max-w-[calc(100vw-32px)] p-0">
        {open ? <WorkItems drill={drill} scope={scope} calendar={calendar} /> : null}
      </PopoverContent>
    </Popover>
  );
}

// A cell names its own person and days; the report's period and people give way to them.
const PERIOD_AND_PEOPLE = new Set(['period', 'from', 'to', 'users']);

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
          <PickerSkeleton rows={3} />
        ) : items.isError ? (
          <p className="px-3 py-3 text-xs text-danger-fg">{items.error.message}</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {rows.map(item => (
              <li key={item.id} className="flex flex-col gap-1 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/issue/${item.issue}` as Route}
                    className="flex min-w-0 flex-1 items-center gap-2 hover:underline"
                  >
                    <IssueKey issueKey={item.issue} />
                    <span className="truncate">{item.issue_title}</span>
                  </Link>
                  <Duration minutes={item.duration_minutes} calendar={calendar} />
                </div>
                <div className="flex min-w-0 items-center gap-1.5 text-xs text-text-secondary">
                  {!single ? <span className="tabular">{formatCalendarDateShort(item.work_date)}</span> : null}
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
                  {item.description_md ? <span className="truncate">{item.description_md.split('\n')[0]}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {items.hasNextPage ? (
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="xs"
            className="w-full"
            disabled={items.isFetchingNextPage}
            onClick={() => void items.fetchNextPage()}
          >
            {items.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
