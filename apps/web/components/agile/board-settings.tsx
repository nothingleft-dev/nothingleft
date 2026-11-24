'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { ArrowRight, MoreHorizontal, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { Board } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu';
import { Input } from '@components/ui/input';
import { Label } from '@components/ui/label';
import { ConfirmDialog } from '@components/confirm-dialog';
import { EmptyState } from '@components/empty-state';
import { LoadError, errorDetail } from '@components/query-state';
import { Skeleton } from '@components/ui/skeleton';
import { BoardColumnsEditor } from '@components/agile/board-settings-columns';
import { BoardSwimlanes } from '@components/agile/board-settings-swimlanes';
import { useBoard, useBoards, useCreateBoard, useDeleteBoard, useUpdateBoard } from '@hooks/use-boards';
import { cn } from '@lib/utils';
import { toastError } from '@components/toast-error';
import { PendingButton } from '@components/pending-button';
import { plural } from '@lib/numbers';

interface BoardSettingsProps {
  projectKey: string;
  selectedSlug: string | null;
  canEdit: boolean;
}

const SWIMLANE_SUMMARY: Record<Board['swimlane_by'], (b: Board) => string> = {
  none: () => 'No swimlanes',
  values: b => `Swimlanes by ${b.swimlane_field ?? 'value'}`,
  issues: b => (b.swimlane_types.length ? `Swimlanes by issue: ${b.swimlane_types.join(', ')}` : 'Swimlanes by issue'),
};

export function BoardSettings({ projectKey, selectedSlug, canEdit }: BoardSettingsProps) {
  const router = useRouter();
  const boards = useBoards(projectKey);
  const list = boards.data ?? [];
  const selected = list.find(b => b.slug === selectedSlug) ?? list[0] ?? null;
  const detail = useBoard(projectKey, selected?.slug ?? null);
  const board = detail.data ?? selected;

  const [naming, setNaming] = useState<{ mode: 'create' } | { mode: 'rename'; board: Board } | null>(null);
  const [deleting, setDeleting] = useState<Board | null>(null);
  const remove = useDeleteBoard(projectKey);
  const select = (slug: string | null) =>
    router.replace(
      `/projects/${projectKey}/settings?tab=boards${slug ? `&board=${encodeURIComponent(slug)}` : ''}` as Route,
    );

  return (
    <>
      <p className="max-w-[72ch] text-sm text-pretty text-text-secondary">
        Each board shows a sprint, or every open issue, as columns of cards. Pick one to change its columns and
        swimlanes.
      </p>
      {/* The list beside what it selects: choosing a board never pushes its editor down the page. */}
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Boards" className="flex min-w-0 flex-col gap-2">
          <div className="flex h-8 items-center gap-2">
            <h2 className="font-semibold">Boards</h2>
            {list.length > 0 ? <span className="text-xs text-text-secondary tabular">{list.length}</span> : null}
            {canEdit ? (
              <Button variant="outline" size="sm" className="ml-auto" onClick={() => setNaming({ mode: 'create' })}>
                <Plus />
                New board
              </Button>
            ) : null}
          </div>
          {boards.isPending ? (
            <div className="flex flex-col gap-2 py-1.5">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-3.5 w-32" />
              ))}
            </div>
          ) : boards.isError && !boards.data ? (
            <LoadError onRetry={() => void boards.refetch()} detail={errorDetail(boards.error)}>
              The boards could not be loaded.
            </LoadError>
          ) : list.length === 0 ? (
            <EmptyState
              title="This project has no board."
              description={canEdit ? 'Create one to follow a sprint as columns of cards.' : undefined}
            />
          ) : (
            <ul className="flex flex-col gap-px">
              {list.map(b => {
                const active = b.slug === selected?.slug;
                return (
                  <li key={b.slug}>
                    <button
                      type="button"
                      aria-current={active ? 'true' : undefined}
                      onClick={() => select(b.slug)}
                      title={b.name}
                      className={cn(
                        'relative flex h-8 w-full items-center rounded-sm px-2.5 text-left text-sm',
                        active
                          ? 'bg-active font-medium text-text before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-brand'
                          : 'text-text-secondary hover:bg-hover hover:text-text',
                      )}
                    >
                      <span className="truncate">{b.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        {board ? (
          <div className="flex min-w-0 flex-col gap-5">
            <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b pb-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <h2 className="truncate text-lg font-semibold" title={board.name}>
                  {board.name}
                </h2>
                <p className="truncate text-xs text-text-secondary">
                  <span className="font-mono text-2xs">{board.slug}</span> · {plural(board.columns.length, 'column')} ·{' '}
                  {SWIMLANE_SUMMARY[board.swimlane_by](board)}
                </p>
              </div>
              <div className="ml-auto flex flex-none items-center gap-1">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/projects/${projectKey}/board/${board.slug}/current` as Route}>
                    View board
                    <ArrowRight />
                  </Link>
                </Button>
                {canEdit ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`${board.name}: more`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setNaming({ mode: 'rename', board })}>Rename</DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(board)}>
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            </header>
            <BoardColumnsEditor key={`columns-${board.slug}`} projectKey={projectKey} board={board} canEdit={canEdit} />
            <BoardSwimlanes key={`lanes-${board.slug}`} projectKey={projectKey} board={board} canEdit={canEdit} />
          </div>
        ) : null}
      </div>

      <BoardNameDialog
        projectKey={projectKey}
        state={naming}
        onClose={() => setNaming(null)}
        onSaved={(saved, previousSlug) => {
          if (!previousSlug || previousSlug === selected?.slug) select(saved.slug);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={open => (open ? null : setDeleting(null))}
        title={`Delete the board ${deleting?.name ?? ''}?`}
        confirmLabel="Delete board"
        pendingLabel="Deleting…"
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          const gone = deleting;
          remove.mutate(gone.slug, {
            onSuccess: () => {
              toast.success(`Deleted ${gone.name}.`);
              setDeleting(null);
              if (gone.slug === selected?.slug) select(null);
            },
            onError: error => toastError(`Could not delete ${gone.name}`, error),
          });
        }}
      >
        <p>Its columns and swimlanes go. Issues and sprints are untouched.</p>
        <p>Links to this board stop working for everyone.</p>
      </ConfirmDialog>
    </>
  );
}

interface BoardNameDialogProps {
  projectKey: string;
  state: { mode: 'create' } | { mode: 'rename'; board: Board } | null;
  onClose: () => void;
  onSaved: (board: Board, previousSlug: string | null) => void;
}

function BoardNameDialog({ projectKey, state, onClose, onSaved }: BoardNameDialogProps) {
  return (
    <Dialog open={state !== null} onOpenChange={open => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        {state ? (
          <BoardNameForm
            key={state.mode === 'rename' ? state.board.slug : 'create'}
            projectKey={projectKey}
            state={state}
            onClose={onClose}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function BoardNameForm({
  projectKey,
  state,
  onClose,
  onSaved,
}: Omit<BoardNameDialogProps, 'state'> & { state: NonNullable<BoardNameDialogProps['state']> }) {
  const renaming = state.mode === 'rename' ? state.board : null;
  const [name, setName] = useState(renaming?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const create = useCreateBoard(projectKey);
  const update = useUpdateBoard(projectKey);
  const pending = create.isPending || update.isPending;

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return setError('A board needs a name.');
    if (renaming && trimmed === renaming.name) return onClose();
    const done = { onError: (e: Error) => setError(e.message) };
    if (renaming) {
      update.mutate(
        { slug: renaming.slug, body: { name: trimmed }, optimistic: b => ({ ...b, name: trimmed }) },
        {
          ...done,
          onSuccess: board => {
            onSaved(board, renaming.slug);
            onClose();
          },
        },
      );
    } else {
      create.mutate(
        { name: trimmed },
        {
          ...done,
          onSuccess: board => {
            toast.success(`Created ${board.name}.`);
            onSaved(board, null);
            onClose();
          },
        },
      );
    }
  };

  return (
    <form
      noValidate
      onSubmit={e => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>{renaming ? 'Rename board' : 'New board'}</DialogTitle>
        <DialogDescription className="text-xs text-text-secondary">
          {renaming
            ? 'Its address changes with the name; old links to it stop working.'
            : 'It starts with To Do, In Progress and Done columns, which you can change afterwards.'}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="board-name">Name</Label>
        <Input
          id="board-name"
          autoFocus
          value={name}
          aria-invalid={error !== null}
          onChange={e => {
            setName(e.target.value);
            setError(null);
          }}
        />
        {error ? <p className="text-xs text-danger-fg">{error}</p> : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <PendingButton type="submit" pending={pending} pendingLabel="Saving…">
          {renaming ? 'Rename' : 'Create board'}
        </PendingButton>
      </DialogFooter>
    </form>
  );
}
