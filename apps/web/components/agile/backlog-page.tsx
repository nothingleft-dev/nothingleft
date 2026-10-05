'use client';

import { useMemo, useState, type ReactNode } from 'react';
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
import { toast } from 'sonner';
import { ChevronRight, GripVertical, Kanban, MoreHorizontal, Plus } from 'lucide-react';
import { RESOLVED_STATUS_CATEGORIES, type Issue, type Sprint } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { EmptyState } from '@components/empty-state';
import { FormAlert } from '@components/auth/form-alert';
import { IssueKey } from '@components/issue-key';
import { PageHeader } from '@components/page-header';
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
} from '@components/agile/sprint-dialogs';
import { useBacklog, useBacklogMove, type BacklogDrop } from '@hooks/use-backlog';
import { useBoards } from '@hooks/use-boards';
import { useProject } from '@hooks/use-projects';
import { useProjectRoles } from '@hooks/use-project-roles';
import { useRecordProjectVisit } from '@hooks/use-project-visit';
import { useSession } from '@hooks/use-session';
import { useSprints } from '@hooks/use-sprints';
import { isApiError } from '@lib/api/errors';
import { issuePath } from '@lib/issue-path';
import { cn } from '@lib/utils';

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
  const carryFrom = active ?? [...planned].reverse().find(s => s.progress.issues > s.progress.resolved_issues) ?? null;
  const boardSlug = boards.data?.[0]?.slug;

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Sprint | null>(null);
  const [starting, setStarting] = useState<Sprint | null>(null);
  const [finishing, setFinishing] = useState<Sprint | null>(null);
  const [deleting, setDeleting] = useState<Sprint | null>(null);

  const [dragging, setDragging] = useState<Issue | null>(null);
  const [hint, setHint] = useState<Hint>(null);
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
  const onDragEnd = (event: DragEndEvent) => {
    const drop = dropOf(event);
    setDragging(null);
    setHint(null);
    if (!drop) return;
    const key = String(event.active.id);
    const from = (event.active.data.current as DragData).container;
    if (drop.container === from && drop.key === null) return;
    const body: BacklogDrop = { issues: [key], sprint: drop.container === BACKLOG ? null : drop.container };
    if (drop.key) body[drop.side] = drop.key;
    move.mutate(body, { onError: error => toast.error(error.message) });
  };

  if (project.isError) return <FormAlert title="This project could not be loaded." />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Backlog"
        meta={project.data?.name}
        actions={
          <>
            {boardSlug ? (
              <Button variant="outline" asChild>
                <Link href={`/projects/${projectKey}/board/${boardSlug}/current` as Route}>
                  <Kanban />
                  Board
                </Link>
              </Button>
            ) : null}
            {canManage ? (
              <Button onClick={() => setCreating(true)}>
                <Plus />
                New sprint
              </Button>
            ) : null}
          </>
        }
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setDragging(null);
          setHint(null);
        }}
      >
        <div className="flex flex-col gap-6">
          {sprints.isPending ? (
            <SectionSkeleton />
          ) : open.length === 0 ? (
            <EmptyState
              title={`${project.data?.name ?? projectKey} has no sprint planned.`}
              description={
                canManage
                  ? 'Plan one, then drag issues into it from the backlog below.'
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
                hint={hint}
                boardSlug={boardSlug}
                startBlockedBy={active?.name ?? null}
                onStart={() => setStarting(sprint)}
                onFinish={() => setFinishing(sprint)}
                onEdit={() => setEditing(sprint)}
                onDelete={() => setDeleting(sprint)}
              />
            ))
          )}

          <BacklogSection projectKey={projectKey} q={q} onCommit={commit} canPlan={canPlan} hint={hint} />
        </div>

        <DragOverlay dropAnimation={null}>
          {dragging ? <IssueLine issue={dragging} draggable overlay /> : null}
        </DragOverlay>
      </DndContext>

      <SprintFormDialog
        projectKey={projectKey}
        open={creating || editing !== null}
        onOpenChange={o => {
          if (!o) {
            setCreating(false);
            setEditing(null);
          }
        }}
        sprint={editing}
        carryFrom={carryFrom}
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

interface SprintSectionProps {
  projectKey: string;
  sprint: Sprint;
  canPlan: boolean;
  canManage: boolean;
  hint: Hint;
  boardSlug: string | undefined;
  /** The running sprint, which has to finish before another starts. */
  startBlockedBy: string | null;
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
  hint,
  boardSlug,
  startBlockedBy,
  onStart,
  onFinish,
  onEdit,
  onDelete,
}: SprintSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const list = useBacklog(projectKey, sprint.slug, '', expanded);
  const issues = useMemo(() => list.data?.pages.flatMap(p => p.data) ?? [], [list.data]);
  const { progress } = sprint;
  const ratio = progress.points > 0 ? progress.resolved_points / progress.points : 0;
  const isActive = sprint.state === 'active';

  return (
    <section aria-label={sprint.name} className="flex flex-col">
      <header className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 border-y bg-app px-2 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          className="flex min-w-0 items-center gap-2 rounded-sm text-left hover:text-text"
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
          <span className="c-amber rounded-xs bg-c-bg px-1.5 text-2xs leading-[18px] font-medium text-c-fg">
            Active
          </span>
        ) : null}
        <SprintDates sprint={sprint} className="text-xs" />
        <DaysLeft days={sprint.days_left} />

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-text-secondary tabular">
            {progress.resolved_issues} of {progress.issues} resolved
            {progress.points > 0 ? ` · ${progress.resolved_points} of ${progress.points} points` : ''}
          </span>
          {progress.points > 0 ? (
            <Meter
              ratio={ratio}
              label={`${Math.round(ratio * 100)}% of the points resolved`}
              className="w-20 max-sm:hidden"
            />
          ) : null}
          {isActive && boardSlug ? (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/projects/${projectKey}/board/${boardSlug}/${sprint.slug}` as Route}>
                <Kanban />
                Board
              </Link>
            </Button>
          ) : null}
          {canManage ? (
            <>
              {isActive ? (
                <Button size="sm" variant="outline" onClick={onFinish}>
                  Finish sprint
                </Button>
              ) : (
                <StartButton blockedBy={startBlockedBy} onClick={onStart} />
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-sm" variant="ghost" aria-label={`${sprint.name} actions`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={onEdit}>
                    {isActive ? 'Rename or edit goal' : 'Edit sprint'}
                  </DropdownMenuItem>
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
      </header>

      {expanded ? (
        <>
          {sprint.goal_md ? (
            <p className="border-b border-border-subtle px-8 py-2 text-xs text-text-secondary">
              {plainGoal(sprint.goal_md)}
            </p>
          ) : null}
          <Container
            id={sprint.slug}
            issues={issues}
            loading={list.isPending}
            canPlan={canPlan}
            hint={hint}
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
}: {
  projectKey: string;
  q: string;
  onCommit: (q: string) => void;
  canPlan: boolean;
  hint: Hint;
}) {
  const list = useBacklog(projectKey, null, q);
  const issues = useMemo(() => list.data?.pages.flatMap(p => p.data) ?? [], [list.data]);
  const total = list.data?.pages[0]?.meta.pagination?.total;

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
      <header className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2 border-y bg-app px-2 py-1.5">
        <span className="pl-5.5 font-semibold">Backlog</span>
        {total !== undefined ? <span className="tabular text-text-muted">{total}</span> : null}
        <span className="text-xs text-text-secondary">Issues in no sprint, in the order they will be picked up.</span>
      </header>
      <div className="border-b border-border-subtle px-2 py-2">
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
        loading={list.isPending}
        canPlan={canPlan}
        hint={hint}
        empty={
          q.trim() === '' || q.trim() === BACKLOG_DEFAULT_QUERY
            ? 'The backlog is empty: every unresolved issue is planned into a sprint.'
            : 'No issue in the backlog matches this query.'
        }
        more={list.hasNextPage ? () => void list.fetchNextPage() : undefined}
        loadingMore={list.isFetchingNextPage}
      />
    </section>
  );
}

interface ContainerProps {
  id: string;
  issues: readonly Issue[];
  loading: boolean;
  canPlan: boolean;
  hint: Hint;
  empty: string;
  more: (() => void) | undefined;
  loadingMore: boolean;
}

function Container({ id, issues, loading, canPlan, hint, empty, more, loadingMore }: ContainerProps) {
  const { setNodeRef } = useDroppable({ id: `${DROP_PREFIX}${id}`, data: { container: id }, disabled: !canPlan });
  const targeted = hint?.container === id;

  if (loading) return <RowsSkeleton />;

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
        <p
          className={cn(
            'm-2 rounded-md border border-dashed px-3 py-4 text-xs text-text-muted',
            targeted && 'border-brand bg-selected text-text-secondary',
          )}
        >
          {empty}
        </p>
      ) : null}
      {more ? (
        <Button variant="ghost" size="sm" className="m-1 self-start" onClick={more} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
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
              className="grid h-full w-5 cursor-grab place-items-center text-text-muted opacity-0 group-hover/line:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
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
        'group/line grid h-row grid-cols-[20px_18px_18px_84px_minmax(0,1fr)_auto] items-center gap-x-2 border-b border-border-subtle bg-surface pr-3 hover:bg-hover min-[900px]:grid-cols-[20px_18px_18px_84px_minmax(0,1fr)_140px_120px_28px]',
        overlay && 'rounded-md border bg-raised shadow-lg hover:bg-raised',
      )}
    >
      <span className="h-full">{draggable ? handle : null}</span>
      <PriorityBadge priority={issue.priority} className={cn(resolved && 'opacity-55')} />
      <TypeBadge type={issue.type} className={cn(resolved && 'opacity-55')} />
      <IssueKey issueKey={issue.key} resolved={resolved} />
      <Link
        href={issuePath(issue) as Route}
        className={cn('truncate hover:underline', resolved && 'text-text-muted line-through')}
      >
        {issue.title}
      </Link>
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-text-secondary max-[899px]:hidden">
        <StatusDot category={issue.status.category} color={issue.status.color} />
        <span className="truncate">{issue.status.name}</span>
      </span>
      <AssigneeStack assignees={issue.assignees} className="max-[899px]:hidden" />
      <span className="flex justify-end">
        <StoryPoints points={issue.story_points} />
      </span>
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex h-row items-center gap-3 border-b border-border-subtle px-7">
          <Skeleton className="size-4" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3" style={{ width: `${30 + ((i * 17) % 40)}%` }} />
        </div>
      ))}
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="flex flex-col">
      <Skeleton className="h-10 w-full rounded-none" />
      <RowsSkeleton />
    </div>
  );
}
