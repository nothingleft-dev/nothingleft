'use client';

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject, type UIEvent } from 'react';
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
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  ChevronDown,
  ChevronRight,
  FoldHorizontal,
  Info,
  ListOrdered,
  Settings,
  SquareKanban,
  UnfoldHorizontal,
} from 'lucide-react';
import {
  BOARD_CARDS_MAX,
  BOARD_CURRENT_SPRINT,
  BOARD_OPEN_ISSUES,
  type Board,
  type BoardCard as Card,
  type BoardColumn,
  type BoardLane,
  type BoardValueCount,
  type BoardView,
  type BoardViewColumn,
  type Sprint,
} from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { CommandEmpty, CommandGroup, CommandInput, CommandList } from '@components/ui/command';
import { PickerCommand, PickerItem } from '@components/picker';
import { Popover, PopoverContent, PopoverTrigger } from '@components/popover';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { EmptyState } from '@components/empty-state';
import { LoadError, errorDetail, notFoundOn404 } from '@components/query-state';
import { IssueKey } from '@components/issue-key';
import { PageTitle } from '@components/page-title';
import { StatusDistribution } from '@components/dashboard/status-strip';
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
import { PersonName } from '@components/former-member-chip';
import { toastError } from '@components/toast-error';
import { formatCount, plural } from '@lib/numbers';

// A column never narrows past a readable card, and stops widening where cards would sprawl;
// past the minimum the board scrolls sideways instead of squeezing.
const COLUMN_MIN = 280;
const COLUMN_MAX = 380;
const COLLAPSED_COLUMN = 40;

/**
 * What `current` reads: the active sprint; with nothing running, the planned sprint whose dates
 * hold today, else the first planned one; with nothing planned either, every open issue. Starting
 * a planned sprint stays an explicit step. null until the sprints have loaded.
 */
function currentTarget(sprints: readonly Sprint[] | undefined, today: string): string | null {
  if (!sprints) return null;
  if (sprints.some(s => s.state === 'active')) return BOARD_CURRENT_SPRINT;
  const planned = sprints.filter(s => s.state === 'planned');
  const standIn =
    planned.find(s => s.start_date !== null && s.end_date !== null && s.start_date <= today && today <= s.end_date) ??
    planned[0];
  return standIn?.slug ?? BOARD_OPEN_ISSUES;
}

interface BoardPageProps {
  projectKey: string;
  boardSlug: string;
  /** `current`, `open`, or a sprint's slug. */
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

const LEGEND_MAX = 5;
const LEGEND_MAX_PHONE = 3;

const LEGEND_TEXTURE: Record<string, string> = {
  backlog: 'bg-c-solid opacity-40',
  cancelled: '[background:repeating-linear-gradient(135deg,var(--c-solid)_0_2px,var(--c-bg)_2px_4px)]',
};

function MoreValues({ values, className }: { values: readonly BoardValueCount[]; className: string }) {
  if (values.length === 0) return null;
  return (
    <li className={cn('flex-none', className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="rounded-xs text-text-secondary underline-offset-2 hover:underline">
            +{values.length} more
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{values.map(v => `${v.name} ${v.count}`).join(' · ')}</TooltipContent>
      </Tooltip>
    </li>
  );
}

/** The strip as wide as its one-line legend: the largest values, the rest behind `+N more`. */
function BoardStrip({ view }: { view: BoardView }) {
  const values = boardDistribution(view);
  const shown = values.filter(v => v.count > 0);
  const rank = new Map([...shown].sort((a, b) => b.count - a.count).map((v, i) => [v.name, i]));
  const beyond = (max: number) => shown.filter(v => rank.get(v.name)! >= max);
  return (
    <div className="flex max-w-full min-w-[220px] flex-col gap-2">
      <StatusDistribution statuses={values} field={view.board.column_field} noun="cards" legend={false} />
      {shown.length > 0 ? (
        <ul className="flex min-w-0 items-center gap-x-2.5 text-2xs whitespace-nowrap text-text-secondary">
          {shown
            .filter(v => rank.get(v.name)! < LEGEND_MAX)
            .map(v => (
              <li
                key={v.name}
                className={cn(
                  'inline-flex min-w-0 items-center gap-1.5',
                  rank.get(v.name)! >= LEGEND_MAX_PHONE && 'max-sm:hidden',
                )}
              >
                <i
                  className={cn(
                    'inline-block size-1.5 flex-none rounded-full',
                    `l-${v.color}`,
                    LEGEND_TEXTURE[v.category ?? ''] ?? 'bg-c-solid',
                  )}
                />
                <span className="max-w-48 truncate">{v.name}</span>
                <b className="font-medium tabular text-text">{v.count}</b>
              </li>
            ))}
          <MoreValues values={beyond(LEGEND_MAX_PHONE)} className="sm:hidden" />
          <MoreValues values={beyond(LEGEND_MAX)} className="max-sm:hidden" />
        </ul>
      ) : null}
    </div>
  );
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
  const target = sprint === BOARD_CURRENT_SPRINT ? currentTarget(sprints.data, today) : sprint;
  const view = useBoardView(projectKey, boardSlug, target, q);
  // A refused filter keeps the cards that were on screen; opened with one, it shows the unfiltered board.
  const viewKey = `${boardSlug}/${target ?? ''}`;
  const [lastGood, setLastGood] = useState<{ key: string; view: BoardView } | null>(null);
  if (view.data && !view.isPlaceholderData && lastGood?.view !== view.data)
    setLastGood({ key: viewKey, view: view.data });
  const refused = view.isError && isApiError(view.error) && view.error.status === 400;
  const unfiltered = useBoardView(projectKey, boardSlug, refused && lastGood?.key !== viewKey ? target : null, '');
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

  const failed = view.isError && !problem && !view.data;
  if (failed) notFoundOn404(view.error);

  const data = view.data ?? (problem ? (lastGood?.key === viewKey ? lastGood.view : unfiltered.data) : undefined);
  const current = data?.sprint ?? null;
  const openIssues = data?.scope === 'open';
  const planned = (sprints.data ?? []).filter(s => s.state === 'planned');
  const listed = boards.data?.find(b => b.slug === boardSlug) ?? null;
  const nothingMatches = data !== undefined && q.trim() !== '' && data.lanes.every(l => l.count === 0);
  const strip = data && !nothingMatches ? <BoardStrip view={data} /> : null;

  return (
    <div className="flex h-[calc(100dvh-var(--topbar)-40px)] min-h-[480px] flex-col gap-3">
      <div className="flex items-center gap-x-4">
        <PageTitle>Board</PageTitle>
        <BoardSwitcher
          boards={boards.data ?? []}
          current={data?.board ?? listed}
          failed={failed}
          onPick={slug => router.push(`${base}/${slug}/${BOARD_CURRENT_SPRINT}` as Route)}
        />
        <div className="ml-auto flex flex-none items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/projects/${projectKey}/backlog` as Route}>
              <ListOrdered />
              <span className="max-sm:sr-only">Backlog</span>
            </Link>
          </Button>
          {canManage ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/projects/${projectKey}/settings?tab=boards&board=${boardSlug}` as Route}>
                <Settings />
                <span className="max-sm:sr-only">Board settings</span>
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 border-y py-2', failed && 'hidden')}>
        <SprintPicker
          sprints={sprints.data ?? []}
          current={current}
          openIssues={openIssues}
          loading={sprints.isPending}
          resolving={!data && view.isPending}
          onPick={s => goToSprint(s.state === 'active' ? BOARD_CURRENT_SPRINT : s.slug)}
          onPickOpen={() => goToSprint(BOARD_OPEN_ISSUES)}
        />
        {openIssues ? strip : null}
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
            {strip}
            {current.progress.points > 0 ? (
              <span className="text-xs text-text-secondary tabular max-sm:basis-full sm:ml-auto">
                {current.progress.resolved_points} of {current.progress.points} points
              </span>
            ) : null}
          </>
        ) : null}
      </div>

      <div className={cn('max-w-2xl', (failed || (data && !current && !openIssues)) && 'hidden')}>
        <QueryBar value={q} onCommit={commit} problem={problem} placeholder="Filter cards · assignee: me type: Bug" />
      </div>

      {data && data.unmapped.length > 0 ? (
        <UnmappedNotice view={data} canManage={canManage} projectKey={projectKey} />
      ) : null}
      {data?.truncated ? <TruncatedNotice view={data} /> : null}

      {failed ? (
        <div className="min-h-0 flex-1 rounded-md border bg-app p-3">
          <LoadError onRetry={() => void view.refetch()} detail={errorDetail(view.error)}>
            This board could not be loaded.
          </LoadError>
        </div>
      ) : view.isPending || !data ? (
        <BoardSkeleton columns={listed?.columns ?? null} />
      ) : current === null && !openIssues ? (
        <EmptyState
          className="max-w-xl"
          title={`${data.board.project.name} has no active sprint.`}
          description={
            planned.length > 0
              ? `${plural(planned.length, 'sprint is', 'sprints are')} planned. Open one to see its board.`
              : 'The board shows the active sprint; nothing is running right now.'
          }
          action={
            <div className="flex flex-wrap gap-2">
              {planned.slice(0, 3).map(s => (
                <Button key={s.slug} size="sm" variant="outline" onClick={() => goToSprint(s.slug)}>
                  Show {s.name}
                </Button>
              ))}
              <Button size="sm" variant={planned.length > 0 ? 'ghost' : 'outline'} asChild>
                <Link href={`/projects/${projectKey}/backlog` as Route}>
                  {planned.length > 0 ? 'Open the backlog' : 'Plan one from the backlog'}
                </Link>
              </Button>
            </div>
          }
        />
      ) : (
        <BoardGrid
          projectKey={projectKey}
          view={data}
          sprint={current}
          canPlan={canPlan}
          today={today}
          filter={q.trim()}
          nothingMatches={nothingMatches}
          onClearFilter={() => commit('')}
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
  failed,
  onPick,
}: {
  boards: readonly Board[];
  current: Board | null;
  failed: boolean;
  onPick: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!current) return failed ? null : <Skeleton className="h-5 w-32" />;
  const name = (
    <>
      <SquareKanban aria-hidden className="size-icon-sm flex-none text-text-muted" />
      <span className="truncate">{current.name}</span>
    </>
  );
  if (boards.length < 2) {
    return (
      <span className="flex max-w-[360px] min-w-0 items-center gap-1.5 text-text-secondary" title={current.name}>
        {name}
      </span>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="max-w-[360px] min-w-0 shrink text-text-secondary"
          title={current.name}
        >
          {name}
          <ChevronDown className="text-text-muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <PickerCommand>
          <CommandList>
            {boards.map(b => (
              <PickerItem
                checked={b.slug === current.slug}
                key={b.slug}
                value={b.slug}
                onSelect={() => {
                  setOpen(false);
                  onPick(b.slug);
                }}
              >
                <span className="flex-1 truncate">{b.name}</span>
              </PickerItem>
            ))}
          </CommandList>
        </PickerCommand>
      </PopoverContent>
    </Popover>
  );
}

const OPEN_ISSUES_LABEL = 'All open issues';

const STATE_GROUPS = [
  ['active', 'Active'],
  ['planned', 'Planned'],
  ['completed', 'Finished'],
] as const;

function SprintPicker({
  sprints,
  current,
  openIssues,
  loading,
  resolving,
  onPick,
  onPickOpen,
}: {
  sprints: readonly Sprint[];
  current: Sprint | null;
  openIssues: boolean;
  loading: boolean;
  /** The board has not said which sprint it shows yet. */
  resolving: boolean;
  onPick: (sprint: Sprint) => void;
  onPickOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const searchable = sprints.length > 8;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Sprint">
          {resolving ? (
            <Skeleton className="h-3.5 w-24" />
          ) : (
            <span className={cn(!current && !openIssues && 'text-text-secondary')}>
              {current?.name ?? (openIssues ? OPEN_ISSUES_LABEL : 'No active sprint')}
            </span>
          )}
          <ChevronDown className="text-text-muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <PickerCommand>
          {searchable ? <CommandInput placeholder="Find a sprint" /> : null}
          <CommandList>
            {searchable ? <CommandEmpty>No sprint matches.</CommandEmpty> : null}
            <CommandGroup>
              <PickerItem
                checked={openIssues}
                value={BOARD_OPEN_ISSUES}
                keywords={[OPEN_ISSUES_LABEL]}
                onSelect={() => {
                  setOpen(false);
                  onPickOpen();
                }}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{OPEN_ISSUES_LABEL}</span>
                  <span className="text-2xs text-text-secondary">Every unresolved issue, in a sprint or not</span>
                </span>
              </PickerItem>
            </CommandGroup>
            {loading ? <p className="px-3 py-2 text-xs text-text-muted">Loading sprints…</p> : null}
            {STATE_GROUPS.map(([state, heading]) => {
              const group = sprints.filter(s => s.state === state);
              if (group.length === 0) return null;
              return (
                <CommandGroup key={state} heading={heading}>
                  {group.map(s => (
                    <PickerItem
                      checked={s.slug === current?.slug}
                      key={s.slug}
                      value={s.slug}
                      keywords={[s.name]}
                      title={s.name}
                      onSelect={() => {
                        setOpen(false);
                        onPick(s);
                      }}
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{s.name}</span>
                        <span className="text-2xs text-text-secondary">{sprintDatesLabel(s)}</span>
                      </span>
                    </PickerItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </PickerCommand>
      </PopoverContent>
    </Popover>
  );
}

function UnmappedNotice({ view, canManage, projectKey }: { view: BoardView; canManage: boolean; projectKey: string }) {
  const n = view.unmapped.reduce((sum, s) => sum + s.count, 0);
  return (
    <BoardNotice>
      <span>
        {plural(n, 'card is', 'cards are')} not shown: {view.unmapped.map(s => `${s.name} (${s.count})`).join(', ')}{' '}
        {view.unmapped.length === 1 ? 'is' : 'are'} on no column.
      </span>
      {canManage ? (
        <Link
          href={`/projects/${projectKey}/settings?tab=boards&board=${view.board.slug}` as Route}
          className="action-link font-medium text-text"
        >
          Add a column
        </Link>
      ) : null}
    </BoardNotice>
  );
}

function TruncatedNotice({ view }: { view: BoardView }) {
  const shown = view.lanes.reduce((sum, l) => sum + l.count, 0);
  const matched =
    view.columns.reduce((sum, c) => sum + c.count, 0) + view.unmapped.reduce((sum, u) => sum + u.count, 0);
  return (
    <BoardNotice>
      {shown < matched
        ? `Showing ${formatCount(shown)} of ${plural(matched, 'card')}. Narrow the filter to see the rest.`
        : `Only the first ${formatCount(BOARD_CARDS_MAX)} cards are shown. Narrow the filter to see the rest.`}
    </BoardNotice>
  );
}

function BoardNotice({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-md border bg-surface px-3 py-2 text-xs text-text-secondary"
    >
      <Info aria-hidden className="mt-px size-3.5 flex-none text-text-muted" />
      <p className="flex min-w-0 flex-wrap items-center gap-x-2">{children}</p>
    </div>
  );
}

interface BoardGridProps {
  projectKey: string;
  view: BoardView;
  /** null on the open-issues board: new cards go to the backlog. */
  sprint: Sprint | null;
  canPlan: boolean;
  today: string;
  /** The committed filter, trimmed; empty when none. */
  filter: string;
  nothingMatches: boolean;
  onClearFilter: () => void;
  onOpen: (key: string) => void;
}

type CellRef = { lane: string | null; column: string };

/** Why a card cannot be dropped in another lane, and where its lane's value is changed instead. */
function laneHint(board: Board): string {
  if (board.swimlane_by === 'issues') return 'A card stays in its lane. Change its parent on the issue.';
  if (board.swimlane_field === 'assignee')
    return 'A card stays in its lane. Change its assignees with the avatars on the card.';
  if (board.swimlane_field) return `A card stays in its lane. Change its ${board.swimlane_field} on the issue.`;
  return 'A card stays in its lane.';
}

function columnsPastRightEdge(el: HTMLElement): HTMLElement[] {
  const right = el.scrollLeft + el.clientWidth;
  return [...el.querySelectorAll<HTMLElement>('[data-column-header]')].filter(
    h => h.offsetLeft + h.offsetWidth > right + 1,
  );
}

/** Columns cut off at the right edge of the board, and whether it is scrolled away from the left. */
function useOverflowColumns(scroller: RefObject<HTMLDivElement | null>) {
  const [edges, setEdges] = useState({ left: false, hidden: 0 });
  const read = (el: HTMLElement) => {
    const left = el.scrollLeft > 0;
    const hidden = columnsPastRightEdge(el).length;
    setEdges(e => (e.left === left && e.hidden === hidden ? e : { left, hidden }));
  };
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const left = el.scrollLeft > 0;
      const hidden = columnsPastRightEdge(el).length;
      setEdges(e => (e.left === left && e.hidden === hidden ? e : { left, hidden }));
    });
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [scroller]);
  const revealNext = () => {
    const el = scroller.current;
    const next = el ? columnsPastRightEdge(el)[0] : undefined;
    if (el && next)
      el.scrollBy({ left: next.offsetLeft + next.offsetWidth - el.scrollLeft - el.clientWidth, behavior: 'smooth' });
  };
  return { ...edges, onScroll: (e: UIEvent<HTMLElement>) => read(e.currentTarget), revealNext };
}

function BoardGrid({
  projectKey,
  view,
  sprint,
  canPlan,
  today,
  filter,
  nothingMatches,
  onClearFilter,
  onOpen,
}: BoardGridProps) {
  const filtered = filter !== '';
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(view.columns.filter(c => c.collapsed_by_default).map(c => c.name)),
  );
  const [closedLanes, setClosedLanes] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState<CardData | null>(null);
  const [over, setOver] = useState<CellRef | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const overflow = useOverflowColumns(scroller);
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

  const template = view.columns
    .map(c => (collapsed.has(c.name) ? `${COLLAPSED_COLUMN}px` : `minmax(${COLUMN_MIN}px, ${COLUMN_MAX}px)`))
    .join(' ');
  const minWidth = view.columns.reduce((sum, c) => sum + (collapsed.has(c.name) ? COLLAPSED_COLUMN : COLUMN_MIN), 0);
  const canCreate = canPlan && sprint?.state !== 'completed';
  const lastColumn = view.columns.at(-1)?.name;
  const lanes = nothingMatches ? [] : view.lanes;
  // The last row takes the frame's spare height, so columns run to its bottom edge.
  const rows = ['40px'];
  for (const lane of lanes) {
    if (lane.kind !== 'all') rows.push('auto');
    if (!closedLanes.has(lane.key ?? lane.kind)) rows.push('auto');
  }
  if (nothingMatches) rows.push('auto');
  if (rows.length > 1) rows[rows.length - 1] = '1fr';
  const lastLane = lanes.at(-1);
  const lastRowIsCells = lastLane !== undefined && !closedLanes.has(lastLane.key ?? lastLane.kind);
  const refused = dragging !== null && over !== null && over.lane !== dragging.lane;

  const send = (vars: Parameters<typeof move.mutate>[0]) =>
    move.mutate(vars, {
      onError: error => toastError(`Could not move ${vars.card.key} to ${vars.to}`, error, { retry: () => send(vars) }),
    });

  const onDragStart = (event: DragStartEvent) => setDragging(event.active.data.current as CardData);
  const onDragOver = (event: DragOverEvent) => setOver((event.over?.data.current as CellRef | undefined) ?? null);
  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    setOver(null);
    const from = event.active.data.current as CardData;
    const to = event.over?.data.current as CellRef | undefined;
    if (!to || to.lane !== from.lane || to.column === from.column) return;
    const column = view.columns.find(c => c.name === to.column);
    const value = column?.values[0];
    if (!value) return;
    send({ card: from.card, from: from.column, to: to.column, lane: from.lane, field: view.board.column_field, value });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={cellUnderCard}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragging(null);
        setOver(null);
      }}
    >
      <div className="relative flex min-h-0 max-w-full flex-1 self-start">
        <div
          ref={scroller}
          onScroll={overflow.onScroll}
          className="relative min-w-0 flex-1 overflow-auto rounded-md border bg-app"
        >
          <div
            className="grid min-h-full w-full"
            style={{ gridTemplateColumns: template, gridTemplateRows: rows.join(' '), minWidth }}
          >
            {view.columns.map(column => (
              <ColumnHeader
                key={column.name}
                column={column}
                collapsed={collapsed.has(column.name)}
                filtered={filtered}
                edge={column.name === lastColumn}
                onToggle={() => setCollapsed(s => toggle(s, column.name))}
              />
            ))}

            {nothingMatches ? (
              <div
                className="sticky left-0 flex max-w-[calc(100vw-2rem)] flex-col items-start gap-2 px-4 py-6"
                style={{ gridColumn: `1 / span ${view.columns.length}` }}
              >
                <p className="font-medium">
                  No card matches <code className="font-mono text-xs">{filter}</code>
                </p>
                <p className="text-xs text-text-secondary">The sprint&rsquo;s other cards are hidden by the filter.</p>
                <Button size="sm" variant="outline" className="mt-1" onClick={onClearFilter}>
                  Clear filter
                </Button>
              </div>
            ) : null}

            {lanes.map(lane => {
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
                            disabled={!canPlan}
                            dragging={dragging}
                            edge={column.name === lastColumn}
                            bottom={lastRowIsCells && lane === lastLane}
                            whole={lane.kind === 'all'}
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
                                sprint={sprint?.slug ?? null}
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
        </div>
        {overflow.left ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-px left-px z-20 w-6 rounded-l-md bg-linear-to-r from-app to-transparent"
          />
        ) : null}
        {overflow.hidden > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={overflow.revealNext}
                aria-label={`Show ${plural(overflow.hidden, 'more column')}`}
                className="absolute inset-y-px right-px z-20 flex w-7 flex-col items-center gap-0.5 rounded-r-md bg-linear-to-l from-app via-app/85 to-transparent pt-2 text-text-secondary hover:text-text"
              >
                <span className="text-2xs font-medium tabular">+{overflow.hidden}</span>
                <ChevronRight aria-hidden className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">{plural(overflow.hidden, 'more column')}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div className={cn('relative', refused && 'cursor-not-allowed')}>
            <BoardCard card={dragging.card} projectKey={projectKey} today={today} overlay />
            {refused ? (
              <p
                role="status"
                className="absolute inset-x-0 bottom-full mb-2 rounded-md border border-danger-fg/40 bg-surface px-2 py-1.5 text-xs text-danger-fg shadow-md"
              >
                {laneHint(view.board)}
              </p>
            ) : null}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/** `4 cards · limit 2–6`, or what is wrong with the count. */
function wipSummary(column: BoardViewColumn): string | null {
  const { wip_min: min, wip_max: max, total } = column;
  if (min === null && max === null) return null;
  const cards = plural(total, 'card');
  if (column.over_wip_max) return `${cards}, over the limit of ${max}`;
  if (column.under_wip_min) return `${cards}, under the minimum of ${min}`;
  const limit = min !== null && max !== null ? `${min}–${max}` : max !== null ? `at most ${max}` : `at least ${min}`;
  return `${cards} · limit ${limit}`;
}

function ColumnHeader({
  column,
  collapsed,
  filtered,
  edge,
  onToggle,
}: {
  column: BoardViewColumn;
  collapsed: boolean;
  filtered: boolean;
  /** The rightmost column: the frame draws its right edge. */
  edge: boolean;
  onToggle: () => void;
}) {
  const wip = wipSummary(column);
  const limits = [
    column.wip_min !== null ? `min ${column.wip_min}` : null,
    column.wip_max !== null ? `max ${column.wip_max}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-column-header
            onClick={onToggle}
            aria-label={`Expand ${column.name}`}
            className={cn(
              'sticky top-0 z-10 flex h-10 items-center justify-center gap-0.5 border-b bg-surface text-text-secondary hover:bg-hover',
              !edge && 'border-r',
            )}
          >
            <UnfoldHorizontal
              aria-hidden
              className={cn(
                'size-3.5 text-text-muted',
                column.over_wip_max && 'text-danger-fg',
                column.under_wip_min && 'text-warning-fg',
              )}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Expand {column.name} · {wip ?? plural(column.total, 'card')}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div
      data-column-header
      className={cn(
        'sticky top-0 z-10 flex h-10 min-w-0 items-center gap-2 border-b bg-surface px-2',
        !edge && 'border-r',
        column.over_wip_max && 'shadow-[inset_0_-2px_0_var(--danger-fg)]',
        column.under_wip_min && 'shadow-[inset_0_-2px_0_var(--warning-fg)]',
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label={`Collapse ${column.name}`} onClick={onToggle}>
            <FoldHorizontal className="size-3.5 text-text-muted" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Collapse column</TooltipContent>
      </Tooltip>
      <span className="truncate font-medium">{column.name}</span>
      {column.resolved ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="c-green rounded-xs bg-c-bg px-1 text-2xs leading-4 font-medium text-c-fg">resolved</span>
          </TooltipTrigger>
          <TooltipContent side="bottom">Cards here count as resolved</TooltipContent>
        </Tooltip>
      ) : null}
      <span className="ml-auto flex flex-none items-center gap-2 text-xs tabular">
        {limits ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  'whitespace-nowrap text-text-muted',
                  column.over_wip_max && 'font-medium text-danger-fg',
                  column.under_wip_min && 'font-medium text-warning-fg',
                )}
              >
                {limits}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">{wip}</TooltipContent>
          </Tooltip>
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                'rounded-xs bg-inset px-1.5 font-medium whitespace-nowrap text-text-secondary',
                column.over_wip_max && 'c-red bg-c-bg text-c-fg',
                column.under_wip_min && 'c-amber bg-c-bg text-c-fg',
              )}
            >
              {filtered && column.count !== column.total
                ? `${formatCount(column.count)} of ${formatCount(column.total)}`
                : formatCount(column.count)}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {filtered
              ? `${column.count} matching the filter, ${column.total} in the column`
              : `${plural(column.total, 'card')}`}
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
        <span className="text-xs tabular text-text-muted">{plural(lane.count, 'card')}</span>
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
      {lane.member ? (
        <PersonName person={lane.member} label={lane.label} avatar />
      ) : (
        <span className={cn('truncate', lane.kind === 'uncategorized' && 'text-text-secondary')}>{lane.label}</span>
      )}
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
  edge,
  bottom,
  whole,
  children,
}: {
  lane: string | null;
  column: BoardViewColumn;
  collapsed: boolean;
  count: number;
  disabled: boolean;
  dragging: CardData | null;
  edge: boolean;
  /** In the last row: the frame draws the bottom edge. */
  bottom: boolean;
  /** The board has no lanes, so the cell holds the whole column. */
  whole: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: cellId(lane, column.name),
    data: { lane, column: column.name } satisfies CellRef,
    disabled,
  });
  const otherLane = dragging !== null && dragging.lane !== lane;
  const target = isOver && dragging !== null && !otherLane && dragging.column !== column.name;
  const refused = isOver && otherLane;
  const borders = cn(!edge && 'border-r', !bottom && 'border-b');

  if (collapsed) {
    return (
      <div className={cn('flex justify-center bg-surface py-3 text-xs font-medium text-text-secondary', borders)}>
        <span
          className={cn(
            '[writing-mode:vertical-rl]',
            whole && column.over_wip_max && 'text-danger-fg',
            whole && column.under_wip_min && 'text-warning-fg',
          )}
        >
          {column.name} ·{' '}
          {whole && column.over_wip_max && column.wip_max !== null ? `${count}/${column.wip_max}` : count}
        </span>
      </div>
    );
  }
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group/cell flex min-h-16 flex-col gap-2 p-2 transition-colors',
        borders,
        target && 'bg-selected',
        refused && 'outline-1 -outline-offset-4 outline-danger-fg outline-dashed',
        dragging && !disabled && !otherLane && !target && dragging.column !== column.name && 'bg-surface/60',
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

/** The board's own columns once the board list has them; until then only the frame, so nothing moves when they arrive. */
function BoardSkeleton({ columns }: { columns: readonly BoardColumn[] | null }) {
  const template = (columns ?? [])
    .map(c => (c.collapsed_by_default ? `${COLLAPSED_COLUMN}px` : `minmax(${COLUMN_MIN}px, ${COLUMN_MAX}px)`))
    .join(' ');
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border bg-app">
      {columns ? (
        <div className="grid min-w-0 flex-1 grid-rows-[40px_1fr]" style={{ gridTemplateColumns: template }}>
          {columns.map((c, i) => (
            <div
              key={`h${i}`}
              className={cn('flex items-center border-b bg-surface px-2', i < columns.length - 1 && 'border-r')}
            >
              {c.collapsed_by_default ? null : <Skeleton className="h-3.5 w-24" />}
            </div>
          ))}
          {columns.map((c, i) => (
            <div key={`b${i}`} className={cn('flex flex-col gap-2 p-2', i < columns.length - 1 && 'border-r')}>
              {c.collapsed_by_default
                ? null
                : Array.from({ length: 3 - (i % 2) }, (_, n) => (
                    <Skeleton key={n} className="h-20 w-full rounded-md" />
                  ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
