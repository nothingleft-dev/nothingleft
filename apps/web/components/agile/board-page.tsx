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
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { toast } from 'sonner';
import { Check, ChevronDown, ChevronRight, ChevronsLeftRight, ListOrdered, Settings } from 'lucide-react';
import type {
  Board,
  BoardCard as Card,
  BoardLane,
  BoardValueCount,
  BoardView,
  BoardViewColumn,
  Sprint,
} from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Command, CommandGroup, CommandItem, CommandList } from '@components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { EmptyState } from '@components/empty-state';
import { FormAlert } from '@components/auth/form-alert';
import { IssueKey } from '@components/issue-key';
import { PageTitle } from '@components/page-title';
import { StatusDistribution } from '@components/dashboard/status-strip';
import { MemberAvatar } from '@components/issues/member-avatar';
import { IssueModal } from '@components/issues/issue-modal';
import { QueryBar, type QueryProblem } from '@components/issues/list/query-bar';
import { StartButton } from '@components/agile/backlog-page';
import { BoardCard, NewCard, SubtaskProgress, ValueName } from '@components/agile/board-card';
import { DaysLeft, SprintDates, sprintDatesLabel } from '@components/agile/sprint-dates';
import { StoryPoints } from '@components/agile/story-points';
import { FinishSprintDialog, StartSprintDialog } from '@components/agile/sprint-dialogs';
import { useBoardView, useBoards, useMoveCard } from '@hooks/use-boards';
import { useProjectRoles } from '@hooks/use-project-roles';
import { useRecordProjectVisit } from '@hooks/use-project-visit';
import { useSession } from '@hooks/use-session';
import { useSprints } from '@hooks/use-sprints';
import { isApiError } from '@lib/api/errors';
import { todayCalendarDate } from '@lib/datetime';
import { cn } from '@lib/utils';
import { deactivatedInk } from '@components/former-member-chip';

export const CURRENT_SPRINT = 'current';

/**
 * With nothing running, `current` shows the planned sprint whose dates hold today, else the
 * first planned one, rather than an empty board; starting it stays an explicit step.
 */
function plannedStandIn(sprints: readonly Sprint[] | undefined, today: string): Sprint | null {
  if (!sprints || sprints.some(s => s.state === 'active')) return null;
  const planned = sprints.filter(s => s.state === 'planned');
  return (
    planned.find(s => s.start_date !== null && s.end_date !== null && s.start_date <= today && today <= s.end_date) ??
    planned[0] ??
    null
  );
}

interface BoardPageProps {
  projectKey: string;
  boardSlug: string;
  /** `current`, or a sprint's slug. */
  sprint: string;
  /** The route prefix the board lives under: the canonical `/projects/PROJ/board` or the short `/board`. */
  base: string;
}

interface CardData {
  card: Card;
  lane: string | null;
  column: string;
}

/**
 * The strip counts what the columns count: statuses on a status board (the API's own
 * distribution), priorities or types otherwise, from the filtered cards and the unmapped counts.
 */
function boardDistribution(view: BoardView): BoardValueCount[] {
  const field = view.board.column_field;
  if (field === 'status') return view.distribution;
  const counts = new Map<string, number>();
  for (const lane of view.lanes)
    for (const cell of lane.cells)
      for (const card of cell.cards) counts.set(card[field].name, (counts.get(card[field].name) ?? 0) + 1);
  for (const u of view.unmapped) counts.set(u.name, (counts.get(u.name) ?? 0) + u.count);
  const values = [...view.columns.flatMap(c => c.values), ...view.unmapped];
  return values.map(v => ({ name: v.name, color: v.color, category: null, count: counts.get(v.name) ?? 0 }));
}

const cellId = (lane: string | null, column: string) => `${lane ?? ''}::${column}`;

// A keyboard drag has no pointer, so it falls back to the cell the card overlaps most.
const cellUnderCard: CollisionDetection = args => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : rectIntersection(args);
};

export function BoardPage({ projectKey, boardSlug, sprint, base }: BoardPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get('q') ?? '';
  const session = useSession();
  const timeZone = session.status === 'signed-in' ? session.user.timezone : undefined;
  const today = todayCalendarDate(timeZone);
  useRecordProjectVisit(projectKey);

  const roles = useProjectRoles();
  const canPlan = roles.canEdit(projectKey);
  const canManage = roles.canAdmin(projectKey);
  const sprints = useSprints(projectKey);
  const standIn = sprint === CURRENT_SPRINT ? plannedStandIn(sprints.data, today) : null;
  const view = useBoardView(projectKey, boardSlug, standIn?.slug ?? sprint, q);
  const boards = useBoards(projectKey);
  const [starting, setStarting] = useState<Sprint | null>(null);
  const [finishing, setFinishing] = useState<Sprint | null>(null);

  const problem = useMemo<QueryProblem | null>(() => {
    const error = view.error;
    if (!error || !isApiError(error) || error.status !== 400) return null;
    return {
      message: error.message,
      span: error.field === 'q' && error.span ? error.span : null,
      validValues: error.validValues ?? [],
    };
  }, [view.error]);

  const openKey = params.get('issue');
  const openIssue = (key: string | null) => {
    const next = new URLSearchParams(params);
    if (key) next.set('issue', key);
    else next.delete('issue');
    const search = next.toString();
    router.push((search ? `${pathname}?${search}` : pathname) as Route, { scroll: false });
  };

  const commit = (next: string) =>
    router.replace((next ? `${pathname}?q=${encodeURIComponent(next)}` : pathname) as Route, { scroll: false });
  const goToSprint = (slug: string) =>
    router.push(`${base}/${boardSlug}/${slug}${q ? `?q=${encodeURIComponent(q)}` : ''}` as Route);

  if (view.isError && !problem) {
    const missing = isApiError(view.error) && view.error.status === 404;
    return (
      <FormAlert
        title={missing ? view.error.message : 'This board could not be loaded. Check the connection, then try again.'}
      />
    );
  }

  const data = view.data;
  const current = data?.sprint ?? null;
  const planned = (sprints.data ?? []).filter(s => s.state === 'planned');

  return (
    <div className="flex h-[calc(100dvh-var(--topbar)-40px)] min-h-[480px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <PageTitle>Board</PageTitle>
        <BoardSwitcher
          boards={boards.data ?? []}
          current={data?.board ?? null}
          onPick={slug => router.push(`${base}/${slug}/${CURRENT_SPRINT}` as Route)}
        />
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/projects/${projectKey}/backlog` as Route}>
              <ListOrdered />
              Backlog
            </Link>
          </Button>
          {canManage ? (
            <Button variant="outline" asChild>
              <Link href={`/projects/${projectKey}/settings?tab=boards&board=${boardSlug}` as Route}>
                <Settings />
                Board settings
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y py-2">
        <SprintPicker
          sprints={sprints.data ?? []}
          current={current}
          loading={sprints.isPending}
          onPick={s => goToSprint(s.state === 'active' ? CURRENT_SPRINT : s.slug)}
        />
        {current ? (
          <>
            <SprintDates sprint={current} className="text-xs" />
            <DaysLeft days={current.days_left} />
            {current.state === 'planned' ? (
              <span className="c-gray rounded-xs bg-c-bg px-1.5 text-2xs leading-[18px] font-medium text-c-fg">
                Not started
              </span>
            ) : null}
            {canManage && current.state === 'planned' ? (
              <StartButton
                blockedBy={(sprints.data ?? []).find(s => s.state === 'active')?.name ?? null}
                onClick={() => setStarting(current)}
              />
            ) : null}
            {canManage && current.state === 'active' ? (
              <Button size="sm" variant="outline" onClick={() => setFinishing(current)}>
                Finish sprint
              </Button>
            ) : null}
            {current.state === 'completed' ? <span className="text-xs text-text-secondary">Finished</span> : null}
            {data ? (
              <StatusDistribution
                statuses={boardDistribution(data)}
                field={data.board.column_field}
                noun="cards"
                className="min-w-[220px] flex-1 [&>div:first-child]:max-w-[320px]"
              />
            ) : null}
            {current.progress.points > 0 ? (
              <span className="text-xs text-text-secondary tabular">
                {current.progress.resolved_points} of {current.progress.points} points
              </span>
            ) : null}
          </>
        ) : null}
      </div>

      <div className={cn('max-w-2xl', data && !current && 'hidden')}>
        <QueryBar value={q} onCommit={commit} problem={problem} placeholder="Filter cards · assignee: me type: Bug" />
      </div>

      {data && data.unmapped.length > 0 ? (
        <UnmappedNotice view={data} canManage={canManage} projectKey={projectKey} />
      ) : null}
      {data?.truncated ? (
        <p className="text-xs text-text-secondary">
          Only the first 500 cards are shown. Narrow the filter to see the rest.
        </p>
      ) : null}

      {view.isPending || !data ? (
        <BoardSkeleton />
      ) : current === null ? (
        <EmptyState
          title={`${data.board.project.name} has no active sprint.`}
          description={
            planned.length > 0
              ? `${planned.length} ${planned.length === 1 ? 'sprint is' : 'sprints are'} planned. Pick one above to see its board.`
              : 'The board shows the active sprint; nothing is running right now.'
          }
          action={
            <Link
              href={`/projects/${projectKey}/backlog` as Route}
              className="text-xs text-text-secondary underline hover:text-text"
            >
              {planned.length > 0 ? 'Start one from the backlog' : 'Plan one from the backlog'}
            </Link>
          }
        />
      ) : (
        <BoardGrid
          projectKey={projectKey}
          view={data}
          sprint={current}
          canPlan={canPlan}
          today={today}
          filtered={q.trim() !== ''}
          onOpen={openIssue}
        />
      )}

      <IssueModal issueKey={openKey} onClose={() => openIssue(null)} />

      <StartSprintDialog
        projectKey={projectKey}
        sprint={starting}
        timeZone={timeZone}
        onOpenChange={o => {
          if (!o) setStarting(null);
        }}
      />
      <FinishSprintDialog
        projectKey={projectKey}
        sprint={finishing}
        planned={planned}
        onOpenChange={o => {
          if (!o) setFinishing(null);
        }}
      />
    </div>
  );
}

function BoardSwitcher({
  boards,
  current,
  onPick,
}: {
  boards: readonly Board[];
  current: Board | null;
  onPick: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!current) return <Skeleton className="h-5 w-32" />;
  if (boards.length < 2) return <span className="text-text-muted">{current.name}</span>;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="text-text-secondary">
          {current.name}
          <ChevronDown className="text-text-muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandList>
            {boards.map(b => (
              <CommandItem
                key={b.slug}
                value={b.slug}
                onSelect={() => {
                  setOpen(false);
                  onPick(b.slug);
                }}
              >
                <span className="flex-1 truncate">{b.name}</span>
                <Check className={cn('size-icon-sm', b.slug === current.slug ? 'opacity-100' : 'opacity-0')} />
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const STATE_GROUPS = [
  ['active', 'Active'],
  ['planned', 'Planned'],
  ['completed', 'Finished'],
] as const;

function SprintPicker({
  sprints,
  current,
  loading,
  onPick,
}: {
  sprints: readonly Sprint[];
  current: Sprint | null;
  loading: boolean;
  onPick: (sprint: Sprint) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Sprint">
          <span className={cn(!current && 'text-text-secondary')}>{current?.name ?? 'No active sprint'}</span>
          <ChevronDown className="text-text-muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandList>
            {loading ? <p className="px-3 py-2 text-xs text-text-muted">Loading sprints…</p> : null}
            {!loading && sprints.length === 0 ? (
              <p className="px-3 py-2 text-xs text-text-secondary">No sprints yet. Plan one from the backlog.</p>
            ) : null}
            {STATE_GROUPS.map(([state, heading]) => {
              const group = sprints.filter(s => s.state === state);
              if (group.length === 0) return null;
              return (
                <CommandGroup key={state} heading={heading}>
                  {group.map(s => (
                    <CommandItem
                      key={s.slug}
                      value={s.slug}
                      onSelect={() => {
                        setOpen(false);
                        onPick(s);
                      }}
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{s.name}</span>
                        <span className="text-2xs text-text-secondary">{sprintDatesLabel(s)}</span>
                      </span>
                      <Check className={cn('size-icon-sm', s.slug === current?.slug ? 'opacity-100' : 'opacity-0')} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function UnmappedNotice({ view, canManage, projectKey }: { view: BoardView; canManage: boolean; projectKey: string }) {
  const n = view.unmapped.reduce((sum, s) => sum + s.count, 0);
  return (
    <p className="flex flex-wrap items-center gap-x-2 rounded-md bg-warning-bg px-3 py-1.5 text-xs text-warning-fg">
      <span>
        {n} {n === 1 ? 'card is' : 'cards are'} not shown: {view.unmapped.map(s => `${s.name} (${s.count})`).join(', ')}{' '}
        {view.unmapped.length === 1 ? 'is' : 'are'} on no column.
      </span>
      {canManage ? (
        <Link
          href={`/projects/${projectKey}/settings?tab=boards&board=${view.board.slug}` as Route}
          className="font-medium underline"
        >
          Add a column
        </Link>
      ) : null}
    </p>
  );
}

interface BoardGridProps {
  projectKey: string;
  view: BoardView;
  sprint: Sprint;
  canPlan: boolean;
  today: string;
  filtered: boolean;
  onOpen: (key: string) => void;
}

function BoardGrid({ projectKey, view, sprint, canPlan, today, filtered, onOpen }: BoardGridProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(view.columns.filter(c => c.collapsed_by_default).map(c => c.name)),
  );
  const [closedLanes, setClosedLanes] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState<CardData | null>(null);
  const move = useMoveCard(projectKey);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // Enter opens the card, so only Space picks it up.
    useSensor(KeyboardSensor, { keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] } }),
  );

  const toggle = (set: Set<string>, value: string) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const template = view.columns.map(c => (collapsed.has(c.name) ? '40px' : 'minmax(248px, 1fr)')).join(' ');
  const minWidth = view.columns.reduce((sum, c) => sum + (collapsed.has(c.name) ? 40 : 248), 0);
  const canCreate = canPlan && sprint.state !== 'completed';

  const onDragStart = (event: DragStartEvent) => setDragging(event.active.data.current as CardData);
  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const from = event.active.data.current as CardData;
    const to = event.over?.data.current as { lane: string | null; column: string } | undefined;
    if (!to || to.lane !== from.lane || to.column === from.column) return;
    const column = view.columns.find(c => c.name === to.column);
    const value = column?.values[0];
    if (!value) return;
    move.mutate(
      { card: from.card, from: from.column, to: to.column, lane: from.lane, field: view.board.column_field, value },
      { onError: error => toast.error(error.message) },
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={cellUnderCard}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-app">
        <div className="grid w-full" style={{ gridTemplateColumns: template, minWidth }}>
          {view.columns.map(column => (
            <ColumnHeader
              key={column.name}
              column={column}
              collapsed={collapsed.has(column.name)}
              filtered={filtered}
              onToggle={() => setCollapsed(s => toggle(s, column.name))}
            />
          ))}

          {view.lanes.map(lane => {
            const laneId = lane.key ?? lane.kind;
            const closed = closedLanes.has(laneId);
            return (
              <Lane
                key={laneId}
                lane={lane}
                closed={closed}
                span={view.columns.length}
                onToggle={() => setClosedLanes(s => toggle(s, laneId))}
              >
                {closed
                  ? null
                  : view.columns.map(column => {
                      const cards = lane.cells.find(c => c.column === column.name)?.cards ?? [];
                      return (
                        <Cell
                          key={column.name}
                          lane={lane.key}
                          column={column}
                          collapsed={collapsed.has(column.name)}
                          count={cards.length}
                          disabled={!canPlan || (dragging !== null && dragging.lane !== lane.key)}
                          dragging={dragging}
                        >
                          {cards.map(card => (
                            <DraggableCard
                              key={card.key}
                              card={card}
                              lane={lane.key}
                              column={column.name}
                              projectKey={projectKey}
                              today={today}
                              disabled={!canPlan}
                              onOpen={() => onOpen(card.key)}
                            />
                          ))}
                          {canCreate && column.values[0] ? (
                            <NewCard
                              projectKey={projectKey}
                              sprint={sprint.slug}
                              field={view.board.column_field}
                              value={column.values[0].name}
                              lane={lane}
                              swimlaneField={view.board.swimlane_field}
                            />
                          ) : null}
                        </Cell>
                      );
                    })}
              </Lane>
            );
          })}
        </div>
        {view.lanes.every(l => l.count === 0) && filtered ? (
          <p className="px-4 py-6 text-xs text-text-secondary">No card on this board matches the filter.</p>
        ) : null}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging ? <BoardCard card={dragging.card} projectKey={projectKey} today={today} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function ColumnHeader({
  column,
  collapsed,
  filtered,
  onToggle,
}: {
  column: BoardViewColumn;
  collapsed: boolean;
  filtered: boolean;
  onToggle: () => void;
}) {
  const wip = column.over_wip_max
    ? `Over the limit of ${column.wip_max}`
    : column.under_wip_min
      ? `Under the minimum of ${column.wip_min}`
      : null;
  const limits = [
    column.wip_min !== null ? `min ${column.wip_min}` : null,
    column.wip_max !== null ? `max ${column.wip_max}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Expand ${column.name}`}
        className="sticky top-0 z-10 flex h-10 items-center justify-center gap-1 border-r border-b bg-surface text-text-secondary hover:bg-hover"
      >
        <ChevronsLeftRight className="size-3.5 text-text-muted" />
        <span className={cn('text-xs tabular', column.over_wip_max && 'font-medium text-danger-fg')}>
          {column.count}
        </span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        'sticky top-0 z-10 flex h-10 items-center gap-2 border-r border-b bg-surface px-2 last:border-r-0',
        column.over_wip_max && 'shadow-[inset_0_-2px_0_var(--danger-fg)]',
        column.under_wip_min && 'shadow-[inset_0_-2px_0_var(--warning-fg)]',
      )}
    >
      <Button variant="ghost" size="icon-xs" aria-label={`Collapse ${column.name}`} onClick={onToggle}>
        <ChevronRight className="rotate-180 text-text-muted" />
      </Button>
      <span className="truncate font-medium">{column.name}</span>
      {column.resolved ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="c-green rounded-xs bg-c-bg px-1 text-2xs leading-4 font-medium text-c-fg">resolved</span>
          </TooltipTrigger>
          <TooltipContent>Cards here count as resolved</TooltipContent>
        </Tooltip>
      ) : null}
      <span className="ml-auto flex items-center gap-2 text-xs tabular">
        {limits ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  'text-text-muted',
                  column.over_wip_max && 'font-medium text-danger-fg',
                  column.under_wip_min && 'font-medium text-warning-fg',
                )}
              >
                {limits}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {wip ?? 'Work-in-progress limits'}: {column.total} {column.total === 1 ? 'card' : 'cards'} in the column
            </TooltipContent>
          </Tooltip>
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                'rounded-xs bg-inset px-1.5 font-medium text-text-secondary',
                column.over_wip_max && 'c-red bg-c-bg text-c-fg',
                column.under_wip_min && 'c-amber bg-c-bg text-c-fg',
              )}
            >
              {filtered && column.count !== column.total ? `${column.count} of ${column.total}` : column.count}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {filtered
              ? `${column.count} matching the filter, ${column.total} in the column`
              : `${column.total} ${column.total === 1 ? 'card' : 'cards'}`}
          </TooltipContent>
        </Tooltip>
      </span>
    </div>
  );
}

function Lane({
  lane,
  closed,
  span,
  onToggle,
  children,
}: {
  lane: BoardLane;
  closed: boolean;
  span: number;
  onToggle: () => void;
  children: ReactNode;
}) {
  if (lane.kind === 'all') return <>{children}</>;
  return (
    <>
      <div
        className="sticky left-0 z-[5] flex h-9 items-center gap-2 border-b bg-app px-2"
        style={{ gridColumn: `1 / span ${span}` }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!closed}
          aria-label={`${closed ? 'Expand' : 'Collapse'} ${lane.label}`}
          className="grid size-5 place-items-center rounded-xs text-text-muted hover:bg-hover hover:text-text"
        >
          <ChevronRight className={cn('size-3.5 transition-transform duration-(--dur-fast)', !closed && 'rotate-90')} />
        </button>
        <LaneTitle lane={lane} />
        <span className="text-xs tabular text-text-muted">
          {lane.count} {lane.count === 1 ? 'card' : 'cards'}
        </span>
      </div>
      {children}
    </>
  );
}

function LaneTitle({ lane }: { lane: BoardLane }) {
  if (lane.kind === 'issue' && lane.issue) {
    const issue = lane.issue;
    return (
      <span className="flex min-w-0 items-center gap-2">
        <IssueKey issueKey={issue.key} resolved={issue.resolved} />
        <Link
          href={`/issue/${issue.key}` as Route}
          className={cn('truncate text-sm font-medium hover:underline', issue.resolved && 'line-through')}
        >
          {issue.title}
        </Link>
        <span className="flex items-center gap-2.5 text-xs">
          <ValueName value={issue.priority} label="Priority" dim={issue.resolved} />
          <ValueName value={issue.type} label="Type" dim={issue.resolved} />
          <span className="text-text-secondary">{issue.status.name}</span>
        </span>
        <SubtaskProgress resolved={issue.subtasks.resolved} total={issue.subtasks.total} />
        <StoryPoints points={issue.story_points} />
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
      {lane.member ? <MemberAvatar member={lane.member} className="size-5" /> : null}
      <span
        className={cn('truncate', lane.kind === 'uncategorized' && 'text-text-secondary', deactivatedInk(lane.member))}
      >
        {lane.label}
      </span>
    </span>
  );
}

function Cell({
  lane,
  column,
  collapsed,
  count,
  disabled,
  dragging,
  children,
}: {
  lane: string | null;
  column: BoardViewColumn;
  collapsed: boolean;
  count: number;
  disabled: boolean;
  dragging: CardData | null;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: cellId(lane, column.name),
    data: { lane, column: column.name },
    disabled,
  });
  const target = isOver && dragging !== null && dragging.column !== column.name;

  if (collapsed) {
    return (
      <div className="flex justify-center border-r border-b bg-surface py-3 text-xs font-medium text-text-secondary">
        <span className="[writing-mode:vertical-rl]">
          {column.name} · {count}
        </span>
      </div>
    );
  }
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group/cell flex min-h-16 flex-col gap-2 border-r border-b p-2 transition-colors last:border-r-0',
        target && 'bg-selected',
        dragging && !disabled && !target && dragging.column !== column.name && 'bg-surface/60',
      )}
    >
      {children}
    </div>
  );
}

function DraggableCard({
  card,
  lane,
  column,
  projectKey,
  today,
  disabled,
  onOpen,
}: {
  card: Card;
  lane: string | null;
  column: string;
  projectKey: string;
  today: string;
  disabled: boolean;
  onOpen: () => void;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: card.key,
    data: { card, lane, column } satisfies CardData,
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      tabIndex={0}
      aria-label={`${card.key} ${card.title}. Enter opens it.`}
      aria-roledescription={disabled ? 'Card' : 'Draggable card'}
      onDoubleClick={onOpen}
      onKeyDown={e => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onOpen();
        else listeners?.onKeyDown?.(e);
      }}
      className={cn('rounded-md', !disabled && 'cursor-grab active:cursor-grabbing')}
    >
      <BoardCard card={card} projectKey={projectKey} today={today} canEdit={!disabled} dragging={isDragging} />
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-3 gap-px overflow-hidden rounded-md border bg-app">
      {Array.from({ length: 3 }, (_, c) => (
        <div key={c} className="flex flex-col gap-2 p-2">
          <Skeleton className="h-6 w-28" />
          {Array.from({ length: 3 - (c % 2) }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-md" />
          ))}
        </div>
      ))}
    </div>
  );
}
