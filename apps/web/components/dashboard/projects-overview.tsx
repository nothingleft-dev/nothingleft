'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { Plus } from 'lucide-react';
import { formatBytes } from '@nothingleft/format';
import type { IssueFigures, Organization, OrgActivity, Project, Sprint } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { Meter } from '@components/dashboard/meter';
import { Section, SectionEmpty, SectionError, StaleNotice } from '@components/dashboard/section';
import { StatRow, statRowState, weekDelta, type Stat, type StatRowState } from '@components/dashboard/stat-row';
import { StatusStrip } from '@components/dashboard/status-strip';
import { MemberAvatar } from '@components/issues/member-avatar';
import { ProjectMark } from '@components/projects/project-mark';
import { SeatBanner } from '@components/invitations/seat-notice';
import { ACTIVITY_LABELS, activitySubject } from '@components/organization/activity-labels';
import { RelativeTime } from '@components/relative-time';
import { Segmented } from '@components/segmented';
import { FormerMemberChip, PersonName, deactivatedInk } from '@components/former-member-chip';
import { useActivity } from '@hooks/use-activity';
import { useIssueFigures } from '@hooks/use-issue-search';
import { useProjects } from '@hooks/use-projects';
import { useActiveSprints } from '@hooks/use-sprints';
import { ActiveSprintLine, backlogHref } from '@components/agile/active-sprint';
import { CREATED_7D, OVERDUE, RESOLVED_7D, UNASSIGNED, listHref } from '@lib/issue-list/links';
import { cn } from '@lib/utils';

const ACTIVITY_SHOWN = 8;
// A count past this reads as a lot of open work; it says nothing about the person's capacity.
const MANY_OPEN = 15;
// Quota meters turn amber here (DESIGN-SYSTEM § 7); the limits section explains itself only then.
const NEAR_LIMIT = 0.8;

type Scope = 'active' | 'all';
type Sort = 'attention' | 'name';

const SCOPES = [
  { value: 'active', label: 'Active' },
  { value: 'all', label: 'All' },
] as const;
const SORTS = [
  { value: 'attention', label: 'Needs attention' },
  { value: 'name', label: 'A–Z' },
] as const;

function byAttention(figuresOf: (key: string) => IssueFigures | null) {
  return (a: Project, b: Project) => {
    if (a.is_archived !== b.is_archived) return a.is_archived ? 1 : -1;
    const fa = figuresOf(a.key);
    const fb = figuresOf(b.key);
    return (
      (fb?.overdue ?? 0) - (fa?.overdue ?? 0) ||
      (fb?.unassigned ?? 0) - (fa?.unassigned ?? 0) ||
      (fb?.open ?? 0) - (fa?.open ?? 0) ||
      a.name.localeCompare(b.name)
    );
  };
}

const worst = (states: readonly StatRowState[]): StatRowState =>
  (['loading', 'failed', 'stale'] as const).find(s => states.includes(s)) ?? 'ready';

export function ProjectsOverview({ org, orgAdmin }: { org: Organization; orgAdmin: boolean }) {
  const [scope, setScope] = useState<Scope>('active');
  const [sort, setSort] = useState<Sort>('attention');
  const figures = useIssueFigures({ per: 'project' });
  const active = useProjects({ archived: 'false' });
  const archived = useProjects({ archived: 'true' });
  // The audit feed is an Org Admin's; a Project Admin is never sent to ask for it.
  const activity = useActivity(org.slug, {}, orgAdmin);
  const sprints = useActiveSprints();

  const archivedList = archived.data ?? [];
  const shown = [...(active.data ?? []), ...(scope === 'all' ? archivedList : [])];
  const figuresOf = (key: string) => figures.data?.find(f => f.project?.key === key) ?? null;
  const perProject = shown.map(p => figuresOf(p.key)).filter((f): f is IssueFigures => f !== null);
  const ordered = [...shown].sort(
    sort === 'name'
      ? (a, b) => Number(a.is_archived) - Number(b.is_archived) || a.name.localeCompare(b.name)
      : byAttention(figuresOf),
  );

  // The figures endpoint reads archived projects too, so the active scope names them out of every link.
  const outOfScope =
    scope === 'active' && archivedList.length > 0 ? ` project: ${archivedList.map(p => `-${p.key}`).join(', ')}` : '';
  const scoped = (q: string) => listHref(`${q}${outOfScope}`);
  const sum = (pick: (f: IssueFigures) => number) => perProject.reduce((n, f) => n + pick(f), 0);

  const stats: Stat[] = [
    { label: 'Open issues', value: sum(f => f.open), href: scoped('#Unresolved') },
    { label: 'Overdue', value: sum(f => f.overdue), alert: true, href: scoped(OVERDUE) },
    { label: 'Unassigned', value: sum(f => f.unassigned), href: scoped(UNASSIGNED) },
    {
      label: 'Resolved in the last 7 days',
      value: sum(f => f.resolved_7d),
      delta: weekDelta(sum(f => f.resolved_7d) - sum(f => f.resolved_prev_7d)),
      href: scoped(RESOLVED_7D),
    },
    { label: 'Created in the last 7 days', value: sum(f => f.created_7d), href: scoped(CREATED_7D) },
  ];
  const statState = worst([statRowState(figures), statRowState(active), statRowState(archived)]);
  const projectsFailed = active.isError && !active.data;

  return (
    <div className="flex flex-col gap-4">
      {orgAdmin ? <SeatBanner seats={org.seats} /> : null}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Show</span>
          <Segmented ariaLabel="Project scope" value={scope} options={SCOPES} onChange={setScope} />
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Sort</span>
          <Segmented ariaLabel="Sort projects" value={sort} options={SORTS} onChange={setSort} />
        </div>
        <span className="text-xs text-text-muted tabular">
          {active.data
            ? scope === 'active' && archivedList.length > 0
              ? `${shown.length} active · ${archivedList.length} archived not shown`
              : `${shown.length} ${shown.length === 1 ? 'project' : 'projects'}`
            : null}
        </span>
        {orgAdmin ? (
          <Button asChild size="sm" variant="outline" className="ml-auto">
            <Link href={'/projects?new=1' as Route}>
              <Plus className="size-icon-sm" /> New project
            </Link>
          </Button>
        ) : null}
      </div>

      <StatRow
        stats={stats}
        state={statState}
        onRetry={() => {
          void figures.refetch();
          void active.refetch();
          void archived.refetch();
        }}
      />

      <div
        className={cn('mt-2 grid items-start gap-8', orgAdmin && 'min-[1200px]:grid-cols-[minmax(0,1fr)_var(--rail)]')}
      >
        <div
          className={cn(
            'grid min-w-0 gap-3 min-[900px]:grid-cols-2',
            orgAdmin && 'min-[1200px]:grid-cols-1 min-[1500px]:grid-cols-2',
          )}
        >
          {active.isPending ? (
            <>
              <Skeleton className="h-64 rounded-md" />
              <Skeleton className="h-64 rounded-md" />
            </>
          ) : projectsFailed ? (
            <div className="min-[900px]:col-span-2">
              <SectionError onRetry={() => void active.refetch()}>Your projects could not be loaded.</SectionError>
            </div>
          ) : ordered.length === 0 ? (
            <div className="min-[900px]:col-span-2">
              <SectionEmpty>
                No projects yet. {orgAdmin ? <Link href={'/projects?new=1' as Route}>Create the first one</Link> : null}
              </SectionEmpty>
            </div>
          ) : (
            ordered.map(project => (
              <ProjectFiguresCard
                key={project.key}
                project={project}
                figures={figuresOf(project.key)}
                sprint={sprints.data?.find(s => s.project.key === project.key) ?? null}
                loading={figures.isPending}
                sprintState={sprints.isPending ? 'loading' : sprints.isError && !sprints.data ? 'failed' : 'ready'}
              />
            ))
          )}
        </div>

        {orgAdmin ? (
          <aside className="flex min-w-0 flex-col gap-8 max-[1199px]:grid max-[1199px]:grid-cols-2 max-[1199px]:gap-6 max-md:grid-cols-1">
            <MembersAndLimits org={org} />
            <Section
              title="Activity"
              count="organisation"
              action={{ label: 'Audit log', href: '/organization?tab=audit' as Route }}
            >
              {activity.isPending ? (
                <div className="flex flex-col gap-2 px-2 py-1">
                  {Array.from({ length: 4 }, (_, i) => (
                    <Skeleton key={i} className="h-3" style={{ width: `${55 + ((i * 17) % 40)}%` }} />
                  ))}
                </div>
              ) : activity.isError && !activity.data ? (
                <SectionError onRetry={() => void activity.refetch()}>Activity could not be loaded.</SectionError>
              ) : (activity.data?.rows.length ?? 0) === 0 ? (
                <SectionEmpty>Nothing has happened in the organisation yet.</SectionEmpty>
              ) : (
                <ul className="flex flex-col">
                  {activity.isError ? (
                    <li>
                      <StaleNotice onRetry={() => void activity.refetch()}>
                        Activity could not be refreshed and may be out of date.
                      </StaleNotice>
                    </li>
                  ) : null}
                  {activity.data!.rows.slice(0, ACTIVITY_SHOWN).map(row => (
                    <ActivityRow key={row.id} row={row} />
                  ))}
                </ul>
              )}
            </Section>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function MembersAndLimits({ org }: { org: Organization }) {
  const seatRatio = org.seats.free ? org.seats.used / org.seats.free : 0;
  const ownBucket = org.storage.bring_your_own === 'verified';
  const storageRatio = ownBucket ? 0 : org.storage.used_bytes / org.storage.limit_bytes;
  return (
    <Section title="Members and limits" action={{ label: 'Organisation settings', href: '/organization' as Route }}>
      <div className="flex flex-col gap-3 px-2 py-1 text-xs">
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-text-secondary">
            <span>Members</span>
            <b className="font-medium tabular text-text">
              {org.seats.free === null ? `${org.seats.used}` : `${org.seats.used} of ${org.seats.free} free`}
            </b>
          </div>
          {org.seats.free === null ? null : <Meter ratio={seatRatio} quota label="Seats used" />}
          {seatRatio >= NEAR_LIMIT ? (
            <span className="text-2xs text-text-secondary">
              The first {org.seats.free} members stay free. Nothing is blocked past them.
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-text-secondary">
            <span>File storage</span>
            <b className="font-medium tabular text-text">
              {ownBucket
                ? 'Your own bucket'
                : `${formatBytes(org.storage.used_bytes)} of ${formatBytes(org.storage.limit_bytes)}`}
            </b>
          </div>
          {ownBucket ? null : <Meter ratio={storageRatio} quota label="File storage used" />}
          {storageRatio >= NEAR_LIMIT ? (
            <Link
              href={'/organization?tab=storage' as Route}
              className="text-2xs text-text-secondary underline hover:text-text"
            >
              Review stored files
            </Link>
          ) : null}
        </div>
      </div>
    </Section>
  );
}

function ActivityRow({ row }: { row: OrgActivity }) {
  const subject = activitySubject(row);
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 border-b border-border-subtle px-2 py-1.5 text-xs text-text-secondary">
      <MemberAvatar member={row.actor ?? { name: '-', avatar_url: null }} className="size-5" />
      <span className="min-w-0">
        <b className={cn('font-medium text-text', deactivatedInk(row.actor))}>
          {row.actor?.name ?? 'Somebody no longer here'}
        </b>{' '}
        {row.actor?.former_member ? <FormerMemberChip className="mr-1 align-middle" /> : null}
        {ACTIVITY_LABELS[row.kind]}
        {subject.text ? <span className="text-text"> {subject.text}</span> : null}
        {subject.projectKey ? (
          <>
            {' in '}
            <Link href={`/projects/${subject.projectKey}` as Route} className="font-mono text-text hover:underline">
              {subject.projectKey}
            </Link>
          </>
        ) : null}
        <RelativeTime value={row.created_at} className="float-right ml-2 text-2xs" />
      </span>
    </li>
  );
}

function ProjectFiguresCard({
  project,
  figures,
  sprint,
  loading,
  sprintState,
}: {
  project: Project;
  figures: IssueFigures | null;
  sprint: Sprint | null;
  loading: boolean;
  sprintState: 'loading' | 'failed' | 'ready';
}) {
  const base = `/projects/${project.key}`;
  const nums: { label: string; value: number; alert?: boolean; q: string }[] = figures
    ? [
        { label: 'Open', value: figures.open, q: '#Unresolved' },
        { label: 'Unassigned', value: figures.unassigned, q: UNASSIGNED },
        { label: 'Overdue', value: figures.overdue, alert: true, q: OVERDUE },
        { label: 'Created 7d', value: figures.created_7d, q: CREATED_7D },
        { label: 'Resolved 7d', value: figures.resolved_7d, q: RESOLVED_7D },
      ]
    : [];
  const team = figures?.by_assignee ?? [];

  return (
    <article className="flex flex-col gap-3 rounded-md border bg-surface px-4 py-3">
      <div className="flex items-center gap-2">
        <ProjectMark project={project} className="size-avatar rounded-sm" />
        <Link href={base as Route} className="truncate font-semibold hover:underline">
          {project.name}
        </Link>
        <span className="font-mono text-xs text-text-muted">{project.key}</span>
        {project.is_archived ? (
          <span className="rounded-sm bg-inset px-1.5 py-0.5 text-2xs text-text-secondary">Archived</span>
        ) : null}
        {project.lead ? (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-text-muted">
            <MemberAvatar member={project.lead} className="size-4" />
            <PersonName person={project.lead} />
          </span>
        ) : null}
      </div>

      {sprint ? (
        <ActiveSprintLine sprint={sprint} />
      ) : (
        <div>
          <div className="flex items-baseline gap-2">
            <span className={cn('text-text-muted', sprintState === 'failed' && 'text-danger-fg')}>
              {sprintState === 'loading'
                ? 'Active sprint'
                : sprintState === 'failed'
                  ? 'Sprints could not be loaded'
                  : 'No active sprint'}
            </span>
            {sprintState === 'ready' && !project.is_archived ? (
              <Link
                href={backlogHref(project.key)}
                className="ml-auto text-xs text-text-secondary hover:text-text hover:underline"
              >
                Plan one from the backlog
              </Link>
            ) : null}
          </div>
          {loading || sprintState === 'loading' ? (
            <Skeleton className="mt-2 h-1.5 w-full" />
          ) : (
            <StatusStrip counts={figures?.by_category ?? {}} className="mt-2" />
          )}
        </div>
      )}

      <div className="flex justify-between gap-3 border-t border-border-subtle pt-3">
        {loading
          ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-8 w-10" />)
          : nums.map(n => (
              <Link
                key={n.label}
                href={listHref(n.q, { project: project.key })}
                className="group/num -mx-1 flex flex-col rounded-xs px-1"
              >
                <span
                  className={cn(
                    'text-md font-semibold tracking-tight tabular group-hover/num:underline',
                    n.alert && n.value > 0 && 'text-danger-fg',
                  )}
                >
                  {n.value}
                </span>
                <span className="text-2xs whitespace-nowrap text-text-muted">{n.label}</span>
              </Link>
            ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border-subtle pt-3">
        {team.length === 0 && !loading ? (
          <span className="text-xs text-text-muted">Nobody has open issues.</span>
        ) : null}
        {team.slice(0, 4).map(({ member, open }) => {
          const link = (
            <Link
              href={listHref(`#Unresolved assignee: @${member.username}`, { project: project.key })}
              className="inline-flex items-center gap-1.5 rounded-xs text-xs text-text-secondary hover:underline"
            >
              <MemberAvatar member={member} className="size-5" />
              <span className={deactivatedInk(member)}>{member.name.split(' ')[0]}</span>
              {member.former_member ? <FormerMemberChip /> : null}{' '}
              <b className={cn('font-medium tabular text-text', open > MANY_OPEN && 'text-danger-fg')}>{open}</b>
            </Link>
          );
          return open > MANY_OPEN ? (
            <Tooltip key={member.username}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent>More than {MANY_OPEN} open issues in this project</TooltipContent>
            </Tooltip>
          ) : (
            <Fragment key={member.username}>{link}</Fragment>
          );
        })}
        {team.length > 4 ? <span className="text-xs text-text-muted">+{team.length - 4}</span> : null}
        {figures && figures.unassigned > 0 ? (
          <Link
            href={listHref(UNASSIGNED, { project: project.key })}
            className="rounded-xs text-xs text-text-muted hover:text-text hover:underline"
          >
            {figures.unassigned} unassigned
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-text-muted">
        {(['issues', 'board', 'backlog', 'reports'] as const).map(page => (
          <Link
            key={page}
            href={`${base}/${page}` as Route}
            className="-ml-1 rounded-xs px-1 py-0.5 capitalize hover:bg-hover hover:text-text"
          >
            {page}
          </Link>
        ))}
        <span className="ml-auto whitespace-nowrap">
          Updated <RelativeTime value={figures?.last_updated_at ?? project.updated_at} className="inline" />
        </span>
      </div>
    </article>
  );
}
