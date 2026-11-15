'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { ArrowRight, MoreHorizontal, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { Board } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu';
import { Input } from '@components/ui/input';
import { Label } from '@components/ui/label';
import { ConfirmDialog } from '@components/confirm-dialog';
import { EmptyState } from '@components/empty-state';
import { LoadError, errorDetail } from '@components/query-state';
import { RowsSkeleton } from '@components/skeletons';
import { SettingsSection } from '@components/settings/section';
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

// Past this many boards the list scrolls, so the chosen board's columns stay near the top of the page.
const LIST_ROWS = 6;

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
  const listRef = useRef<HTMLUListElement>(null);

  // A long list scrolls inside its frame; the chosen board stays in sight there.
  useLayoutEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>('[aria-current="true"]')?.closest('li');
    if (!list || !row) return;
    if (row.offsetTop < list.scrollTop || row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = row.offsetTop - list.clientHeight / 2 + row.offsetHeight / 2;
  }, [selected?.slug, list.length]);

  const select = (slug: string | null) =>
    router.replace(
      `/projects/${projectKey}/settings?tab=boards${slug ? `&board=${encodeURIComponent(slug)}` : ''}` as Route,
    );

  return (
    <>
      <SettingsSection
        title="Boards"
        description="Each board shows one sprint at a time as columns of cards. Pick one to change its columns and swimlanes."
        actions={
          canEdit ? (
            <Button variant="outline" onClick={() => setNaming({ mode: 'create' })}>
              <Plus />
              New board
            </Button>
          ) : null
        }
      >
        {boards.isPending ? (
          <RowsSkeleton rows={2} />
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
          <ul
            ref={listRef}
            className={cn(
              'relative flex flex-col divide-y divide-border-subtle rounded-md border',
              list.length > LIST_ROWS && 'scroll-fade max-h-[calc(var(--row)*6.5)] overflow-y-auto',
            )}
            aria-label="Boards"
          >
            {list.map(b => {
              const active = b.slug === selected?.slug;
              return (
                <li
                  key={b.slug}
                  className={cn(
                    'relative flex h-row flex-none items-center gap-2 pr-1',
                    active && 'bg-active before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-brand',
                  )}
                >
                  <button
                    type="button"
                    aria-current={active ? 'true' : undefined}
                    onClick={() => select(b.slug)}
                    className="grid h-full min-w-0 flex-1 grid-cols-[minmax(0,1fr)] items-center gap-3 px-3 text-left hover:bg-hover sm:grid-cols-[minmax(0,1fr)_minmax(0,15rem)_15rem]"
                  >
                    <span className="truncate font-medium" title={b.name}>
                      {b.name}
                    </span>
                    <span
                      className={cn(
                        'hidden truncate font-mono text-2xs sm:block',
                        active ? 'text-text-secondary' : 'text-text-muted',
                      )}
                      title={b.slug}
                    >
                      {b.slug}
                    </span>
                    <span className="hidden truncate text-xs whitespace-nowrap text-text-secondary sm:block">
                      {plural(b.columns.length, 'column')} · {SWIMLANE_SUMMARY[b.swimlane_by](b)}
                    </span>
                  </button>
                  <Button asChild variant="ghost" size="sm" className="text-text-secondary hover:text-text">
                    <Link href={`/projects/${projectKey}/board/${b.slug}/current` as Route}>
                      View board
                      <ArrowRight />
                    </Link>
                  </Button>
                  {canEdit ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`${b.name}: more`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setNaming({ mode: 'rename', board: b })}>
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(b)}>
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </SettingsSection>

      {board ? (
        <>
          <BoardColumnsEditor key={`columns-${board.slug}`} projectKey={projectKey} board={board} canEdit={canEdit} />
          <BoardSwimlanes key={`lanes-${board.slug}`} projectKey={projectKey} board={board} canEdit={canEdit} />
        </>
      ) : null}

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
            : 'It starts with To do, In progress and Done columns, which you can change afterwards.'}
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
