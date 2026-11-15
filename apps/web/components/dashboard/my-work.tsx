'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { formatDuration } from '@nothingleft/format';
import type { DueBucket, IssueGroup, IssueListItem } from '@nothingleft/types';
import { IssueKey } from '@components/issue-key';
import { CompactIssueRow, CompactRowsSkeleton } from '@components/dashboard/compact-issue-row';
import { Meter } from '@components/dashboard/meter';
import { Section, SectionEmpty } from '@components/dashboard/section';
import { Kbd } from '@components/kbd';
import { LoadError, StaleNotice, errorDetail } from '@components/query-state';
import { StatRow, statRowState, type Stat } from '@components/dashboard/stat-row';
import { ActiveSprintRow, ActiveSprintRowsSkeleton, backlogHref } from '@components/agile/active-sprint';
import { InboxPreview } from '@components/notifications/inbox-preview';
import { useIssueFigures, useIssueSlice } from '@hooks/use-issue-search';
import { useInboxPreview } from '@hooks/use-notifications';
import { useProjectRoles } from '@hooks/use-project-roles';
import { useRecentlyViewed } from '@hooks/use-recently-viewed';
import { useSession } from '@hooks/use-session';
import { useActiveSprints } from '@hooks/use-sprints';
import { useWorkCalendar } from '@hooks/use-work-calendar';
import { DUE_GROUP_QUERY, DUE_TODAY, MY_OPEN, OVERDUE, listHref } from '@lib/issue-list/links';
import { formatTime, todayCalendarDate } from '@lib/datetime';
import { cn } from '@lib/utils';
import { plural } from '@lib/numbers';

const BY_DUE_DATE = 'sort by: {due date} asc';
const ASSIGNED_QUERY = `${MY_OPEN} ${BY_DUE_DATE}`;
const STARRED_QUERY = `#Star ${BY_DUE_DATE}`;
// DESIGN-SYSTEM § 8: ten rows across the groups, every non-empty group showing a few.
const ROWS_SHOWN = 10;
const ROWS_PER_GROUP_MIN = 3;
const STARRED_SHOWN = 5;

interface Read {
  data: unknown;
  isError: boolean;
  error: unknown;
  dataUpdatedAt: number;
  refetch: () => unknown;
}

const staleRead = (q: Read) => q.isError && q.data !== undefined;

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
  const inbox = useInboxPreview();
  const reads: Read[] = [figures, logged, assigned, starred, sprints, inbox];
  const nothingLoaded = reads.every(q => q.isError && q.data === undefined);
  const stale = reads.filter(staleRead);
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
      unit: withOpen > 0 ? `across ${plural(withOpen, 'project')}` : undefined,
      href: listHref(MY_OPEN),
    },
    {
      label: 'Logged this week',
      value: formatDuration(loggedMinutes, hours),
      unit: `of ${formatDuration(weekMinutes, hours)}`,
      unitHint: `Your organisation’s work week: ${calendar.workweekDays} days of ${formatDuration(calendar.workdayMinutes, hours)}`,
      href: '/timesheets' as Route,
      delta:
        weekMinutes > 0 && loggedMinutes > weekMinutes
          ? { text: `${formatDuration(loggedMinutes - weekMinutes, hours)} over`, good: null, warn: true }
          : null,
      below: (
        <Meter
          ratio={weekMinutes ? loggedMinutes / weekMinutes : 0}
          overflow
          label="Logged this week"
          className="mt-2 bg-border"
        />
      ),
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
  const starredTotal = starred.data?.meta.pagination?.total ?? starred.data?.data.length ?? 0;
  const canCreate = roles.writable.length > 0;
  const backlogProject = roles.writable.length === 1 ? roles.writable[0]! : null;
  const viewer = roles.org?.membership.username;

  if (nothingLoaded) {
    return (
      <div className="flex flex-col gap-6">
        <LoadError onRetry={() => reads.forEach(q => void q.refetch())} detail={errorDetail(figures.error)}>
          My work could not be loaded.
        </LoadError>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {stale.length > 0 ? (
        <StaleNotice onRetry={() => stale.forEach(q => void q.refetch())} className="-mt-2 self-start text-xs">
          My work could not be refreshed. Showing what loaded at{' '}
          {formatTime(Math.min(...stale.map(q => q.dataUpdatedAt)), user?.timezone)}.
        </StaleNotice>
      ) : null}
      <div className="flex flex-col gap-3">
        {rowState === 'failed' ? (
          <LoadError
            onRetry={() => {
              void figures.refetch();
              void logged.refetch();
            }}
            detail={errorDetail(figures.error ?? logged.error)}
          >
            These figures could not be loaded.
          </LoadError>
        ) : null}
        <StatRow stats={stats} state={rowState} />
      </div>

      <div className="grid items-start gap-8 min-[1200px]:grid-cols-[minmax(0,1fr)_var(--rail)]">
        <div className="flex min-w-0 flex-col gap-8">
          <Section
            title="Assigned to me"
            count={assignedTotal > 0 ? assignedTotal : undefined}
            action={
              assignedTotal > 0
                ? { label: 'View all assigned issues', href: listHref(ASSIGNED_QUERY, { group: 'due' }) }
                : undefined
            }
          >
            {assigned.isPending ? (
              <CompactRowsSkeleton rows={6} />
            ) : assigned.isError && !assigned.data ? (
              <LoadError onRetry={() => void assigned.refetch()} detail={errorDetail(assigned.error)}>
                Your assignments could not be loaded.
              </LoadError>
            ) : assignedTotal === 0 ? (
              <SectionEmpty className="px-3">
                Nothing is assigned to you. <Link href={'/issues' as Route}>Browse the issue list</Link>
                {canCreate ? (
                  <>
                    {' '}
                    or press <Kbd className="mx-0.5 align-[1px]">c</Kbd> to create one.
                  </>
                ) : (
                  '.'
                )}
              </SectionEmpty>
            ) : (
              <AssignedGroups groups={groups} rows={assignedRows} today={today} viewer={viewer} />
            )}
          </Section>

          <Section
            title="Starred"
            count={starredTotal > 0 ? starredTotal : undefined}
            action={
              starredTotal > STARRED_SHOWN
                ? { label: `View all ${starredTotal} starred`, href: '/starred' as Route }
                : starredTotal > 0
                  ? { label: 'View all starred', href: '/starred' as Route }
                  : undefined
            }
          >
            {starred.isPending ? (
              <CompactRowsSkeleton rows={3} />
            ) : starred.isError && !starred.data ? (
              <LoadError onRetry={() => void starred.refetch()} detail={errorDetail(starred.error)}>
                Your starred issues could not be loaded.
              </LoadError>
            ) : (starred.data?.data.length ?? 0) === 0 ? (
              <SectionEmpty className="px-3">Star an issue from its page and it stays within reach here.</SectionEmpty>
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
          <Section title="Active sprints" count={mySprints.length > 0 ? mySprints.length : undefined}>
            {sprints.isPending ? (
              <ActiveSprintRowsSkeleton />
            ) : sprints.isError && !sprints.data ? (
              <LoadError onRetry={() => void sprints.refetch()} detail={errorDetail(sprints.error)}>
                Sprints could not be loaded.
              </LoadError>
            ) : mySprints.length === 0 ? (
              <SectionEmpty className="px-3">
                None of your issues is in an active sprint.{' '}
                {backlogProject ? (
                  <Link href={backlogHref(backlogProject.key)}>Open the {backlogProject.name} backlog</Link>
                ) : (
                  <Link href={'/projects' as Route}>Browse projects</Link>
                )}
                .
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
            count={recent.items.length > 0 ? recent.items.length : undefined}
            action={recent.items.length > 0 ? { label: 'Clear', onClick: recent.clear } : undefined}
          >
            {recent.items.length === 0 ? (
              <SectionEmpty className="px-3">
                Issues you open in this organisation appear here, on this device only.
              </SectionEmpty>
            ) : (
              <ul className="flex flex-col">
                {recent.items.map(item => (
                  <li key={item.key}>
                    <Link
                      href={`/issue/${item.key}` as Route}
                      className="grid h-row grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-sm border-b border-border-subtle px-3 hover:bg-hover"
                    >
                      <IssueKey issueKey={item.key} column />
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
  viewer,
}: {
  groups: readonly IssueGroup[];
  rows: readonly IssueListItem[];
  today: string;
  viewer: string | undefined;
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
                'mt-2 flex h-7 items-center gap-2 rounded-sm bg-app px-3 text-xs font-medium text-text-secondary',
                bucket === 'overdue' && 'text-danger-fg',
              )}
            >
              {group.label}
              <span className="font-normal tabular text-text-muted">{group.count}</span>
            </div>
            {shown.map(issue => (
              <CompactIssueRow
                key={issue.key}
                issue={issue}
                today={today}
                viewer={viewer}
                showDue={bucket !== 'today' && bucket !== 'none'}
              />
            ))}
            {hidden > 0 ? (
              <Link
                href={listHref(`${MY_OPEN} ${DUE_GROUP_QUERY[bucket]} ${BY_DUE_DATE}`)}
                className="flex h-row-dense items-center self-start rounded-xs px-3 text-xs text-text-secondary hover:text-text hover:underline"
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
