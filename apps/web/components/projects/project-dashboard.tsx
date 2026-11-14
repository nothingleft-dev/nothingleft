'use client';

import type { ReactNode } from 'react';
import { Markdown } from '@components/markdown/markdown';
import Link from 'next/link';
import type { Route } from 'next';
import { STATUS_CATEGORIES } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { PageTitle } from '@components/page-title';
import { RowsSkeleton } from '@components/skeletons';
import { RelativeTime } from '@components/relative-time';
import { LoadError, notFoundOn404 } from '@components/query-state';
import { Section, SectionEmpty } from '@components/dashboard/section';
import { StatRow, statRowState, weekDelta, type Stat } from '@components/dashboard/stat-row';
import { StatusStrip } from '@components/dashboard/status-strip';
import { MemberAvatar } from '@components/issues/member-avatar';
import { FirstProjectEmptyState } from '@components/projects/first-project-empty-state';
import { ProjectMark } from '@components/projects/project-mark';
import { PersonName } from '@components/former-member-chip';
import { useIssueFigures } from '@hooks/use-issue-search';
import { useProject, useProjectMembers } from '@hooks/use-projects';
import { useSprints } from '@hooks/use-sprints';
import { ActiveSprintPanel, backlogHref } from '@components/agile/active-sprint';
import { useRecordProjectVisit } from '@hooks/use-project-visit';
import { CREATED_7D, OVERDUE, RESOLVED_7D, UNASSIGNED, listHref } from '@lib/issue-list/links';
import { formatCount } from '@lib/numbers';
import { PROJECT_ROLE_LABELS } from '@lib/roles';
import { useProjectRoles } from '@hooks/use-project-roles';

const PEOPLE_SHOWN = 8;
const ROW_SKELETON = 5;

const HEADER = 'flex min-h-10 flex-wrap items-center gap-x-4 gap-y-2';
const MAIN_GRID = 'grid items-start gap-8 min-[1200px]:grid-cols-[minmax(0,1fr)_var(--rail)]';

export function ProjectDashboard({ projectKey }: { projectKey: string }) {
  const project = useProject(projectKey);
  const members = useProjectMembers(projectKey);
  const figures = useIssueFigures({ project: projectKey });
  const sprints = useSprints(projectKey);
  const roles = useProjectRoles();
  useRecordProjectVisit(project.data && !project.data.is_archived ? projectKey : null);

  if (project.isPending) return <ProjectHomeSkeleton />;
  if (!project.data) {
    notFoundOn404(project.error);
    return <LoadError onRetry={() => void project.refetch()}>This project could not be loaded.</LoadError>;
  }

  const data = project.data;
  const active = sprints.data?.find(s => s.state === 'active') ?? null;
  const fig = figures.data?.[0] ?? null;
  const total = fig ? STATUS_CATEGORIES.reduce((n, c) => n + (fig.by_category[c] ?? 0), 0) : null;
  const delta = fig ? fig.resolved_7d - fig.resolved_prev_7d : 0;
  const canEdit = roles.canAdmin(data.key);
  const href = (q: string) => listHref(q, { project: data.key });
  const settingsHref = (tab: string) => `/projects/${data.key}/settings?tab=${tab}` as Route;
  const isEmpty = total === 0;
  const maxLoad = Math.max(1, ...(fig?.by_assignee.map(a => a.open) ?? []));

  const figuresFailed = figures.isError && !figures.data;
  const stats = projectStats(
    data.key,
    fig && {
      open: fig.open,
      overdue: fig.overdue,
      unassigned: fig.unassigned,
      resolved: fig.resolved_7d,
      created: fig.created_7d,
      delta: weekDelta(delta),
    },
  );

  const people = (
    <Section
      title="People"
      count={members.data ? formatCount(members.data.length) : undefined}
      action={data.my_role === 'project_admin' ? { label: 'Manage', href: settingsHref('people') } : undefined}
    >
      {members.isPending ? (
        <RowsSkeleton rows={ROW_SKELETON} columns={['avatar', 'title', 'meta']} />
      ) : !members.data ? (
        <LoadError onRetry={() => void members.refetch()}>People could not be loaded.</LoadError>
      ) : members.data.length === 0 ? (
        <SectionEmpty>Nobody has been added yet.</SectionEmpty>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle rounded-md border">
          {members.data.slice(0, PEOPLE_SHOWN).map(member => (
            <li key={member.username} className="flex h-row items-center gap-2 px-3">
              <MemberAvatar member={member} initialsClassName="text-[10px]" />
              <PersonName person={member} className="flex-1 text-xs" />
              <span className="text-xs text-text-muted">{PROJECT_ROLE_LABELS[member.role]}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );

  const sprint = (
    <Section title="Active sprint">
      {sprints.isPending ? (
        <SprintSkeleton />
      ) : !sprints.data ? (
        <LoadError onRetry={() => void sprints.refetch()}>Sprints could not be loaded.</LoadError>
      ) : active ? (
        <div className="rounded-md border px-1 py-2">
          <ActiveSprintPanel sprint={active} />
        </div>
      ) : (
        <SectionEmpty>
          No active sprint.
          {canEdit ? (
            <>
              {' '}
              <Link href={backlogHref(data.key)}>Plan one from the backlog</Link>
            </>
          ) : null}
        </SectionEmpty>
      )}
    </Section>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className={HEADER}>
          <div className="flex min-w-0 items-center gap-3">
            <ProjectMark project={data} className={data.is_archived ? 'opacity-50 grayscale' : undefined} />
            <PageTitle className="min-w-0 text-pretty">{data.name}</PageTitle>
            {data.is_archived ? (
              <span className="flex-none rounded-sm bg-inset px-1.5 py-0.5 text-2xs text-text-secondary">Archived</span>
            ) : null}
          </div>
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1">
            <Button asChild variant="outline" size="sm">
              <Link href={`/projects/${data.key}/issues` as Route}>Issues</Link>
            </Button>
            {data.my_role === 'project_admin' ? (
              <Button asChild variant="outline" size="sm">
                <Link href={settingsHref('general')}>Settings</Link>
              </Button>
            ) : null}
          </div>
        </div>

        {data.description_md ? (
          <Markdown source={data.description_md} variant="comment" className="max-w-prose text-text-secondary" />
        ) : canEdit ? (
          <p className="text-text-muted">
            No description. <ActionLink href={settingsHref('general')}>Add a description</ActionLink>
          </p>
        ) : (
          <p className="text-text-muted">No description</p>
        )}
        <p className="text-xs text-text-muted">
          {data.lead ? (
            <>Led by {data.lead.name}</>
          ) : canEdit ? (
            <ActionLink href={settingsHref('general')}>Set a lead</ActionLink>
          ) : (
            'No lead'
          )}{' '}
          · Your role: {PROJECT_ROLE_LABELS[data.my_role]} · Updated{' '}
          <RelativeTime value={fig?.last_updated_at ?? data.updated_at} className="inline" />
        </p>
      </div>

      {isEmpty ? (
        <FirstProjectEmptyState
          projectKey={data.key}
          projectName={data.name}
          canCreate
          canImport={canEdit}
          readOnly={
            data.is_archived
              ? 'It is archived, so nothing new can be filed in it.'
              : data.my_role === 'observer'
                ? 'Contributors and Project Admins add issues here.'
                : null
          }
        />
      ) : (
        <StatRow stats={stats} state={statRowState(figures)} onRetry={() => void figures.refetch()} />
      )}

      {isEmpty ? (
        <div className="grid items-start gap-8 lg:grid-cols-2">
          {people}
          {sprint}
        </div>
      ) : (
        <div className={MAIN_GRID}>
          <div className="flex min-w-0 flex-col gap-8">
            <Section title="By status" count={total === null ? undefined : formatCount(total)}>
              {figures.isPending ? (
                <StripSkeleton />
              ) : figuresFailed ? (
                <FiguresUnavailable />
              ) : (
                <StatusStrip counts={fig?.by_category ?? {}} className="px-2 py-1" />
              )}
            </Section>

            <Section
              title="Team load"
              action={{ label: 'Open issues by assignee', href: (href('#Unresolved') + '&group=assignee') as Route }}
            >
              {figures.isPending ? (
                <RowsSkeleton rows={ROW_SKELETON} columns={['avatar', 'meta', 'title', 'short']} />
              ) : figuresFailed ? (
                <FiguresUnavailable />
              ) : (fig?.by_assignee.length ?? 0) === 0 ? (
                <SectionEmpty>
                  Nobody has open issues.{' '}
                  {fig && fig.unassigned > 0 ? (
                    <Link href={href(UNASSIGNED)}>{formatCount(fig.unassigned)} unassigned</Link>
                  ) : null}
                </SectionEmpty>
              ) : (
                <ul className="flex flex-col divide-y divide-border-subtle rounded-md border">
                  {fig!.by_assignee.map(({ member, open }) => (
                    <li key={member.username}>
                      <LoadRow
                        href={href(`#Unresolved assignee: @${member.username}`)}
                        who={<PersonName person={member} className="text-xs" />}
                        avatar={<MemberAvatar member={member} />}
                        open={open}
                        max={maxLoad}
                      />
                    </li>
                  ))}
                  {fig && fig.unassigned > 0 ? (
                    <li>
                      <LoadRow
                        href={href(UNASSIGNED)}
                        who={<span className="truncate text-xs text-text-muted">Unassigned</span>}
                        avatar={
                          <span className="inline-block size-avatar-sm flex-none rounded-full border border-dashed border-border-strong" />
                        }
                        open={fig.unassigned}
                        max={maxLoad}
                      />
                    </li>
                  ) : null}
                </ul>
              )}
            </Section>
          </div>

          <aside className="flex min-w-0 flex-col gap-8">
            {people}
            {sprint}
          </aside>
        </div>
      )}
    </div>
  );
}

interface Figures {
  open: number;
  overdue: number;
  unassigned: number;
  resolved: number;
  created: number;
  delta: Stat['delta'];
}

// Links stay on while the figures load or fail, so every state insets the outer cells the same way.
function projectStats(key: string, f: Figures | null): Stat[] {
  const href = (q: string) => listHref(q, { project: key });
  const value = (n: number | undefined) => (n === undefined ? 0 : formatCount(n));
  return [
    { label: 'Open', value: value(f?.open), href: href('#Unresolved') },
    { label: 'Overdue', value: value(f?.overdue), alert: true, href: href(OVERDUE) },
    { label: 'Unassigned', value: value(f?.unassigned), href: href(UNASSIGNED) },
    {
      label: 'Resolved in the last 7 days',
      value: value(f?.resolved),
      delta: f?.delta ?? null,
      href: href(RESOLVED_7D),
    },
    { label: 'Created in the last 7 days', value: value(f?.created), href: href(CREATED_7D) },
  ];
}

function LoadRow({
  href,
  who,
  avatar,
  open,
  max,
}: {
  href: Route;
  who: ReactNode;
  avatar: ReactNode;
  open: number;
  max: number;
}) {
  return (
    <Link href={href} className="flex h-row items-center gap-3 px-3 hover:bg-hover">
      <span className="flex w-36 min-w-0 flex-none items-center gap-2 sm:w-56">
        {avatar}
        {who}
      </span>
      <span aria-hidden className="h-1 min-w-6 flex-1 overflow-hidden rounded-full bg-inset">
        <span className="block h-full rounded-full bg-text-muted" style={{ width: `${(open / max) * 100}%` }} />
      </span>
      <span className="w-24 flex-none text-right text-xs whitespace-nowrap tabular text-text-secondary">
        {formatCount(open)} open
      </span>
    </Link>
  );
}

function ActionLink({ href, children }: { href: Route; children: ReactNode }) {
  return (
    <Link href={href} className="action-link text-text-secondary">
      {children}
    </Link>
  );
}

function FiguresUnavailable() {
  return <p className="px-2 py-1 text-xs text-text-secondary">Not available until the figures load.</p>;
}

function StripSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-2 py-1" aria-hidden>
      <Skeleton className="h-1.5" />
      <div className="flex h-4 items-center gap-4">
        {[16, 14, 20, 14, 18].map((w, i) => (
          <Skeleton key={i} className="h-2.5" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
    </div>
  );
}

function SprintSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-md border px-3 py-3" aria-hidden>
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-2.5 w-16" />
      </div>
      <Skeleton className="h-2.5 w-28" />
      <Skeleton className="h-1.5" />
      <Skeleton className="h-2.5 w-3/4" />
    </div>
  );
}

function ProjectHomeSkeleton() {
  return (
    <div className="flex flex-col gap-5" role="status" aria-label="Loading">
      <div className="flex flex-col gap-3">
        <div className={HEADER}>
          <div className="flex items-center gap-3">
            <Skeleton className="size-avatar-lg flex-none rounded-md" />
            <Skeleton className="h-6 w-48" />
          </div>
        </div>
        <div className="flex max-w-prose flex-col">
          {['95%', '80%'].map(w => (
            <div key={w} className="flex h-5 items-center">
              <Skeleton className="h-3" style={{ width: w }} />
            </div>
          ))}
        </div>
        <div className="flex h-4 items-center">
          <Skeleton className="h-2.5 w-72" />
        </div>
      </div>
      <StatRow stats={projectStats('', null)} state="loading" />
      <div className={MAIN_GRID}>
        <div className="flex min-w-0 flex-col gap-8">
          <Section title="By status">
            <StripSkeleton />
          </Section>
          <Section title="Team load">
            <RowsSkeleton rows={ROW_SKELETON} columns={['avatar', 'meta', 'title', 'short']} />
          </Section>
        </div>
        <aside className="flex min-w-0 flex-col gap-8">
          <Section title="People">
            <RowsSkeleton rows={ROW_SKELETON} columns={['avatar', 'title', 'meta']} />
          </Section>
          <Section title="Active sprint">
            <SprintSkeleton />
          </Section>
        </aside>
      </div>
    </div>
  );
}
