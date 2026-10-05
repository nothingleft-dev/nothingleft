'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RESOLVED_STATUS_CATEGORIES,
  type Board,
  type BoardCard,
  type BoardView,
  type CreateBoard,
  type BoardColumnField,
  type BoardValueRef,
  type UpdateBoard,
  type UpdateIssue,
} from '@nothingleft/types';
import {
  createBoard,
  deleteBoard,
  getBoard,
  getBoardBySlug,
  getBoardView,
  listBoards,
  updateBoard,
} from '@lib/api/boards';
import { updateIssue } from '@lib/api/issues';
import { isApiError } from '@lib/api/errors';
import { invalidateAgile } from '@lib/query/agile';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

export function useBoards(projectKey: string | null) {
  return useQuery({
    queryKey: queryKeys.boards(projectKey ?? ''),
    refetchInterval: POLL.admin,
    queryFn: () => listBoards(projectKey!).then(r => r.data),
    enabled: projectKey !== null,
  });
}

export function useBoard(projectKey: string, slug: string | null) {
  return useQuery({
    queryKey: queryKeys.board(projectKey, slug ?? ''),
    refetchInterval: POLL.admin,
    queryFn: () => getBoard(projectKey, slug!).then(r => r.data),
    enabled: slug !== null,
  });
}

/** The short `/board/<slug>` route: the board names its own project. */
export function useBoardBySlug(slug: string | null) {
  return useQuery({
    queryKey: queryKeys.boardBySlug(slug ?? ''),
    queryFn: () => getBoardBySlug(slug!).then(r => r.data),
    enabled: slug !== null,
    retry: false,
  });
}

export function useBoardView(projectKey: string, board: string, sprint: string, q: string) {
  return useQuery({
    queryKey: queryKeys.boardView(projectKey, board, sprint, q),
    refetchInterval: POLL.list,
    queryFn: () => getBoardView(projectKey, board, { sprint, q }).then(r => r.data),
    retry: (count, error) => count < 1 && !(isApiError(error) && (error.status === 400 || error.status === 404)),
    placeholderData: keepPreviousData,
  });
}

function settleBoards(client: ReturnType<typeof useQueryClient>, projectKey: string) {
  void client.invalidateQueries({ queryKey: queryKeys.boards(projectKey) });
  void client.invalidateQueries({ queryKey: queryKeys.boardViews() });
}

export function useCreateBoard(projectKey: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBoard) => createBoard(projectKey, body).then(r => r.data),
    onSettled: () => settleBoards(client, projectKey),
  });
}

/**
 * Draws the change on the board being edited at once; the server's board replaces it. Writes
 * run one at a time, and only the last one standing touches the cache: each body is the whole
 * column list, so an older answer landing late would undo a newer edit.
 */
export function useUpdateBoard(projectKey: string) {
  const client = useQueryClient();
  const mutationKey = ['boards', projectKey, 'write'] as const;
  const alone = () => client.isMutating({ mutationKey }) <= 1;
  return useMutation({
    mutationKey,
    scope: { id: `board-write-${projectKey}` },
    mutationFn: ({ slug, body }: { slug: string; body: UpdateBoard; optimistic?: (b: Board) => Board }) =>
      updateBoard(projectKey, slug, body).then(r => r.data),
    onMutate: async ({ slug, optimistic }) => {
      const key = queryKeys.board(projectKey, slug);
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<Board>(key);
      if (previous && optimistic) client.setQueryData(key, optimistic(previous));
      return { previous, key };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(context.key, context.previous);
    },
    onSuccess: (board, { slug }) => {
      if (!alone()) return;
      client.setQueryData(queryKeys.board(projectKey, board.slug), board);
      if (board.slug !== slug) client.removeQueries({ queryKey: queryKeys.board(projectKey, slug), exact: true });
    },
    onSettled: () => {
      if (alone()) settleBoards(client, projectKey);
    },
  });
}

export function useDeleteBoard(projectKey: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => deleteBoard(projectKey, slug).then(r => r.data),
    onSettled: () => settleBoards(client, projectKey),
  });
}

export interface CardMove {
  card: BoardCard;
  from: string;
  to: string;
  /** The lane the card stays in; a drag never changes the lane's field. */
  lane: string | null;
  field: BoardColumnField;
  /** The target column's first value. */
  value: BoardValueRef;
}

const bump = (view: BoardView, column: string, by: number) =>
  view.columns.map(c => {
    if (c.name !== column) return c;
    const total = c.total + by;
    return {
      ...c,
      count: c.count + by,
      total,
      over_wip_max: c.wip_max !== null && total > c.wip_max,
      under_wip_min: c.wip_min !== null && total < c.wip_min,
    };
  });

function movedCard(card: BoardCard, move: CardMove): BoardCard {
  const { name, color, short_label, category } = move.value;
  if (move.field === 'status' && category) {
    return {
      ...card,
      status: { name, color, short_label, category },
      resolved: RESOLVED_STATUS_CATEGORIES.includes(category),
    };
  }
  if (move.field === 'priority') return { ...card, priority: { name, color, short_label } };
  if (move.field === 'type') return { ...card, type: { ...card.type, name, color, short_label } };
  return card;
}

function moveCard(view: BoardView, move: CardMove): BoardView {
  const moved = movedCard(move.card, move);
  const lanes = view.lanes.map(lane =>
    lane.key !== move.lane
      ? lane
      : {
          ...lane,
          cells: lane.cells.map(cell =>
            cell.column === move.from
              ? { ...cell, cards: cell.cards.filter(c => c.key !== move.card.key) }
              : cell.column === move.to
                ? { ...cell, cards: [...cell.cards, moved] }
                : cell,
          ),
        },
  );
  const columns = bump({ ...view, columns: bump(view, move.from, -1) }, move.to, 1);
  if (move.field !== 'status') return { ...view, lanes, columns };
  const distribution = view.distribution
    .map(s => (s.name === move.card.status.name ? { ...s, count: s.count - 1 } : s))
    .filter(s => s.count > 0);
  const target = distribution.find(s => s.name === moved.status.name);
  return {
    ...view,
    lanes,
    columns,
    distribution: target
      ? distribution.map(s => (s === target ? { ...s, count: s.count + 1 } : s))
      : [...distribution, { ...moved.status, count: 1 }],
  };
}

/** A card dropped on another column takes that column's first value of the board's column field. */
export function useMoveCard(projectKey: string) {
  const client = useQueryClient();
  const views = queryKeys.boardViews();
  return useMutation({
    mutationFn: ({ card, field, value }: CardMove) => updateIssue(card.key, { [field]: value.name }).then(r => r.data),
    onMutate: async move => {
      await client.cancelQueries({ queryKey: views });
      const previous = client.getQueriesData<BoardView>({ queryKey: views });
      for (const [key, data] of previous) {
        if (data && key[1] === projectKey) client.setQueryData(key, moveCard(data, move));
      }
      return { previous };
    },
    onError: (_error, _move, context) => {
      for (const [key, data] of context?.previous ?? []) client.setQueryData(key, data);
    },
    onSuccess: issue => client.setQueryData(queryKeys.issue(issue.key), issue),
    onSettled: () => {
      invalidateAgile(client);
      void client.invalidateQueries({ queryKey: queryKeys.issueSearches() });
    },
  });
}

export interface CardPatch {
  key: string;
  body: UpdateIssue;
  apply: (card: BoardCard) => BoardCard;
}

const patchCards = (view: BoardView, key: string, apply: (card: BoardCard) => BoardCard): BoardView => ({
  ...view,
  lanes: view.lanes.map(lane => ({
    ...lane,
    issue: lane.issue?.key === key ? apply(lane.issue) : lane.issue,
    cells: lane.cells.map(cell => ({ ...cell, cards: cell.cards.map(c => (c.key === key ? apply(c) : c)) })),
  })),
});

/** An edit made on the card itself — assignees, due date — drawn on every board view at once. */
export function usePatchCard() {
  const client = useQueryClient();
  const views = queryKeys.boardViews();
  return useMutation({
    mutationFn: ({ key, body }: CardPatch) => updateIssue(key, body).then(r => r.data),
    onMutate: async ({ key, apply }) => {
      await client.cancelQueries({ queryKey: views });
      const previous = client.getQueriesData<BoardView>({ queryKey: views });
      for (const [queryKey, data] of previous) if (data) client.setQueryData(queryKey, patchCards(data, key, apply));
      return { previous };
    },
    onError: (_error, _patch, context) => {
      for (const [queryKey, data] of context?.previous ?? []) client.setQueryData(queryKey, data);
    },
    onSuccess: issue => client.setQueryData(queryKeys.issue(issue.key), issue),
    onSettled: (_data, _error, { key }) => {
      invalidateAgile(client);
      void client.invalidateQueries({ queryKey: queryKeys.issueSearches() });
      void client.invalidateQueries({ queryKey: queryKeys.issueActivity(key) });
    },
  });
}
