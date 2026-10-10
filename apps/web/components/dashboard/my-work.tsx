'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { formatDuration } from '@nothingleft/format';
import type { DueBucket, IssueGroup, IssueListItem } from '@nothingleft/types';
import { IssueKey } from '@components/issue-key';
import { CompactIssueRow, CompactRowsSkeleton } from '@components/dashboard/compact-issue-row';
import { Meter } from '@components/dashboard/meter';
import { Section, SectionEmpty, SectionError, StaleNotice } from '@components/dashboard/section';
import { StatRow, statRowState, type Stat } from '@components/dashboard/stat-row';
import { ActiveSprintRow, ActiveSprintRowsSkeleton, backlogHref } from '@components/agile/active-sprint';
import { InboxPreview } from '@components/notifications/inbox-preview';
import { useIssueFigures, useIssueSlice } from '@hooks/use-issue-search';
import { useProjectRoles } from '@hooks/use-project-roles';
import { useRecentlyViewed } from '@hooks/use-recently-viewed';
import { useSession } from '@hooks/use-session';
import { useActiveSprints } from '@hooks/use-sprints';
import { useWorkCalendar } from '@hooks/use-work-calendar';
import { DUE_GROUP_QUERY, DUE_TODAY, MY_OPEN, OVERDUE, listHref } from '@lib/issue-list/links';
import { todayCalendarDate } from '@lib/datetime';
import { cn } from '@lib/utils';

const BY_DUE_DATE = 'sort by: {due date} asc';
const ASSIGNED_QUERY = `${MY_OPEN} ${BY_DUE_DATE}`;
const STARRED_QUERY = '#Star sort by: updated desc';
// DESIGN-SYSTEM § 8: ten rows across the groups, every non-empty group showing a few.
const ROWS_SHOWN = 10;
const ROWS_PER_GROUP_MIN = 3;
const STARRED_SHOWN = 12;

export function MyWork() {
  const session = useSession();
  const user = session.status === 'signed-in' ? session.user : null;
  const today = todayCalendarDate(user?.timezone);
  const calendar = useWorkCalendar();
  const roles = useProjectRoles();

  const figures = useIssueFigures({ q: 'assignee: me', per: 'project' });
  // Logged time is the user's own work on any issue they can read, whoever it is assigned to now.
  const logged = useIssueFigures({});
  const assigned = useIssueSlice({ q: ASSIGNED_QUERY, group_by: 'due', group_limit: ROWS_SHOWN, limit: 50 });
  const starred = useIssueSlice({ q: STARRED_QUERY, limit: STARRED_SHOWN });
  const recent = useRecentlyViewed();
  const sprints = useActiveSprints();
  const mySprints = (sprints.data ?? []).filter(s => s.progress.mine.issues > 0);

  const perProject = figures.data ?? [];
  const sum = (pick: (f: (typeof perProject)[number]) => number) => perProject.reduce((n, f) => n + pick(f), 0);
  const withOpen = perProject.filter(f => f.open > 0).length;
  const weekMinutes = calendar.workdayMinutes * calendar.workweekDays;
  const loggedMinutes = logged.data?.[0]?.logged_minutes_this_week ?? 0;
  // `22h 30m of 40h`, not `2d 6h 30m of 1w`: a week's budget reads best in hours.
  const hours = { workdayMinutes: Number.MAX_SAFE_INTEGER, workweekDays: 1 };

  const stats: Stat[] = [
    { label: 'Overdue', value: sum(f => f.overdue), alert: true, href: listHref(`assignee: me ${OVERDUE}`) },
    { label: 'Due today', value: sum(f => f.due_today), href: listHref(`assignee: me ${DUE_TODAY}`) },
    {
      label: 'Open, assigned to me',
      value: sum(f => f.open),
      unit: withOpen > 0 ? `across ${withOpen} ${withOpen === 1 ? 'project' : 'projects'}` : undefined,
      href: listHref(MY_OPEN),
    },
    {
      label: 'Logged this week',
      value: formatDuration(loggedMinutes, hours),
      unit: `of ${formatDuration(weekMinutes, hours)}`,
      unitHint: `Your organisation’s work week: ${calendar.workweekDays} days of ${formatDuration(calendar.workdayMinutes, hours)}`,
      href: '/timesheets' as Route,
      below: <Meter ratio={weekMinutes ? loggedMinutes / weekMinutes : 0} label="Logged this week" className="mt-2" />,
    },
  ];
  const statState = [statRowState(figures), statRowState(logged)];
  const rowState = statState.includes('loading')
    ? 'loading'
    : statState.includes('failed')
      ? 'failed'
      : statState.includes('stale')
        ? 'stale'
        : 'ready';

  const groups = assigned.data?.meta.groups ?? [];
  const assignedRows = assigned.data?.data ?? [];
  const assignedTotal = assigned.data?.meta.pagination?.total ?? 0;
  const canCreate = roles.writable.length > 0;
  const backlogProject = roles.writable.length === 1 ? roles.writable[0]! : null;

  return (
    <div className="flex flex-col gap-6">
      <StatRow
        stats={stats}
        state={rowState}
        onRetry={() => {
          void figures.refetch();
          void logged.refetch();
        }}
      />

      <div className="grid items-start gap-8 min-[1200px]:grid-cols-[minmax(0,1fr)_var(--rail)]">
        <div className="flex min-w-0 flex-col gap-8">
          <Section
            title="Assigned to me"
            count={assigned.data ? assignedTotal : undefined}
            action={{ label: 'View all assigned issues', href: listHref(ASSIGNED_QUERY, { group: 'due' }) }}
          >
            {assigned.isPending ? (
              <CompactRowsSkeleton rows={6} />
            ) : assigned.isError && !assigned.data ? (
              <SectionError onRetry={() => void assigned.refetch()}>Your assignments could not be loaded.</SectionError>
            ) : assignedTotal === 0 ? (
              <SectionEmpty>
                Nothing is assigned to you. <Link href={'/issues' as Route}>Browse the issue list</Link>
                {canCreate ? (
                  <>
                    {' '}
                    or press <kbd>c</kbd> to create one.
                  </>
                ) : (
                  '.'
                )}
              </SectionEmpty>
            ) : (
              <>
                {assigned.isError ? (
                  <StaleNotice onRetry={() => void assigned.refetch()}>
                    Your assignments could not be refreshed and may be out of date.
                  </StaleNotice>
                ) : null}
                <AssignedGroups groups={groups} rows={assignedRows} today={today} />
              </>
            )}
          </Section>

          <Section
            title="Starred"
            count={starred.data ? starred.data.meta.pagination?.total : undefined}
            action={{ label: 'View all starred', href: '/starred' as Route }}
          >
            {starred.isPending ? (
              <CompactRowsSkeleton rows={3} />
            ) : starred.isError && !starred.data ? (
              <SectionError onRetry={() => void starred.refetch()}>
                Your starred issues could not be loaded.
              </SectionError>
            ) : (starred.data?.data.length ?? 0) === 0 ? (
              <SectionEmpty>Star an issue from its page and it stays within reach here.</SectionEmpty>
            ) : (
              <div className="flex flex-col">
                {starred.isError ? (
                  <StaleNotice onRetry={() => void starred.refetch()}>
                    Your starred issues could not be refreshed and may be out of date.
                  </StaleNotice>
                ) : null}
                {starred.data!.data.map(issue => (
                  <CompactIssueRow key={issue.key} issue={issue} today={today} />
                ))}
              </div>
            )}
          </Section>
        </div>

        <aside className="flex min-w-0 flex-col gap-8 max-[1199px]:grid max-[1199px]:grid-cols-2 max-[1199px]:gap-6 max-md:grid-cols-1">
          <InboxPreview />
          <Section title="Active sprints" count={sprints.data ? mySprints.length : undefined}>
            {sprints.isPending ? (
              <ActiveSprintRowsSkeleton />
            ) : sprints.isError && !sprints.data ? (
              <SectionError onRetry={() => void sprints.refetch()}>Sprints could not be loaded.</SectionError>
            ) : mySprints.length === 0 ? (
              <SectionEmpty>
                None of your issues is in an active sprint.{' '}
                {backlogProject ? (
                  <Link href={backlogHref(backlogProject.key)}>Open the {backlogProject.name} backlog</Link>
                ) : (
                  <Link href={'/projects' as Route}>Browse projects</Link>
                )}
              </SectionEmpty>
            ) : (
              <ul className="flex flex-col">
                {sprints.isError ? (
                  <li>
                    <StaleNotice onRetry={() => void sprints.refetch()}>
                      Sprints could not be refreshed and may be out of date.
                    </StaleNotice>
                  </li>
                ) : null}
                {mySprints.map(sprint => (
                  <ActiveSprintRow key={`${sprint.project.key}/${sprint.slug}`} sprint={sprint} />
                ))}
              </ul>
            )}
          </Section>
          <Section
            title="Recently viewed"
            action={recent.items.length > 0 ? { label: 'Clear', onClick: recent.clear } : undefined}
          >
            {recent.items.length === 0 ? (
              <SectionEmpty>Issues you open in this organisation appear here, on this device only.</SectionEmpty>
            ) : (
              <ul className="flex flex-col">
                {recent.items.map(item => (
                  <li key={item.key}>
                    <Link
                      href={`/issue/${item.key}` as Route}
                      className="grid h-row-dense grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-sm border-b border-border-subtle px-2 hover:bg-hover"
                    >
                      <IssueKey issueKey={item.key} />
                      <span className="truncate text-xs">{item.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </aside>
      </div>
    </div>
  );
}

/**
 * Splits `budget` rows across groups in order: each non-empty group first gets an equal share
 * (at most `floor`), then what is left goes to the earliest groups. Never more than `budget`.
 */
function allocateRows(available: readonly number[], budget: number, floor: number): number[] {
  const nonEmpty = available.filter(n => n > 0).length;
  if (nonEmpty === 0) return available.map(() => 0);
  const share = Math.min(floor, Math.floor(budget / nonEmpty));
  const shown = available.map(n => Math.min(n, share));
  let left = budget - shown.reduce((a, b) => a + b, 0);
  return shown.map((n, i) => {
    const extra = Math.max(0, Math.min(available[i]! - n, left));
    left -= extra;
    return n + extra;
  });
}

const GROUP_LINK_NOUN: Record<DueBucket | 'none', string> = {
  overdue: 'overdue',
  today: 'due today',
  this_week: 'due this week',
  later: 'due later',
  none: 'with no due date',
};

function AssignedGroups({
  groups,
  rows,
  today,
}: {
  groups: readonly IssueGroup[];
  rows: readonly IssueListItem[];
  today: string;
}) {
  const byGroup = groups.map(group => rows.filter(r => (r.group ?? null) === group.value));
  const counts = allocateRows(
    byGroup.map(r => r.length),
    ROWS_SHOWN,
    ROWS_PER_GROUP_MIN,
  );
  return (
    <div className="flex flex-col">
      {groups.map((group, i) => {
        const shown = byGroup[i]!.slice(0, counts[i]);
        const hidden = group.count - shown.length;
        const bucket = (group.value ?? 'none') as DueBucket | 'none';
        return (
          <div key={bucket} className="flex flex-col">
            <div
              className={cn(
                'mt-2 flex h-7 items-center gap-2 rounded-sm bg-app px-2 text-xs font-medium text-text-secondary',
                bucket === 'overdue' && 'text-danger-fg',
              )}
            >
              {group.label}
              <span className="font-normal tabular text-text-muted">{group.count}</span>
            </div>
            {shown.map(issue => (
              <CompactIssueRow key={issue.key} issue={issue} today={today} />
            ))}
            {hidden > 0 ? (
              <Link
                href={listHref(`${MY_OPEN} ${DUE_GROUP_QUERY[bucket]} ${BY_DUE_DATE}`)}
                className="flex h-row-dense items-center self-start rounded-xs px-2 text-xs text-text-secondary hover:text-text hover:underline"
              >
                View all {group.count} {GROUP_LINK_NOUN[bucket]}
              </Link>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
