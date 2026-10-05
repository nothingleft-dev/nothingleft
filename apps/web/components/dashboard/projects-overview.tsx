'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { formatBytes } from '@nothingleft/format';
import type { IssueFigures, Organization, Project, Sprint } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { Meter } from '@components/dashboard/meter';
import { Section, SectionEmpty } from '@components/dashboard/section';
import { StatRow, type Stat } from '@components/dashboard/stat-row';
import { StatusStrip } from '@components/dashboard/status-strip';
import { MemberAvatar } from '@components/issues/member-avatar';
import { ProjectMark } from '@components/projects/project-mark';
import { SeatBanner } from '@components/invitations/seat-notice';
import { ACTIVITY_LABELS } from '@components/organization/activity-labels';
import { RelativeTime } from '@components/relative-time';
import { FormerMemberChip, PersonName, deactivatedInk } from '@components/former-member-chip';
import { useActivity } from '@hooks/use-activity';
import { useIssueFigures } from '@hooks/use-issue-search';
import { useProjects } from '@hooks/use-projects';
import { useActiveSprints } from '@hooks/use-sprints';
import { ActiveSprintLine, backlogHref } from '@components/agile/active-sprint';
import { CREATED_7D, OVERDUE, RESOLVED_7D, UNASSIGNED, listHref } from '@lib/issue-list/links';
import { cn } from '@lib/utils';

const ACTIVITY_SHOWN = 8;
// Somebody carrying more than this many open issues is shown in danger ink.
const OVERLOADED_AT = 15;

export function ProjectsOverview({ org }: { org: Organization }) {
  const figures = useIssueFigures({ per: 'project' });
  const projects = useProjects({ archived: 'false' });
  const activity = useActivity(org.slug, {});
  const sprints = useActiveSprints();

  const perProject = figures.data ?? [];
  const sum = (pick: (f: IssueFigures) => number) => perProject.reduce((n, f) => n + pick(f), 0);
  const resolved = sum(f => f.resolved_7d);
  const resolvedPrev = sum(f => f.resolved_prev_7d);
  const delta = resolved - resolvedPrev;

  const stats: Stat[] = [
    { label: 'Open issues', value: sum(f => f.open), href: listHref('#Unresolved') },
    { label: 'Overdue', value: sum(f => f.overdue), alert: true, href: listHref(OVERDUE) },
    { label: 'Unassigned', value: sum(f => f.unassigned), href: listHref(UNASSIGNED) },
    {
      label: 'Resolved in the last 7 days',
      value: resolved,
      delta: figures.data ? { text: `${delta >= 0 ? '+' : ''}${delta} vs last week`, good: delta >= 0 } : null,
      href: listHref(RESOLVED_7D),
    },
    { label: 'Created in the last 7 days', value: sum(f => f.created_7d), href: listHref(CREATED_7D) },
  ];

  const list = projects.data ?? [];
  const seatRatio = org.seats.free ? org.seats.used / org.seats.free : 0;

  return (
    <div className="flex flex-col gap-6">
      <SeatBanner seats={org.seats} />
      <StatRow stats={stats} loading={figures.isPending} />

      <div className="grid items-start gap-8 min-[1200px]:grid-cols-[minmax(0,1fr)_var(--rail)]">
        <div className="grid min-w-0 gap-3 min-[900px]:grid-cols-2 min-[1200px]:grid-cols-1 min-[1500px]:grid-cols-2">
          {projects.isPending ? (
            <>
              <Skeleton className="h-64 rounded-md" />
              <Skeleton className="h-64 rounded-md" />
            </>
          ) : (
            list.map(project => (
              <ProjectFiguresCard
                key={project.key}
                project={project}
                figures={perProject.find(f => f.project?.key === project.key) ?? null}
                sprint={sprints.data?.find(s => s.project.key === project.key) ?? null}
                loading={figures.isPending}
                sprintLoading={sprints.isPending}
              />
            ))
          )}
          <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-md border border-dashed p-4 text-xs text-text-muted">
            <span>
              {list.length} {list.length === 1 ? 'project' : 'projects'}, {org.seats.used}{' '}
              {org.seats.used === 1 ? 'member' : 'members'}.
            </span>
            <Button asChild variant="outline" size="sm">
              <Link href={'/projects?new=1' as Route}>New project</Link>
            </Button>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-8 max-[1199px]:grid max-[1199px]:grid-cols-2 max-[1199px]:gap-6 max-md:grid-cols-1">
          <Section
            title="Members and limits"
            action={{ label: 'Organisation settings', href: '/organization' as Route }}
          >
            <div className="flex flex-col gap-3 px-2 py-1 text-xs">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-text-secondary">
                  <span>Members</span>
                  <b className="font-medium tabular text-text">
                    {org.seats.free === null ? `${org.seats.used}` : `${org.seats.used} of ${org.seats.free} free`}
                  </b>
                </div>
                <Meter ratio={seatRatio} quota label="Seats used" />
                <span className="text-2xs text-text-muted">
                  The first {org.seats.free ?? 20} stay free forever. Beyond that, about $5 a member a month once
                  billing launches.
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-text-secondary">
                  <span>File storage</span>
                  <b className="font-medium tabular text-text">
                    {org.storage.bring_your_own === 'verified'
                      ? 'Your own bucket'
                      : `${formatBytes(org.storage.used_bytes)} of ${formatBytes(org.storage.limit_bytes)}`}
                  </b>
                </div>
                {org.storage.bring_your_own === 'verified' ? (
                  <span className="text-2xs text-text-secondary">
                    No limit: new files go to your organisation’s bucket.
                  </span>
                ) : (
                  <Meter ratio={org.storage.used_bytes / org.storage.limit_bytes} quota label="File storage used" />
                )}
              </div>
              <p className="text-2xs text-text-muted">Connected LLM figures arrive with the MCP tools.</p>
            </div>
          </Section>

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
            ) : (activity.data?.rows.length ?? 0) === 0 ? (
              <SectionEmpty>Nothing has happened in the organisation yet.</SectionEmpty>
            ) : (
              <ul className="flex flex-col">
                {activity.data!.rows.slice(0, ACTIVITY_SHOWN).map(row => (
                  <li
                    key={row.id}
                    className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 border-b border-border-subtle px-2 py-1.5 text-xs text-text-secondary"
                  >
                    <MemberAvatar member={row.actor ?? { name: '-', avatar_url: null }} className="size-5" />
                    <span className="min-w-0">
                      <b className={cn('font-medium text-text', deactivatedInk(row.actor))}>
                        {row.actor?.name ?? 'Somebody no longer here'}
                      </b>{' '}
                      {row.actor?.former_member ? <FormerMemberChip className="mr-1 align-middle" /> : null}
                      {ACTIVITY_LABELS[row.kind]}
                      <RelativeTime value={row.created_at} className="float-right ml-2 text-2xs" />
                    </span>
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

function ProjectFiguresCard({
  project,
  figures,
  sprint,
  loading,
  sprintLoading,
}: {
  project: Project;
  figures: IssueFigures | null;
  sprint: Sprint | null;
  loading: boolean;
  sprintLoading: boolean;
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
    <article className="flex flex-col gap-3 rounded-md border bg-surface px-4 py-3 transition-colors hover:border-border-strong">
      <div className="flex items-center gap-2">
        <ProjectMark project={project} className="size-avatar rounded-sm" />
        <Link href={base as Route} className="truncate font-semibold hover:underline">
          {project.name}
        </Link>
        <span className="font-mono text-xs text-text-muted">{project.key}</span>
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
            <span className="text-text-muted">{sprintLoading ? 'Active sprint' : 'No active sprint'}</span>
            {sprintLoading ? null : (
              <Link
                href={backlogHref(project.key)}
                className="ml-auto text-xs text-text-secondary hover:text-text hover:underline"
              >
                Plan one from the backlog
              </Link>
            )}
          </div>
          {loading || sprintLoading ? (
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
                className="flex flex-col rounded-xs hover:underline"
              >
                <span
                  className={cn(
                    'text-md font-semibold tracking-tight tabular',
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
        {team.slice(0, 4).map(({ member, open }) => (
          <Link
            key={member.username}
            href={listHref(`#Unresolved assignee: @${member.username}`, { project: project.key })}
            className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:underline"
          >
            <MemberAvatar member={member} className="size-5" />
            <span className={deactivatedInk(member)}>{member.name.split(' ')[0]}</span>
            {member.former_member ? <FormerMemberChip /> : null}{' '}
            <b className={cn('font-medium tabular text-text', open > OVERLOADED_AT && 'text-danger-fg')}>{open}</b>
          </Link>
        ))}
        {team.length > 4 ? <span className="text-xs text-text-muted">+{team.length - 4}</span> : null}
        {figures && figures.unassigned > 0 ? (
          <Link
            href={listHref(UNASSIGNED, { project: project.key })}
            className="text-xs text-text-muted hover:underline"
          >
            {figures.unassigned} unassigned
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
        <Link href={`${base}/issues` as Route} className="hover:text-text">
          Issues
        </Link>
        <Link href={`${base}/board` as Route} className="hover:text-text">
          Board
        </Link>
        <Link href={`${base}/backlog` as Route} className="hover:text-text">
          Backlog
        </Link>
        <Link href={`${base}/reports` as Route} className="hover:text-text">
          Reports
        </Link>
        <span className="ml-auto whitespace-nowrap">
          Updated <RelativeTime value={figures?.last_updated_at ?? project.updated_at} className="inline" />
        </span>
      </div>
    </article>
  );
}
