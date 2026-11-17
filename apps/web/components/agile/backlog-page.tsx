'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronRight, GripVertical, MoreHorizontal, Plus, SquareKanban } from 'lucide-react';
import { RESOLVED_STATUS_CATEGORIES, type Issue, type Sprint } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { LoadError, errorDetail, notFoundOn404 } from '@components/query-state';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { EmptyState } from '@components/empty-state';
import { IssueKey } from '@components/issue-key';
import { PageHeader } from '@components/page-header';
import { ArchivedNotice } from '@components/projects/archived-notice';
import { ReadOnlyNotice } from '@components/projects/read-only-notice';
import { Meter } from '@components/dashboard/meter';
import { AssigneeStack } from '@components/issues/assignee-stack';
import { PriorityBadge, StatusDot, TypeBadge } from '@components/issues/value-marks';
import { QueryBar, type QueryProblem } from '@components/issues/list/query-bar';
import { DaysLeft, SprintDates } from '@components/agile/sprint-dates';
import { StoryPoints } from '@components/agile/story-points';
import {
  DeleteSprintDialog,
  FinishSprintDialog,
  SprintFormDialog,
  StartSprintDialog,
  nextSprintName,
} from '@components/agile/sprint-dialogs';
import { BACKLOG_PAGE_SIZE, useBacklog, useBacklogMove, type BacklogDrop } from '@hooks/use-backlog';
import { useBoards } from '@hooks/use-boards';
import { useProject } from '@hooks/use-projects';
import { useProjectRoles } from '@hooks/use-project-roles';
import { useRecordProjectVisit } from '@hooks/use-project-visit';
import { useSession } from '@hooks/use-session';
import { useSprints } from '@hooks/use-sprints';
import { isApiError } from '@lib/api/errors';
import { issuePath } from '@lib/issue-path';
import { cn } from '@lib/utils';
import { toastError } from '@components/toast-error';
import { LoadMore } from '@components/text-button';
import { formatCount } from '@lib/numbers';

export const BACKLOG_DEFAULT_QUERY = '#Unresolved';
const BACKLOG = 'backlog';
const DROP_PREFIX = 'container:';

type Hint = { container: string; key: string | null; side: 'before' | 'after' } | null;

interface DragData {
  container: string;
  issue?: Issue;
}

export function BacklogPage({ projectKey }: { projectKey: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get('q') ?? BACKLOG_DEFAULT_QUERY;
  const session = useSession();
  const timeZone = session.status === 'signed-in' ? session.user.timezone : undefined;
  useRecordProjectVisit(projectKey);

  const project = useProject(projectKey);
  const roles = useProjectRoles();
  const canPlan = roles.canEdit(projectKey);
  const canManage = roles.canAdmin(projectKey);
  const sprints = useSprints(projectKey);
  const boards = useBoards(projectKey);
  const move = useBacklogMove(projectKey);

  const open = useMemo(
    () =>
      (sprints.data ?? [])
        .filter(s => s.state !== 'completed')
        .sort((a, b) => (a.state === 'active' ? -1 : b.state === 'active' ? 1 : 0)),
    [sprints.data],
  );
  const active = open.find(s => s.state === 'active') ?? null;
  const planned = open.filter(s => s.state === 'planned');
  const nextUp = planned[0] ?? null;
  const carryFrom = active ?? [...planned].reverse().find(s => s.progress.issues > s.progress.resolved_issues) ?? null;
  const boardSlug = boards.data?.[0]?.slug;
  // Fetched while the sprints load, so the backlog does not wait for its section to mount.
  useBacklog(projectKey, null, q);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Sprint | null>(null);
  const [starting, setStarting] = useState<Sprint | null>(null);
  const [finishing, setFinishing] = useState<Sprint | null>(null);
  const [deleting, setDeleting] = useState<Sprint | null>(null);

  const [dragging, setDragging] = useState<Issue | null>(null);
  const [hint, setHint] = useState<Hint>(null);
  // Keys up to KEY-999 fit before anything loads, so the titles rarely shift once rows arrive.
  const [keyChars, setKeyChars] = useState(projectKey.length + 4);
  const fitKeys = useCallback((chars: number) => setKeyChars(n => Math.max(n, chars)), []);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const commit = (next: string) =>
    router.replace(`${pathname}?q=${encodeURIComponent(next)}` as Route, { scroll: false });

  const dropOf = (event: DragOverEvent | DragEndEvent): Hint => {
    const { active: dragged, over } = event;
    if (!over) return null;
    const from = (dragged.data.current as DragData).container;
    const target = over.data.current as (DragData & { sortable?: { index: number } }) | undefined;
    if (!target) return null;
    if (String(over.id).startsWith(DROP_PREFIX)) return { container: target.container, key: null, side: 'after' };
    if (over.id === dragged.id) return null;
    if (target.container === from) {
      const oldIndex = (dragged.data.current as { sortable: { index: number } }).sortable.index;
      const newIndex = target.sortable?.index ?? 0;
      return { container: from, key: String(over.id), side: newIndex > oldIndex ? 'after' : 'before' };
    }
    const moving = dragged.rect.current.translated;
    const below = moving ? moving.top + moving.height / 2 > over.rect.top + over.rect.height / 2 : false;
    return { container: target.container, key: String(over.id), side: below ? 'after' : 'before' };
  };

  const onDragStart = (event: DragStartEvent) => setDragging((event.active.data.current as DragData).issue ?? null);
  const onDragOver = (event: DragOverEvent) => {
    const next = dropOf(event);
    // Within one list the rows move aside themselves; a line is only needed across lists.
    setHint(next && next.container !== (event.active.data.current as DragData).container ? next : null);
  };
  // A refusal is answered by the refreshed list, so only a fault on our side or the network offers a retry.
  const send = (body: BacklogDrop) =>
    move.mutate(body, {
      onError: error =>
        toastError(
          `Could not move ${body.issues[0]}`,
          error,
          isApiError(error) && error.status < 500 && !error.isRateLimited ? {} : { retry: () => send(body) },
        ),
    });
  // A pointer drag leaves the grip focused, which would keep it showing beside the hovered row's.
  const releaseGrip = (event: DragEndEvent) => {
    if (!(event.activatorEvent instanceof KeyboardEvent) && document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
  };
  const onDragEnd = (event: DragEndEvent) => {
    const drop = dropOf(event);
    setDragging(null);
    setHint(null);
    releaseGrip(event);
    if (!drop) return;
    const key = String(event.active.id);
    const from = (event.active.data.current as DragData).container;
    if (drop.container === from && drop.key === null) return;
    const body: BacklogDrop = { issues: [key], sprint: drop.container === BACKLOG ? null : drop.container };
    if (drop.key) body[drop.side] = drop.key;
    send(body);
  };

  const listedName = roles.projects.find(p => p.key === projectKey)?.name;
  const projectName = project.data?.name ?? listedName;
  const header = (
    <PageHeader
      title="Backlog"
      meta={projectName ?? (project.isPending ? <Skeleton className="h-3.5 w-28" /> : projectKey)}
      actions={
        project.isError && !project.data ? undefined : (
          <>
            {boards.isPending ? (
              <Skeleton className="h-8 w-[83px] rounded-md max-sm:w-8" />
            ) : boardSlug ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/projects/${projectKey}/board/${boardSlug}/current` as Route}>
                  <SquareKanban />
                  <span className="max-sm:sr-only">Board</span>
                </Link>
              </Button>
            ) : null}
            {roles.isPending ? (
              <Skeleton className="h-8 w-28 rounded-md max-sm:w-8" />
            ) : canManage ? (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus />
                <span className="max-sm:sr-only">New sprint</span>
              </Button>
            ) : null}
          </>
        )
      }
    />
  );

  if (project.isError && !project.data) {
    notFoundOn404(project.error);
    return (
      <div className="flex flex-col gap-6">
        {header}
        <LoadError onRetry={() => void project.refetch()} detail={errorDetail(project.error)}>
          This project could not be loaded.
        </LoadError>
      </div>
    );
  }

  const slots: HeaderSlots = { actions: canManage };
  const archived = project.data?.is_archived ?? false;
  const unarchivable = archived && (roles.orgAdmin || project.data?.my_role === 'project_admin');
  // Everything below the header lands at once: sections arriving one after another would push the backlog down.
  const settling = sprints.isPending || roles.isPending || project.isPending;

  return (
    <div
      className="flex flex-col gap-6"
      style={{ '--key-w': `${Math.ceil(keyChars * KEY_CHAR_PX)}px` } as CSSProperties}
    >
      {header}

      {settling ? null : archived ? (
        <ArchivedNotice>
          {projectName ?? projectKey} is archived, so its sprints and backlog are read-only.
          {unarchivable ? (
            <>
              {' '}
              <Link href={`/projects/${projectKey}/settings` as Route} className="action-link hover:text-text">
                Unarchive it in settings
              </Link>
            </>
          ) : null}
        </ArchivedNotice>
      ) : !canPlan ? (
        <ReadOnlyNotice>
          You can read this backlog. Ordering issues needs the Contributor role; planning sprints, Project Admin.
        </ReadOnlyNotice>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={event => {
          setDragging(null);
          setHint(null);
          releaseGrip(event);
        }}
      >
        {settling ? (
          <div className="flex flex-col gap-6" role="status" aria-label="Loading">
            <SectionSkeleton slots={{ actions: canManage || roles.isPending }} />
            <BacklogSkeleton />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {!sprints.data ? (
              <LoadError onRetry={() => void sprints.refetch()} detail={errorDetail(sprints.error)}>
                The sprints could not be loaded.
              </LoadError>
            ) : open.length === 0 ? (
              <EmptyState
                title={`${projectName ?? projectKey} has no sprint planned.`}
                description={
                  canManage
                    ? 'Plan one, then drag issues into it from the backlog below.'
                    : archived
                      ? 'An archived project plans no sprints.'
                      : 'A Project Admin plans sprints; you can still order the backlog.'
                }
                action={
                  canManage ? (
                    <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
                      <Plus />
                      New sprint
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              open.map(sprint => (
                <SprintSection
                  key={sprint.slug}
                  projectKey={projectKey}
                  sprint={sprint}
                  canPlan={canPlan}
                  canManage={canManage}
                  slots={slots}
                  hint={hint}
                  boardSlug={boardSlug}
                  start={sprint.slug === nextUp?.slug ? (active ? 'blocked' : 'button') : active ? 'none' : 'menu'}
                  activeName={active?.name ?? null}
                  onKeys={fitKeys}
                  onStart={() => setStarting(sprint)}
                  onFinish={() => setFinishing(sprint)}
                  onEdit={() => setEditing(sprint)}
                  onDelete={() => setDeleting(sprint)}
                />
              ))
            )}

            <BacklogSection
              projectKey={projectKey}
              q={q}
              onCommit={commit}
              canPlan={canPlan}
              hint={hint}
              onKeys={fitKeys}
            />
          </div>
        )}

        <DragOverlay dropAnimation={null}>
          {dragging ? <IssueLine issue={dragging} draggable overlay /> : null}
        </DragOverlay>
      </DndContext>

      <SprintFormDialog
        projectKey={projectKey}
        projectName={project.data?.name ?? projectKey}
        open={creating || editing !== null}
        onOpenChange={o => {
          if (!o) {
            setCreating(false);
            setEditing(null);
          }
        }}
        sprint={editing}
        carryFrom={carryFrom}
        suggestedName={nextSprintName(sprints.data ?? [])}
      />
      <StartSprintDialog
        projectKey={projectKey}
        sprint={starting}
        timeZone={timeZone}
        onOpenChange={o => !o && setStarting(null)}
      />
      <FinishSprintDialog
        projectKey={projectKey}
        sprint={finishing}
        planned={planned}
        onOpenChange={o => !o && setFinishing(null)}
      />
      <DeleteSprintDialog projectKey={projectKey} sprint={deleting} onOpenChange={o => !o && setDeleting(null)} />
    </div>
  );
}

// JetBrains Mono advances 0.6em; issue keys are set at 12px.
const KEY_CHAR_PX = 7.2;

interface HeaderSlots {
  /** The admin's primary action and ⋯ menu, kept one width so every header's stats and bar line up. */
  actions: boolean;
}

const ACTIONS_SLOT = 'w-44';
const STATS_SLOT = 'min-w-52';
const METER_SLOT = 'w-24';

function sprintStats(progress: Sprint['progress']) {
  if (progress.issues === 0) return { long: 'No issues', short: 'No issues', ratio: 0, label: 'No issues' };
  const issues = `${formatCount(progress.resolved_issues)} of ${formatCount(progress.issues)} resolved`;
  const short = `${formatCount(progress.resolved_issues)}/${formatCount(progress.issues)}`;
  if (progress.points === 0) {
    const ratio = progress.resolved_issues / progress.issues;
    return {
      long: `${issues} · ? points`,
      short: `${short} · ? pts`,
      ratio,
      label: `${Math.round(ratio * 100)}% of the issues resolved`,
    };
  }
  const ratio = progress.resolved_points / progress.points;
  return {
    long: `${issues} · ${formatCount(progress.resolved_points)} of ${formatCount(progress.points)} points`,
    short: `${short} · ${formatCount(progress.resolved_points)}/${formatCount(progress.points)} pts`,
    ratio,
    label: `${Math.round(ratio * 100)}% of the points resolved`,
  };
}

interface SprintSectionProps {
  projectKey: string;
  sprint: Sprint;
  canPlan: boolean;
  canManage: boolean;
  slots: HeaderSlots;
  hint: Hint;
  boardSlug: string | undefined;
  /**
   * Only the next planned sprint offers Start in its header, disabled while another runs; the rest
   * offer it in the ⋯ menu when nothing runs.
   */
  start: 'button' | 'blocked' | 'menu' | 'none';
  activeName: string | null;
  onKeys: (chars: number) => void;
  onStart: () => void;
  onFinish: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function SprintSection({
  projectKey,
  sprint,
  canPlan,
  canManage,
  slots,
  hint,
  boardSlug,
  start,
  activeName,
  onKeys,
  onStart,
  onFinish,
  onEdit,
  onDelete,
}: SprintSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const list = useBacklog(projectKey, sprint.slug, '', expanded);
  const issues = useMemo(() => list.data?.pages.flatMap(p => p.data) ?? [], [list.data]);
  const isActive = sprint.state === 'active';
  const stats = sprintStats(sprint.progress);
  const total = list.data?.pages[0]?.meta.pagination?.total;

  return (
    <section aria-label={sprint.name} className={cn('flex flex-col', !expanded && '-mb-4')}>
      <header className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-0.5 border-y bg-app px-2 py-0.5">
        <div className="flex min-w-0 flex-1 items-center gap-x-3">
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
            className="-ml-1 flex min-w-0 items-center gap-2 rounded-sm px-1 text-left hover:bg-hover"
          >
            <ChevronRight
              className={cn(
                'size-3.5 flex-none text-text-muted transition-transform duration-(--dur-fast)',
                expanded && 'rotate-90',
              )}
            />
            <span className="truncate font-semibold">{sprint.name}</span>
          </button>
          {isActive ? (
            <span className="c-amber flex-none rounded-xs bg-c-bg px-1.5 text-2xs leading-[18px] font-medium text-c-fg">
              Active
            </span>
          ) : null}
          <span className="flex flex-none items-center gap-x-3 max-sm:hidden">
            <SprintDates sprint={sprint} className="text-xs" />
            <DaysLeft days={sprint.days_left} />
          </span>
        </div>

        <div className="flex flex-none items-center gap-3 max-sm:hidden">
          <span className={cn('text-right text-xs text-text-secondary tabular', STATS_SLOT)}>{stats.long}</span>
          <Meter
            ratio={stats.ratio}
            label={stats.label}
            className={cn('bg-border', METER_SLOT, sprint.progress.issues === 0 && 'invisible')}
          />
        </div>

        {slots.actions ? (
          <div
            className={cn(
              'flex flex-none items-center justify-end gap-1',
              ACTIONS_SLOT,
              'max-sm:w-auto max-sm:max-w-[55%]',
            )}
          >
            {canManage ? (
              <>
                {isActive ? (
                  <Button size="sm" variant="outline" onClick={onFinish}>
                    Finish sprint
                  </Button>
                ) : start === 'button' || start === 'blocked' ? (
                  <StartButton blockedBy={start === 'blocked' ? activeName : null} onClick={onStart} />
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon-sm" variant="ghost" aria-label={`${sprint.name} actions`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {start === 'menu' ? <DropdownMenuItem onSelect={onStart}>Start sprint</DropdownMenuItem> : null}
                    <DropdownMenuItem onSelect={onEdit}>Edit sprint</DropdownMenuItem>
                    {boardSlug ? (
                      <DropdownMenuItem asChild>
                        <Link href={`/projects/${projectKey}/board/${boardSlug}/${sprint.slug}` as Route}>
                          Open board
                        </Link>
                      </DropdownMenuItem>
                    ) : null}
                    {isActive ? null : (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                          Delete sprint
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="flex min-w-0 basis-full flex-wrap items-center gap-x-3 gap-y-0.5 pb-1 pl-5.5 text-xs whitespace-nowrap sm:hidden">
          <SprintDates sprint={sprint} />
          <DaysLeft days={sprint.days_left} />
          <span className="ml-auto flex items-center gap-x-3">
            <span className="text-text-secondary tabular">{stats.short}</span>
            {sprint.progress.issues > 0 ? (
              <Meter ratio={stats.ratio} label={stats.label} className="w-10 flex-none bg-border" />
            ) : null}
          </span>
        </div>
      </header>

      {expanded ? (
        <>
          {sprint.goal_md ? (
            <div className="border-b border-border-subtle py-2 pr-2 pl-7.5">
              <p className="max-w-[72ch] text-xs text-pretty text-text-secondary">{plainGoal(sprint.goal_md)}</p>
            </div>
          ) : null}
          <Container
            id={sprint.slug}
            issues={issues}
            total={total}
            loading={list.isPending}
            skeletonRows={Math.max(1, Math.min(sprint.progress.issues, BACKLOG_PAGE_SIZE))}
            failed={
              list.isError && !list.data ? (
                <LoadError onRetry={() => void list.refetch()} detail={errorDetail(list.error)}>
                  {`${sprint.name} could not be loaded.`}
                </LoadError>
              ) : null
            }
            canPlan={canPlan}
            hint={hint}
            onKeys={onKeys}
            empty={canPlan ? 'Drag issues here from the backlog.' : 'Nothing is planned into this sprint yet.'}
            more={list.hasNextPage ? () => void list.fetchNextPage() : undefined}
            loadingMore={list.isFetchingNextPage}
          />
        </>
      ) : null}
    </section>
  );
}

export function StartButton({ blockedBy, onClick }: { blockedBy: string | null; onClick: () => void }) {
  if (!blockedBy) {
    return (
      <Button size="sm" variant="outline" onClick={onClick}>
        Start sprint
      </Button>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="rounded-sm">
          <Button size="sm" variant="outline" disabled className="pointer-events-none">
            Start sprint
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{blockedBy} is running. Finish it first: one sprint runs at a time.</TooltipContent>
    </Tooltip>
  );
}

// The goal is markdown; one line of plain text is enough beside the header.
const plainGoal = (md: string) =>
  md
    .replace(/[*_`#>]+/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .split('\n')
    .find(line => line.trim() !== '')
    ?.trim() ?? '';

function BacklogSection({
  projectKey,
  q,
  onCommit,
  canPlan,
  hint,
  onKeys,
}: {
  projectKey: string;
  q: string;
  onCommit: (q: string) => void;
  canPlan: boolean;
  hint: Hint;
  onKeys: (chars: number) => void;
}) {
  const list = useBacklog(projectKey, null, q);
  const refused = list.isError && isApiError(list.error) && list.error.status === 400;
  // A refused query keeps the rows that were on screen; opened with one, it shows the unfiltered backlog.
  const [lastGood, setLastGood] = useState<typeof list.data>(undefined);
  if (list.data && !list.isPlaceholderData && lastGood !== list.data) setLastGood(list.data);
  const unfiltered = useBacklog(projectKey, null, '', refused && !lastGood);
  const shown = list.data ?? (refused ? (lastGood ?? unfiltered.data) : undefined);
  const issues = useMemo(() => shown?.pages.flatMap(p => p.data) ?? [], [shown]);
  const total = shown?.pages[0]?.meta.pagination?.total;

  // A narrowing of the default query counts against the unresolved backlog; anything else against all of it.
  const trimmed = q.trim();
  const base = UNRESOLVED_TOKEN.test(trimmed) ? BACKLOG_DEFAULT_QUERY : '';
  const filtered = trimmed !== base;
  const whole = useBacklog(projectKey, null, base, filtered);
  const wholeTotal = filtered && !refused ? whole.data?.pages[0]?.meta.pagination?.total : undefined;

  const problem = useMemo<QueryProblem | null>(() => {
    const error = list.error;
    if (!error || !isApiError(error) || error.status !== 400) return null;
    return {
      message: error.message,
      span: error.field === 'q' && error.span ? error.span : null,
      validValues: error.validValues ?? [],
    };
  }, [list.error]);

  return (
    <section aria-label="Backlog" className="flex flex-col">
      <header className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-0.5 border-y bg-app px-2 py-0.5">
        <span className="pl-5.5 font-semibold">Backlog</span>
        {total !== undefined ? (
          <span className="text-text-muted tabular">
            {formatCount(total)}
            {wholeTotal !== undefined && wholeTotal !== total ? ` of ${formatCount(wholeTotal)}` : ''}
          </span>
        ) : list.isPending ? (
          <Skeleton className="h-3 w-6" />
        ) : null}
        <span className="text-xs text-text-secondary max-sm:basis-full max-sm:pl-5.5">
          {refused && shown
            ? 'These are the last valid filter’s results; fix the filter to update them.'
            : 'Issues in no sprint, in the order they will be picked up.'}
        </span>
      </header>
      <div className="border-b border-border-subtle py-2">
        <QueryBar
          value={q}
          onCommit={onCommit}
          problem={problem}
          placeholder="Filter the backlog · #Unresolved type: Bug"
        />
      </div>
      <Container
        id={BACKLOG}
        issues={issues}
        total={total}
        loading={list.isPending || (refused && !shown)}
        failed={
          list.isError && !shown ? (
            <LoadError onRetry={() => void list.refetch()} detail={errorDetail(list.error)}>
              The backlog could not be loaded.
            </LoadError>
          ) : null
        }
        canPlan={canPlan}
        hint={hint}
        onKeys={onKeys}
        empty={
          trimmed === '' || trimmed === BACKLOG_DEFAULT_QUERY ? (
            'The backlog is empty: every unresolved issue is planned into a sprint.'
          ) : (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              No issue in the backlog matches this filter.
              <Button size="xs" variant="outline" onClick={() => onCommit(BACKLOG_DEFAULT_QUERY)}>
                Clear filter
              </Button>
            </span>
          )
        }
        more={list.hasNextPage ? () => void list.fetchNextPage() : undefined}
        loadingMore={list.isFetchingNextPage}
      />
    </section>
  );
}

const UNRESOLVED_TOKEN = /(^|\s)#unresolved(\s|$)/i;

// From 900px the key column holds at least seven mono characters, so titles start at one x across projects.
const GRID =
  'grid h-row grid-cols-[20px_18px_18px_var(--key-w,84px)_minmax(0,1fr)_auto] items-center gap-x-2 pr-3 min-[900px]:grid-cols-[20px_18px_18px_max(var(--key-w,84px),51px)_minmax(0,1fr)_140px_120px_28px]';

interface ContainerProps {
  id: string;
  issues: readonly Issue[];
  /** Everything in the container, loaded or not. */
  total: number | undefined;
  loading: boolean;
  /** How many rows are coming, when the container already knows. */
  skeletonRows?: number;
  failed?: ReactNode;
  canPlan: boolean;
  hint: Hint;
  onKeys: (chars: number) => void;
  empty: ReactNode;
  more: (() => void) | undefined;
  loadingMore: boolean;
}

function Container({
  id,
  issues,
  total,
  loading,
  skeletonRows,
  failed,
  canPlan,
  hint,
  onKeys,
  empty,
  more,
  loadingMore,
}: ContainerProps) {
  const { setNodeRef } = useDroppable({ id: `${DROP_PREFIX}${id}`, data: { container: id }, disabled: !canPlan });
  const targeted = hint?.container === id;
  const longestKey = issues.reduce((n, issue) => Math.max(n, issue.key.length), 0);
  useEffect(() => onKeys(longestKey), [onKeys, longestKey]);

  if (loading) return <RowsSkeleton rows={skeletonRows} />;
  if (failed) return <div className="py-2">{failed}</div>;

  const left = total !== undefined ? total - issues.length : undefined;
  return (
    <div
      ref={setNodeRef}
      className={cn('flex flex-col transition-colors', targeted && hint?.key === null && 'bg-selected')}
    >
      <SortableContext id={id} items={issues.map(i => i.key)} strategy={verticalListSortingStrategy}>
        {issues.map(issue => (
          <SortableLine
            key={issue.key}
            issue={issue}
            container={id}
            canPlan={canPlan}
            line={targeted && hint?.key === issue.key ? hint.side : null}
          />
        ))}
      </SortableContext>
      {issues.length === 0 ? (
        <div
          className={cn(
            'my-2 rounded-md border px-3 py-3 text-xs text-text-secondary',
            targeted && 'border-brand bg-selected',
          )}
        >
          {empty}
        </div>
      ) : null}
      {more ? (
        <LoadMore
          className="py-2 pl-7"
          pending={loadingMore}
          onClick={more}
          progress={total !== undefined ? `${formatCount(issues.length)} of ${formatCount(total)}` : undefined}
        >
          {left !== undefined ? `Load ${formatCount(Math.min(BACKLOG_PAGE_SIZE, left))} more` : 'Load more'}
        </LoadMore>
      ) : null}
    </div>
  );
}

function SortableLine({
  issue,
  container,
  canPlan,
  line,
}: {
  issue: Issue;
  container: string;
  canPlan: boolean;
  line: 'before' | 'after' | null;
}) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({
    id: issue.key,
    data: { container, issue },
    disabled: !canPlan,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition: transition }}
      className={cn(
        'relative',
        isDragging && 'opacity-40',
        line &&
          'after:pointer-events-none after:absolute after:inset-x-0 after:h-0.5 after:rounded-full after:bg-brand',
        line === 'before' && 'after:-top-px',
        line === 'after' && 'after:-bottom-px',
      )}
    >
      <IssueLine
        issue={issue}
        draggable={canPlan}
        handle={
          canPlan ? (
            <button
              type="button"
              aria-label={`Move ${issue.key}`}
              className="mx-auto grid h-7 w-4 cursor-grab place-items-center rounded-xs text-text-muted reveal group-hover/line:opacity-100 hover:text-text active:cursor-grabbing"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-3.5" />
            </button>
          ) : null
        }
      />
    </div>
  );
}

function IssueLine({
  issue,
  draggable,
  handle,
  overlay = false,
}: {
  issue: Issue;
  draggable: boolean;
  handle?: ReactNode;
  overlay?: boolean;
}) {
  const resolved = RESOLVED_STATUS_CATEGORIES.includes(issue.status.category);
  return (
    <div
      className={cn(
        'group/line border-b border-border-subtle bg-surface hover:bg-hover',
        GRID,
        // A ring, not a border, so the lifted row's columns stay on the list's x.
        overlay && 'rounded-md border-b-0 bg-raised shadow-lg ring-1 ring-border-strong hover:bg-raised',
      )}
    >
      <span className="flex h-full items-center">{draggable ? handle : null}</span>
      <PriorityBadge priority={issue.priority} className={cn(resolved && 'grayscale')} />
      <TypeBadge type={issue.type} className={cn(resolved && 'grayscale')} />
      <IssueKey issueKey={issue.key} resolved={resolved} />
      <Link
        href={issuePath(issue) as Route}
        title={issue.title}
        className={cn('truncate', resolved ? 'text-text-muted line-through hover:text-text' : 'hover:underline')}
      >
        {issue.title}
      </Link>
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-text-secondary max-[899px]:hidden">
        <StatusDot category={issue.status.category} color={issue.status.color} />
        <span className="truncate">{issue.status.name}</span>
      </span>
      {issue.assignees.length > 1 ? (
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-text-secondary max-[899px]:hidden">
          <AssigneeStack assignees={issue.assignees} withName={false} className="flex-none" />
          <span className="truncate tabular">{issue.assignees.length} people</span>
        </span>
      ) : (
        <AssigneeStack assignees={issue.assignees} className="max-[899px]:hidden" />
      )}
      <span className="flex justify-end">
        <StoryPoints points={issue.story_points} unestimated="mark" />
      </span>
    </div>
  );
}

function RowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={cn('border-b border-border-subtle', GRID)}>
          <span />
          <Skeleton className="size-badge-letter rounded-xs" />
          <Skeleton className="size-badge-letter rounded-xs" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3" style={{ maxWidth: `${40 + ((i * 17) % 40)}%` }} />
          <Skeleton className="h-3 w-20 max-[899px]:hidden" />
          <Skeleton className="size-avatar-sm rounded-full max-[899px]:hidden" />
          <Skeleton className="h-[18px] w-[18px] rounded-xs" />
        </div>
      ))}
    </div>
  );
}

function BacklogSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="flex min-h-10 items-center gap-3 border-y bg-app px-2 py-0.5">
        <span className="pl-5.5 font-semibold">Backlog</span>
        <Skeleton className="h-3 w-6" />
        <Skeleton className="h-3 w-72 max-sm:hidden" />
      </div>
      <div className="border-b border-border-subtle py-2">
        <Skeleton className="h-control-lg w-full rounded-md" />
      </div>
      <RowsSkeleton />
    </div>
  );
}

function SectionSkeleton({ slots }: { slots: HeaderSlots }) {
  return (
    <div className="flex flex-col">
      <div className="flex min-h-10 items-center gap-3 border-y bg-app px-2 py-0.5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Skeleton className="ml-5.5 h-3.5 w-24" />
          <Skeleton className="h-3 w-28 max-sm:hidden" />
        </div>
        <div className="flex flex-none items-center justify-end gap-3 max-sm:hidden">
          <span className={cn('flex justify-end', STATS_SLOT)}>
            <Skeleton className="h-3 w-40" />
          </span>
          <Skeleton className={cn('h-1 rounded-full', METER_SLOT)} />
        </div>
        {slots.actions ? (
          <div
            className={cn(
              'flex flex-none items-center justify-end gap-1',
              ACTIONS_SLOT,
              'max-sm:w-auto max-sm:max-w-[55%]',
            )}
          >
            <Skeleton className="h-8 w-24 rounded-md" />
            <span className="size-8" />
          </div>
        ) : null}
      </div>
      <RowsSkeleton />
    </div>
  );
}
