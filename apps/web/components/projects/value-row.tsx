'use client';

import { useId, useState, type DragEvent, type ReactNode } from 'react';
import { ChevronDown, GripVertical } from 'lucide-react';
import { cn } from '@lib/utils';

/** The one tag a settings row carries: Default, Built in, Required, Estimation, Archived. */
export function RowChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block h-4.5 shrink-0 rounded-xs border px-1.5 text-2xs leading-4 whitespace-nowrap text-text-secondary',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** The drag handle at the start of a reorderable row; `null` keeps its 24 px column where a row cannot move. */
export function ReorderGrip({
  name,
  onDragStart,
  onDragEnd,
}: {
  name: string | null;
  onDragStart?: (event: DragEvent) => void;
  onDragEnd?: () => void;
}) {
  if (name === null) return <span aria-hidden className="size-6 flex-none" />;
  return (
    <button
      type="button"
      draggable
      aria-label={`Reorder ${name}. Alt and the arrow keys move it.`}
      title="Drag to reorder · Alt+↑/↓"
      onClick={e => e.stopPropagation()}
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', name);
        onDragStart?.(e);
      }}
      onDragEnd={onDragEnd}
      className="grid size-6 flex-none cursor-grab place-items-center rounded-sm text-text-muted hover:bg-hover hover:text-text active:cursor-grabbing"
    >
      <GripVertical className="size-3.5" />
    </button>
  );
}

/** The frame around a value's badge or swatch that opens its colour and letter: the same 24 px button in every list. */
export function MarkFrame({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-6 flex-none items-center gap-0.5 rounded-sm border border-transparent pr-0.5 pl-1 text-text-muted group-hover/mark:border-border group-hover/mark:bg-hover group-hover/mark:text-text group-data-[state=open]/mark:border-border">
      {children}
      <ChevronDown className="size-3" />
    </span>
  );
}

export const markButtonClass = 'group/mark flex-none rounded-sm';

/** A list's column captions, above its rows and on the rows' own grid. */
export const listHeaderClass =
  'flex h-row-dense items-center gap-2 border-b px-2 text-2xs font-medium text-text-secondary max-sm:hidden';

/** The name column of a value list: it grows to a reading width, so the columns after it stay beside it. */
export const nameColumnClass = 'flex min-w-0 flex-1 basis-0 sm:max-w-[24rem]';

/** A cell that sits on the row's first line, so a row that grows (a rename's error) grows only downwards. */
export const rowCellClass = 'flex h-row flex-none items-center';

/**
 * Archived values go after the live ones. `positionOf` is a row's place in the full order, archived
 * included, which is what a move sends.
 */
export function archivedLast<T extends { position: number; is_archived?: boolean }>(rows: readonly T[]) {
  const ordered = rows.toSorted((a, b) => a.position - b.position);
  const live = ordered.filter(r => !r.is_archived);
  return {
    shown: [...live, ...ordered.filter(r => r.is_archived)],
    live,
    positionOf: (row: T) => ordered.indexOf(row),
  };
}

/** A value's name, renamed in place. A refused rename keeps the editor open with the reason under it. */
export function InlineRename({
  name,
  canEdit,
  onRename,
}: {
  name: string;
  canEdit: boolean;
  /** Resolves once the name is saved; a rejection's message shows under the editor. */
  onRename: (next: string) => Promise<unknown> | void;
}) {
  const errorId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (draft === null) {
    return (
      <span className="flex min-h-row min-w-0 items-center">
        {canEdit ? (
          <button
            type="button"
            title="Click to rename"
            onClick={() => setDraft(name)}
            className="min-w-0 truncate rounded-sm px-1 text-left text-sm hover:bg-hover"
          >
            {name}
          </button>
        ) : (
          <span className="min-w-0 truncate px-1 text-sm">{name}</span>
        )}
      </span>
    );
  }

  const close = () => {
    setDraft(null);
    setError(null);
  };

  const commit = () => {
    if (pending) return;
    const next = draft.trim();
    if (!next || next === name) return close();
    const saving = onRename(next);
    if (!saving) return close();
    setPending(true);
    saving
      .then(close, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setPending(false));
  };

  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1 pt-[calc((var(--row)-var(--control-sm))/2)] pb-1.5">
      <input
        data-slot="input"
        autoFocus
        aria-label={`Rename ${name}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        readOnly={pending}
        value={draft}
        onChange={e => {
          setDraft(e.target.value);
          setError(null);
        }}
        onBlur={() => (error ? close() : commit())}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') close();
        }}
        className="h-control-sm w-full max-w-xs rounded-sm border border-border-strong bg-surface px-1 text-sm text-text aria-invalid:border-danger-fg"
      />
      {error ? (
        <p id={errorId} role="alert" className="px-1 text-xs text-danger-fg">
          {error}
        </p>
      ) : null}
    </span>
  );
}
