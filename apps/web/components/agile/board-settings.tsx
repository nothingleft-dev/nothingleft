'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Plus } from 'lucide-react';
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
} from '@components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu';
import { Input } from '@components/ui/input';
import { Label } from '@components/ui/label';
import { ConfirmDialog } from '@components/confirm-dialog';
import { EmptyState } from '@components/empty-state';
import { FormAlert } from '@components/auth/form-alert';
import { RowsSkeleton } from '@components/skeletons';
import { SettingsSection } from '@components/settings/section';
import { BoardColumnsEditor } from '@components/agile/board-settings-columns';
import { BoardSwimlanes } from '@components/agile/board-settings-swimlanes';
import { useBoard, useBoards, useCreateBoard, useDeleteBoard, useUpdateBoard } from '@hooks/use-boards';
import { cn } from '@lib/utils';

interface BoardSettingsProps {
  projectKey: string;
  selectedSlug: string | null;
  canEdit: boolean;
}

const SWIMLANE_SUMMARY: Record<Board['swimlane_by'], (b: Board) => string> = {
  none: () => 'No swimlanes',
  values: b => `Swimlanes by ${b.swimlane_field ?? 'value'}`,
  issues: b => `Swimlanes by ${b.swimlane_types.join(', ') || 'issue'}`,
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
        ) : boards.isError ? (
          <FormAlert title="The boards could not be loaded." />
        ) : list.length === 0 ? (
          <EmptyState
            title="This project has no board."
            description={canEdit ? 'Create one to follow a sprint as columns of cards.' : undefined}
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle rounded-md border" aria-label="Boards">
            {list.map(b => {
              const active = b.slug === selected?.slug;
              return (
                <li key={b.slug} className={cn('flex h-row items-center gap-2 pr-1', active && 'bg-active')}>
                  <button
                    type="button"
                    aria-current={active ? 'true' : undefined}
                    onClick={() => select(b.slug)}
                    className="flex h-full min-w-0 flex-1 items-center gap-3 px-3 text-left hover:bg-hover"
                  >
                    <span className="truncate font-medium">{b.name}</span>
                    <span className="font-mono text-2xs text-text-muted">{b.slug}</span>
                    <span className="ml-auto hidden text-xs text-text-secondary sm:inline">
                      {b.columns.length} {b.columns.length === 1 ? 'column' : 'columns'} ·{' '}
                      {SWIMLANE_SUMMARY[b.swimlane_by](b)}
                    </span>
                  </button>
                  <Button asChild variant="ghost" size="sm" className="text-text-secondary">
                    <Link href={`/projects/${projectKey}/board/${b.slug}/current` as Route}>Open</Link>
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
            onError: error => toast.error(error.message),
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
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : renaming ? 'Rename' : 'Create board'}
        </Button>
      </DialogFooter>
    </form>
  );
}
