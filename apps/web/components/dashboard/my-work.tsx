'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { formatDuration } from '@nothingleft/format';
import type { IssueGroup, IssueListItem } from '@nothingleft/types';
import { IssueKey } from '@components/issue-key';
import { CompactIssueRow, CompactRowsSkeleton } from '@components/dashboard/compact-issue-row';
import { Meter } from '@components/dashboard/meter';
import { Section, SectionEmpty } from '@components/dashboard/section';
import { StatRow, type Stat } from '@components/dashboard/stat-row';
import { ActiveSprintRow, ActiveSprintRowsSkeleton } from '@components/agile/active-sprint';
import { InboxPreview } from '@components/notifications/inbox-preview';
import { useIssueFigures, useIssueSlice } from '@hooks/use-issue-search';
import { useRecentlyViewed } from '@hooks/use-recently-viewed';
import { useShellData } from '@hooks/use-shell-data';
import { useSession } from '@hooks/use-session';
import { useActiveSprints } from '@hooks/use-sprints';
import { useWorkCalendar } from '@hooks/use-work-calendar';
import { DUE_TODAY, MY_OPEN, OVERDUE, listHref } from '@lib/issue-list/links';
import { todayCalendarDate } from '@lib/datetime';
import { cn } from '@lib/utils';

const ASSIGNED_QUERY = `${MY_OPEN} sort by: {due date} asc`;
const STARRED_QUERY = '#Star sort by: updated desc';
const ROWS_SHOWN = 12;
const ROWS_PER_GROUP_MIN = 3;

export function MyWork() {
  const session = useSession();
  const user = session.status === 'signed-in' ? session.user : null;
  const today = todayCalendarDate(user?.timezone);
  const calendar = useWorkCalendar();
  const shell = useShellData(user);

  const figures = useIssueFigures({ q: 'assignee: me', per: 'project' });
  const assigned = useIssueSlice({ q: ASSIGNED_QUERY, group_by: 'due', limit: 50 });
  const starred = useIssueSlice({ q: STARRED_QUERY, limit: ROWS_SHOWN });
  const recent = useRecentlyViewed();
  const sprints = useActiveSprints();
  const mySprints = (sprints.data ?? []).filter(s => s.progress.mine.issues > 0);

  const perProject = figures.data ?? [];
  const sum = (pick: (f: (typeof perProject)[number]) => number) => perProject.reduce((n, f) => n + pick(f), 0);
  const withOpen = perProject.filter(f => f.open > 0).length;
  const weekMinutes = calendar.workdayMinutes * calendar.workweekDays;
  const logged = sum(f => f.logged_minutes_this_week);
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
      value: formatDuration(logged, hours),
      unit: `of ${formatDuration(weekMinutes, hours)}`,
      below: <Meter ratio={weekMinutes ? logged / weekMinutes : 0} label="Logged this week" className="mt-2" />,
    },
  ];

  const groups = assigned.data?.meta.groups ?? [];
  const assignedRows = assigned.data?.data ?? [];
  const assignedTotal = assigned.data?.meta.pagination?.total ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <StatRow stats={stats} loading={figures.isPending} />

      <div className="grid items-start gap-8 min-[1200px]:grid-cols-[minmax(0,1fr)_var(--rail)]">
        <div className="flex min-w-0 flex-col gap-8">
          <Section
            title="Assigned to me"
            count={assigned.data ? assignedTotal : undefined}
            action={{ label: 'Open as list', href: listHref(ASSIGNED_QUERY, { group: 'due' }) }}
          >
            {assigned.isPending ? (
              <CompactRowsSkeleton rows={6} />
            ) : assigned.isError ? (
              <SectionEmpty>Your assignments could not be loaded.</SectionEmpty>
            ) : assignedTotal === 0 ? (
              <SectionEmpty>
                Nothing is assigned to you. <Link href={'/issues' as Route}>Browse the issue list</Link> or press{' '}
                <kbd>c</kbd> to create one.
              </SectionEmpty>
            ) : (
              <AssignedGroups groups={groups} rows={assignedRows} today={today} />
            )}
          </Section>

          <Section
            title="Starred"
            count={starred.data ? starred.data.meta.pagination?.total : undefined}
            action={{ label: 'Open as list', href: '/starred' as Route }}
          >
            {starred.isPending ? (
              <CompactRowsSkeleton rows={3} />
            ) : (starred.data?.data.length ?? 0) === 0 ? (
              <SectionEmpty>Star an issue from its page and it stays within reach here.</SectionEmpty>
            ) : (
              <div className="flex flex-col">
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
            ) : mySprints.length === 0 ? (
              <SectionEmpty>
                None of your issues is in an active sprint.{' '}
                {shell.projects.length > 0 ? (
                  <Link href={`/projects/${shell.projects[0]!.key}/backlog` as Route}>Open a backlog</Link>
                ) : (
                  <Link href={'/projects' as Route}>Browse projects</Link>
                )}
              </SectionEmpty>
            ) : (
              <ul className="flex flex-col">
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
              <SectionEmpty>Issues you open appear here, on this device only.</SectionEmpty>
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

function AssignedGroups({
  groups,
  rows,
  today,
}: {
  groups: readonly IssueGroup[];
  rows: readonly IssueListItem[];
  today: string;
}) {
  // Every group shows a few rows so the shape of the week is visible; the rest of the
  // budget goes to the groups in order, and what is left is one link per group.
  const minimum = groups.map(group => ({
    group,
    rows: rows.filter(r => (r.group ?? null) === group.value),
  }));
  const dealt = minimum.reduce<{ budget: number; out: { group: IssueGroup; shown: IssueListItem[] }[] }>(
    (acc, { group, rows: groupRows }) => {
      const shown = groupRows.slice(
        0,
        Math.max(Math.min(groupRows.length, ROWS_PER_GROUP_MIN), Math.min(groupRows.length, acc.budget)),
      );
      return { budget: acc.budget - shown.length, out: [...acc.out, { group, shown }] };
    },
    { budget: ROWS_SHOWN - minimum.reduce((n, g) => n + Math.min(g.rows.length, ROWS_PER_GROUP_MIN), 0), out: [] },
  ).out;
  return (
    <div className="flex flex-col">
      {dealt.map(({ group, shown }) => {
        const hidden = group.count - shown.length;
        const overdue = group.value === 'overdue';
        return (
          <div key={group.value ?? 'none'} className="flex flex-col">
            <div
              className={cn(
                'mt-2 flex h-7 items-center gap-2 rounded-sm bg-app px-2 text-xs font-medium text-text-secondary',
                overdue && 'text-danger-fg',
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
                href={listHref(ASSIGNED_QUERY, { group: 'due' })}
                className="flex h-row-dense items-center px-2 text-xs text-text-muted hover:text-text"
              >
                Show {hidden} more
              </Link>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
