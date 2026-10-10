'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { Settings } from 'lucide-react';
import { STATUS_CATEGORIES } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { PageHeader } from '@components/page-header';
import { PageSkeleton } from '@components/skeletons';
import { RelativeTime } from '@components/relative-time';
import { FormAlert } from '@components/auth/form-alert';
import { Section, SectionEmpty } from '@components/dashboard/section';
import { StatRow, weekDelta, type Stat } from '@components/dashboard/stat-row';
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
import { PROJECT_ROLE_LABELS } from '@lib/roles';

export function ProjectDashboard({ projectKey }: { projectKey: string }) {
  const project = useProject(projectKey);
  const members = useProjectMembers(projectKey);
  const figures = useIssueFigures({ project: projectKey });
  const sprints = useSprints(projectKey);
  useRecordProjectVisit(project.data && !project.data.is_archived ? projectKey : null);

  if (project.isPending) return <PageSkeleton rows={4} />;
  if (project.isError || !project.data) return <FormAlert title="This project could not be loaded." />;

  const data = project.data;
  const active = sprints.data?.find(s => s.state === 'active') ?? null;
  const fig = figures.data?.[0] ?? null;
  const total = fig ? STATUS_CATEGORIES.reduce((n, c) => n + (fig.by_category[c] ?? 0), 0) : null;
  const delta = fig ? fig.resolved_7d - fig.resolved_prev_7d : 0;
  const canCreate = !data.is_archived && data.my_role !== 'observer';
  const href = (q: string) => listHref(q, { project: data.key });

  const stats: Stat[] = fig
    ? [
        { label: 'Open', value: fig.open, href: href('#Unresolved') },
        { label: 'Overdue', value: fig.overdue, alert: true, href: href(OVERDUE) },
        { label: 'Unassigned', value: fig.unassigned, href: href(UNASSIGNED) },
        {
          label: 'Resolved in the last 7 days',
          value: fig.resolved_7d,
          delta: weekDelta(delta),
          href: href(RESOLVED_7D),
        },
        { label: 'Created in the last 7 days', value: fig.created_7d, href: href(CREATED_7D) },
      ]
    : [
        { label: 'Open', value: 0 },
        { label: 'Overdue', value: 0 },
        { label: 'Unassigned', value: 0 },
        { label: 'Resolved in the last 7 days', value: 0 },
        { label: 'Created in the last 7 days', value: 0 },
      ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={data.name}
        meta={
          <span className="flex items-center gap-2">
            <span className="font-mono">{data.key}</span>
            {data.is_archived ? (
              <span className="rounded-sm bg-inset px-1.5 py-0.5 text-2xs text-text-secondary">Archived</span>
            ) : null}
          </span>
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`/projects/${data.key}/issues` as Route}>Issues</Link>
            </Button>
            {data.my_role === 'project_admin' ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/projects/${data.key}/settings` as Route}>
                  <Settings className="size-icon-sm" /> Settings
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="flex items-start gap-4">
        <ProjectMark project={data} />
        <div className="flex min-w-0 flex-col gap-1">
          {data.description_md ? (
            <p className="max-w-prose text-text-secondary">{data.description_md}</p>
          ) : (
            <p className="text-text-muted">No description</p>
          )}
          <p className="text-xs text-text-muted">
            {data.lead ? `Led by ${data.lead.name}` : 'No lead'} · you are {PROJECT_ROLE_LABELS[data.my_role]} here ·
            updated <RelativeTime value={fig?.last_updated_at ?? data.updated_at} className="inline" />
          </p>
        </div>
      </div>

      {figures.isError ? <FormAlert title="The figures could not be loaded." /> : null}

      {total === 0 && !figures.isPending ? (
        <FirstProjectEmptyState projectName={data.name} canCreate={canCreate} />
      ) : (
        <StatRow stats={stats} state={figures.isPending ? 'loading' : 'ready'} />
      )}

      <div className="grid items-start gap-8 min-[1200px]:grid-cols-[minmax(0,1fr)_var(--rail)]">
        <div className="flex min-w-0 flex-col gap-8">
          <Section title="By status" count={total ?? undefined}>
            {figures.isPending ? (
              <Skeleton className="mx-2 h-1.5" />
            ) : total === 0 ? (
              <SectionEmpty>The strip fills in as issues move through statuses.</SectionEmpty>
            ) : (
              <StatusStrip counts={fig?.by_category ?? {}} className="px-2 py-1" />
            )}
          </Section>

          <Section
            title="Team load"
            action={{ label: 'Open issues by assignee', href: (href('#Unresolved') + '&group=assignee') as Route }}
          >
            {figures.isPending ? (
              <Skeleton className="mx-2 h-9" />
            ) : (fig?.by_assignee.length ?? 0) === 0 ? (
              <SectionEmpty>
                Nobody has open issues.{' '}
                {fig && fig.unassigned > 0 ? <Link href={href(UNASSIGNED)}>{fig.unassigned} unassigned</Link> : null}
              </SectionEmpty>
            ) : (
              <ul className="flex flex-col divide-y divide-border-subtle rounded-md border">
                {fig!.by_assignee.map(({ member, open }) => (
                  <li key={member.username}>
                    <Link
                      href={href(`#Unresolved assignee: @${member.username}`)}
                      className="flex h-row items-center gap-2 px-3 hover:bg-hover"
                    >
                      <MemberAvatar member={member} />
                      <PersonName person={member} className="flex-1 text-xs" />
                      <span className="text-xs tabular text-text-secondary">{open} open</span>
                    </Link>
                  </li>
                ))}
                {fig && fig.unassigned > 0 ? (
                  <li>
                    <Link
                      href={href(UNASSIGNED)}
                      className="flex h-row items-center gap-2 px-3 text-text-muted hover:bg-hover"
                    >
                      <span className="inline-block size-avatar-sm rounded-full border border-dashed border-border-strong" />
                      <span className="min-w-0 flex-1 truncate text-xs">Unassigned</span>
                      <span className="text-xs tabular">{fig.unassigned} open</span>
                    </Link>
                  </li>
                ) : null}
              </ul>
            )}
          </Section>
        </div>

        <aside className="flex min-w-0 flex-col gap-8">
          <Section
            title="People"
            count={members.data?.length}
            action={
              data.my_role === 'project_admin'
                ? { label: 'Manage', href: `/projects/${data.key}/settings?tab=people` as Route }
                : undefined
            }
          >
            {members.isPending ? (
              <Skeleton className="h-24 rounded-md" />
            ) : (members.data ?? []).length === 0 ? (
              <SectionEmpty>Nobody has been added yet.</SectionEmpty>
            ) : (
              <ul className="flex flex-col divide-y divide-border-subtle rounded-md border">
                {(members.data ?? []).slice(0, 8).map(member => (
                  <li key={member.username} className="flex h-row items-center gap-2 px-3">
                    <MemberAvatar member={member} initialsClassName="text-[10px]" />
                    <PersonName person={member} className="flex-1 text-xs" />
                    <span className="text-xs text-text-muted">{PROJECT_ROLE_LABELS[member.role]}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Active sprint">
            {sprints.isPending ? (
              <Skeleton className="h-32 rounded-md" />
            ) : active ? (
              <ActiveSprintPanel sprint={active} />
            ) : (
              <SectionEmpty>
                {data.name} has no active sprint. <Link href={backlogHref(data.key)}>Plan one from the backlog</Link>
              </SectionEmpty>
            )}
          </Section>
        </aside>
      </div>
    </div>
  );
}
