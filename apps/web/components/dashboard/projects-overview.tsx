'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { Plus } from 'lucide-react';
import { formatBytes } from '@nothingleft/format';
import type { IssueFigures, Organization, OrgActivity, Project, Sprint } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { Meter } from '@components/dashboard/meter';
import { Section, SectionEmpty } from '@components/dashboard/section';
import { LoadError, StaleNotice, errorDetail } from '@components/query-state';
import { StatRow, statRowState, weekDelta, type Stat, type StatRowState } from '@components/dashboard/stat-row';
import { StatusStrip } from '@components/dashboard/status-strip';
import { MemberAvatar } from '@components/issues/member-avatar';
import { ProjectMark } from '@components/projects/project-mark';
import { SeatBanner } from '@components/invitations/seat-notice';
import { StorageBanner } from '@components/attachments/storage-banner';
import {
  activityDetail,
  activityLabel,
  activitySubject,
  isSystemActivity,
  systemSentence,
  type DetailPart,
} from '@components/organization/activity-labels';
import { ActivityAvatar } from '@components/organization/activity-avatar';
import { RelativeTime } from '@components/relative-time';
import { Segmented } from '@components/segmented';
import { PersonName } from '@components/former-member-chip';
import { useActivity } from '@hooks/use-activity';
import { useIssueFigures } from '@hooks/use-issue-search';
import { useProjects } from '@hooks/use-projects';
import { useActiveSprints } from '@hooks/use-sprints';
import { ActiveSprintLine, backlogHref } from '@components/agile/active-sprint';
import { useSession } from '@hooks/use-session';
import { CREATED_7D, OVERDUE, RESOLVED_7D, UNASSIGNED, listHref } from '@lib/issue-list/links';
import { formatTime } from '@lib/datetime';
import { cn } from '@lib/utils';
import { plural } from '@lib/numbers';

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

interface Read {
  data: unknown;
  isError: boolean;
  dataUpdatedAt: number;
  refetch: () => unknown;
}

const staleRead = (q: Read) => q.isError && q.data !== undefined;

const valueOf = (value: unknown, key: string): string | null => {
  let v = value;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (typeof v !== 'object' || v === null) return null;
  const found = (v as Record<string, unknown>)[key];
  return typeof found === 'string' && found !== '' ? found : null;
};

const projectOf = (row: OrgActivity) =>
  activitySubject(row).projectKey ?? valueOf(row.new_value, 'project') ?? valueOf(row.old_value, 'project');

/** Consecutive rows by one person doing one thing in one place read as one line with a count. */
function bursts(rows: readonly OrgActivity[]) {
  const key = (row: OrgActivity) => `${row.actor?.username ?? ''}|${activityLabel(row)}|${projectOf(row) ?? ''}`;
  const out: { row: OrgActivity; count: number }[] = [];
  for (const row of rows) {
    const last = out.at(-1);
    if (last && key(last.row) === key(row)) last.count += 1;
    else out.push({ row, count: 1 });
  }
  return out;
}

/** `changed an automation` × 5 → `changed 5 automations`; a label without an article keeps a count. */
function burstLabel(label: string, count: number) {
  if (count === 1) return label;
  if (label.includes('someone')) return label.replace('someone', `${count} people`);
  const match = /^(\S+) an? ([^’']+)$/.exec(label);
  if (!match) return `${label} ${count} times`;
  const noun = match[2]!.replace(/([^aeiou])y$/, '$1ie');
  return `${match[1]} ${count} ${noun}s`;
}

const PROJECT_KINDS = new Set(['project_created', 'project_archived', 'project_unarchived', 'project_deleted']);

export function ProjectsOverview({ org, orgAdmin }: { org: Organization; orgAdmin: boolean }) {
  const [scope, setScope] = useState<Scope>('active');
  const [sort, setSort] = useState<Sort>('attention');
  const session = useSession();
  const timeZone = session.status === 'signed-in' ? session.user.timezone : undefined;
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
  const projectNames = new Map([...(active.data ?? []), ...archivedList].map(p => [p.key, p.name]));

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
  const reads: Read[] = [figures, active, archived, sprints, ...(orgAdmin ? [activity] : [])];
  const nothingLoaded = reads.every(q => q.isError && q.data === undefined);
  const stale = reads.filter(staleRead);
  const projectsFailed = active.isError && !active.data;
  const sprintsFailed = sprints.isError && !sprints.data;
  const noProjects = active.data?.length === 0 && archived.data?.length === 0;
  const sprintState = sprints.isPending ? 'loading' : sprintsFailed ? 'failed' : 'ready';

  if (nothingLoaded) {
    return (
      <div className="flex flex-col gap-6">
        <LoadError onRetry={() => reads.forEach(q => void q.refetch())} detail={errorDetail(active.error)}>
          Your projects could not be loaded.
        </LoadError>
        <StatRow stats={stats} state="failed" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {stale.length > 0 ? (
        <StaleNotice onRetry={() => stale.forEach(q => void q.refetch())} className="-mt-1 self-start text-xs">
          These projects could not be refreshed. Showing what loaded at{' '}
          {formatTime(Math.min(...stale.map(q => q.dataUpdatedAt)), timeZone)}.
        </StaleNotice>
      ) : null}
      {orgAdmin && org.seats.over > 0 ? <SeatBanner seats={org.seats} /> : null}
      {orgAdmin ? <StorageBanner storage={org.storage} /> : null}

      {noProjects ? null : (
        <>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <span>Show</span>
              <Segmented ariaLabel="Project scope" value={scope} options={SCOPES} onChange={setScope} />
            </div>
            <div className="flex items-center gap-2 text-xs text-text-muted max-sm:order-1">
              <span>Sort</span>
              <Segmented ariaLabel="Sort projects" value={sort} options={SORTS} onChange={setSort} />
            </div>
            <span className="text-xs text-text-muted tabular max-sm:hidden">
              {active.data
                ? scope === 'active' && archivedList.length > 0
                  ? `${shown.length} active · ${archivedList.length} archived not shown`
                  : `${plural(shown.length, 'project')}`
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

          <div className="flex flex-col gap-3">
            <StatRow stats={stats} state={projectsFailed ? 'failed' : statState} />
            {statState === 'failed' && !projectsFailed ? (
              <LoadError
                onRetry={() => {
                  void figures.refetch();
                  void archived.refetch();
                }}
                detail={errorDetail(figures.error ?? archived.error)}
              >
                These figures could not be loaded.
              </LoadError>
            ) : null}
          </div>
        </>
      )}

      <div
        className={cn('mt-2 grid items-start gap-8', orgAdmin && 'min-[1200px]:grid-cols-[minmax(0,1fr)_var(--rail)]')}
      >
        <div
          className={cn(
            'grid min-w-0 gap-3 min-[900px]:grid-cols-2',
            orgAdmin && 'min-[1200px]:grid-cols-1 min-[1500px]:grid-cols-2',
          )}
        >
          {sprintsFailed && !projectsFailed && ordered.length > 0 ? (
            <div className="min-[900px]:col-span-full">
              <LoadError onRetry={() => void sprints.refetch()} detail={errorDetail(sprints.error)}>
                Sprints could not be loaded.
              </LoadError>
            </div>
          ) : null}
          {active.isPending ? (
            <>
              <ProjectCardSkeleton />
              <ProjectCardSkeleton />
            </>
          ) : projectsFailed ? (
            <div className="min-[900px]:col-span-full">
              <LoadError onRetry={() => void active.refetch()} detail={errorDetail(active.error)}>
                Your projects could not be loaded.
              </LoadError>
            </div>
          ) : noProjects ? (
            <div className="min-[900px]:col-span-full">
              <FirstProject orgAdmin={orgAdmin} />
            </div>
          ) : ordered.length === 0 ? (
            <div className="min-[900px]:col-span-full">
              <SectionEmpty>
                Every project is archived.{' '}
                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className="text-text-secondary underline hover:text-text"
                >
                  Show all projects
                </button>
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
                figuresFailed={figures.isError && !figures.data}
                sprintState={sprintState}
              />
            ))
          )}
        </div>

        {orgAdmin ? (
          <aside className="flex min-w-0 flex-col gap-8 max-[1199px]:grid max-[1199px]:grid-cols-2 max-[1199px]:gap-6 max-md:grid-cols-1">
            <MembersAndLimits org={org} />
            <Section
              title="Organisation activity"
              stale={staleRead(activity)}
              action={{ label: 'Audit log', href: '/organization?tab=audit' as Route }}
            >
              {activity.isPending ? (
                <div className="flex flex-col" aria-hidden>
                  {Array.from({ length: 5 }, (_, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 border-b border-border-subtle px-2 py-2"
                    >
                      <Skeleton className="size-5 rounded-full" />
                      <div className="flex flex-col gap-1.5 pt-1">
                        <Skeleton className="h-3" style={{ width: `${55 + ((i * 17) % 40)}%` }} />
                        <Skeleton className="h-2.5 w-1/3" />
                      </div>
                      <Skeleton className="mt-1 h-2.5 w-12" />
                    </div>
                  ))}
                </div>
              ) : activity.isError && !activity.data ? (
                <LoadError onRetry={() => void activity.refetch()} detail={errorDetail(activity.error)}>
                  Activity could not be loaded.
                </LoadError>
              ) : (activity.data?.rows.length ?? 0) === 0 ? (
                <SectionEmpty>Nothing has happened in the organisation yet.</SectionEmpty>
              ) : (
                <ul className="flex flex-col">
                  {bursts(activity.data!.rows)
                    .slice(0, ACTIVITY_SHOWN)
                    .map(burst => (
                      <ActivityRow
                        key={burst.row.id}
                        row={burst.row}
                        count={burst.count}
                        projectName={key => projectNames.get(key)}
                      />
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

function FirstProject({ orgAdmin }: { orgAdmin: boolean }) {
  return (
    <div className="flex flex-col items-start gap-1 rounded-md border bg-surface px-6 py-8">
      <h2 className="font-semibold">{orgAdmin ? 'Create your first project' : 'No projects yet'}</h2>
      <p className="max-w-prose text-xs text-pretty text-text-secondary">
        {orgAdmin
          ? 'A project holds its issues, board, sprints and reports. Its figures appear here once it has issues.'
          : 'An Org Admin creates projects. Once you are added to one, its figures appear here.'}
      </p>
      {orgAdmin ? (
        <Button asChild size="sm" className="mt-3">
          <Link href={'/projects?new=1' as Route}>
            <Plus className="size-icon-sm" /> New project
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

function ProjectCardSkeleton() {
  return (
    <div aria-hidden className="flex min-w-0 flex-col gap-3 rounded-md border bg-surface px-4 py-3">
      <div className="flex items-center gap-2">
        <Skeleton className="size-6 rounded-sm" />
        <Skeleton className="h-3.5 w-36" />
        <Skeleton className="ml-auto h-3 w-24" />
      </div>
      <div>
        <Skeleton className="h-3.5 w-48" />
        <Skeleton className="mt-2 h-1.5 w-full" />
        <Skeleton className="mt-2 h-2.5 w-56" />
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-2 border-t border-border-subtle pt-3 sm:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-5 w-8" />
            <Skeleton className="h-2.5 w-14" />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 border-t border-border-subtle pt-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-5 w-16 rounded-full" />
        ))}
      </div>
      <div className="flex items-center gap-5">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="ml-auto h-3 w-28" />
      </div>
    </div>
  );
}

function MembersAndLimits({ org }: { org: Organization }) {
  const { used, free, over } = org.seats;
  const seatRatio = free ? used / free : 0;
  const ownBucket = org.storage.bring_your_own === 'verified';
  const storageRatio = ownBucket ? 0 : org.storage.used_bytes / org.storage.limit_bytes;
  return (
    <Section title="Members and limits" action={{ label: 'Organisation settings', href: '/organization' as Route }}>
      <div className="flex flex-col gap-3 px-2 py-1 text-xs">
        <div className="flex flex-col gap-1">
          <div className="flex justify-between gap-3 text-text-secondary">
            <span>Members</span>
            <b className="font-medium tabular text-text">
              {free === null
                ? plural(used, 'member')
                : over > 0
                  ? `${used} · ${over} over the ${free} free seats`
                  : `${used} of ${free} free seats`}
            </b>
          </div>
          {/* Seats past the free allowance block nothing, so their meter never turns amber or red. */}
          {free === null ? null : <Meter ratio={seatRatio} label="Free seats used" className="bg-border" />}
          {free !== null && over === 0 && seatRatio >= NEAR_LIMIT ? (
            <span className="text-2xs text-text-secondary">
              The first {free} members stay free. Nothing is blocked past them.
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex justify-between gap-3 text-text-secondary">
            <span>File storage</span>
            <b className="font-medium tabular text-text">
              {ownBucket
                ? 'Your own bucket'
                : `${formatBytes(org.storage.used_bytes)} of ${formatBytes(org.storage.limit_bytes)}`}
            </b>
          </div>
          {ownBucket ? null : <Meter ratio={storageRatio} quota label="File storage used" className="bg-border" />}
          {storageRatio >= NEAR_LIMIT ? (
            <Link href={'/organization?tab=storage' as Route} className="action-link self-start text-2xs">
              Review stored files
            </Link>
          ) : null}
        </div>
      </div>
    </Section>
  );
}

function DetailLine({
  parts,
  projectName,
  at,
}: {
  parts: readonly DetailPart[] | null;
  projectName: (key: string) => string | undefined;
  at: string;
}) {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5 text-2xs text-text-secondary">
      {parts && parts.length > 0 ? (
        <>
          <span className="min-w-0 truncate">
            {parts.map((part, i) =>
              typeof part === 'string' ? (
                <Fragment key={i}>{part}</Fragment>
              ) : projectName(part.code) !== undefined ? (
                <Link
                  key={i}
                  href={`/projects/${part.code}` as Route}
                  className="font-mono text-text-secondary hover:text-text hover:underline"
                >
                  {part.code}
                </Link>
              ) : (
                <code key={i} className="font-mono">
                  {part.code}
                </code>
              ),
            )}
          </span>
          <span aria-hidden className="text-text-muted">
            ·
          </span>
        </>
      ) : null}
      <RelativeTime value={at} className="shrink-0 whitespace-nowrap" />
    </span>
  );
}

function ActivityRow({
  row,
  count,
  projectName,
}: {
  row: OrgActivity;
  count: number;
  projectName: (key: string) => string | undefined;
}) {
  const project = projectOf(row);
  let detail: DetailPart[] | null;
  if (count > 1) {
    detail = project ? ['In ', { code: project }] : null;
  } else if (PROJECT_KINDS.has(row.kind) && project) {
    const name = valueOf(row.new_value, 'name') ?? valueOf(row.old_value, 'name') ?? projectName(project);
    detail = [{ code: project }, name ? ` ${name}` : ''];
  } else {
    detail = activityDetail(row);
  }
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 border-b border-border-subtle px-2 py-2 text-xs text-text-secondary last:border-b-0">
      <ActivityAvatar row={row} className="size-5" />
      <span className="min-w-0 leading-5">
        {isSystemActivity(row) ? (
          <span className="text-text">{systemSentence(row)}</span>
        ) : (
          <>
            {row.actor ? (
              <PersonName person={row.actor} className="max-w-full align-bottom font-medium text-text" />
            ) : (
              <b className="font-medium text-text">Somebody no longer here</b>
            )}{' '}
            {burstLabel(activityLabel(row), count)}
          </>
        )}
        <DetailLine parts={detail} projectName={projectName} at={row.created_at} />
      </span>
    </li>
  );
}

const CARD_PAGES = [
  { page: 'issues', label: 'Issues' },
  { page: 'board', label: 'Board' },
  { page: 'backlog', label: 'Backlog' },
  { page: 'reports', label: 'Reports' },
] as const;

function ProjectFiguresCard({
  project,
  figures,
  sprint,
  loading,
  figuresFailed,
  sprintState,
}: {
  project: Project;
  figures: IssueFigures | null;
  sprint: Sprint | null;
  loading: boolean;
  figuresFailed: boolean;
  sprintState: 'loading' | 'failed' | 'ready';
}) {
  const base = `/projects/${project.key}`;
  const nums: { label: string; value: number; alert?: boolean; q: string }[] = [
    { label: 'Open', value: figures?.open ?? 0, q: '#Unresolved' },
    { label: 'Unassigned', value: figures?.unassigned ?? 0, q: UNASSIGNED },
    { label: 'Overdue', value: figures?.overdue ?? 0, alert: true, q: OVERDUE },
    { label: 'Created 7d', value: figures?.created_7d ?? 0, q: CREATED_7D },
    { label: 'Resolved 7d', value: figures?.resolved_7d ?? 0, q: RESOLVED_7D },
  ];
  const team = figures?.by_assignee ?? [];

  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-md border bg-surface px-4 py-3">
      <div className="flex items-center gap-2">
        <ProjectMark project={project} size="md" />
        {/* The title gives way first: the lead's name and an Inactive chip stay whole. */}
        <Link href={base as Route} className="min-w-0 truncate font-semibold hover:underline">
          {project.name}
        </Link>
        <span className="shrink-0 font-mono text-xs text-text-muted">{project.key}</span>
        {project.is_archived ? (
          <span className="shrink-0 rounded-sm bg-inset px-1.5 py-0.5 text-2xs text-text-secondary">Archived</span>
        ) : null}
        {project.lead ? (
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-text-secondary">
            <span className="text-text-muted">Lead</span>
            <MemberAvatar member={project.lead} className="size-4" />
            <PersonName person={project.lead} />
          </span>
        ) : null}
      </div>

      {sprint ? (
        <ActiveSprintLine sprint={sprint} />
      ) : sprintState === 'loading' ? (
        <div aria-hidden>
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="mt-2 h-1.5 w-full" />
          <Skeleton className="mt-2 h-2.5 w-56" />
        </div>
      ) : (
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-medium">All issues</span>
            <span className="text-xs text-text-muted">
              {sprintState === 'failed' ? 'Sprint not loaded' : 'No active sprint'}
            </span>
            {sprintState === 'ready' && !project.is_archived ? (
              <Link href={backlogHref(project.key)} className="action-link ml-auto text-xs text-text-secondary">
                Plan one from the backlog
              </Link>
            ) : null}
          </div>
          {loading ? (
            <Skeleton className="mt-2 h-1.5 w-full" />
          ) : figuresFailed ? (
            <div className="mt-2 h-1.5 rounded-full bg-inset" />
          ) : (
            <StatusStrip counts={figures?.by_category ?? {}} tooltipSide="bottom" className="mt-2" />
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-x-3 gap-y-2 border-t border-border-subtle pt-3 sm:grid-cols-5">
        {loading
          ? nums.map(n => (
              <div key={n.label} aria-hidden className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-8" />
                <Skeleton className="h-2.5 w-14" />
              </div>
            ))
          : figuresFailed
            ? nums.map(n => (
                <span key={n.label} className="flex flex-col">
                  <span className="text-md font-semibold text-text-muted" aria-label="Not available">
                    –
                  </span>
                  <span className="text-2xs whitespace-nowrap text-text-muted">{n.label}</span>
                </span>
              ))
            : nums.map(n => (
                <Link
                  key={n.label}
                  href={listHref(n.q, { project: project.key })}
                  className="group/num -mx-1 flex flex-col justify-self-start rounded-xs px-1"
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

      <div className="flex min-h-5 flex-wrap items-center gap-x-3 gap-y-2 border-t border-border-subtle pt-3">
        {loading ? (
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} aria-hidden className="h-5 w-16 rounded-full" />)
        ) : figuresFailed ? (
          <span className="text-xs text-text-muted">Team load is not available.</span>
        ) : team.length === 0 ? (
          <span className="text-xs text-text-muted">Nobody has open issues.</span>
        ) : null}
        {team.slice(0, 4).map(({ member, open }) => {
          const link = (
            <Link
              href={listHref(`#Unresolved assignee: @${member.username}`, { project: project.key })}
              className="inline-flex items-center gap-1.5 rounded-xs text-xs text-text-secondary hover:underline"
            >
              <PersonName person={member} label={member.name.split(' ')[0]} avatar />
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
        {team.length > 4 ? <span className="text-xs text-text-muted tabular">+{team.length - 4}</span> : null}
        {figures && figures.unassigned > 0 ? (
          <Link
            href={listHref(UNASSIGNED, { project: project.key })}
            className="rounded-xs text-xs text-text-muted hover:text-text hover:underline"
          >
            {figures.unassigned} unassigned
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        {CARD_PAGES.map(({ page, label }) => (
          <Link
            key={page}
            href={`${base}/${page}` as Route}
            className="rounded-xs text-text-secondary hover:text-text hover:underline"
          >
            {label}
          </Link>
        ))}
        {loading ? (
          <Skeleton aria-hidden className="ml-auto h-3 w-28" />
        ) : (
          <span className="ml-auto whitespace-nowrap text-text-muted">
            Updated <RelativeTime value={figures?.last_updated_at ?? project.updated_at} className="inline" />
          </span>
        )}
      </div>
    </article>
  );
}
