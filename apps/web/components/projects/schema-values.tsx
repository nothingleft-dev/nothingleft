'use client';

import { useState, type KeyboardEvent } from 'react';
import { ChevronDown, GripVertical, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { STATUS_CATEGORIES, type LabelColor, type StatusCategory } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { EmptyState } from '@components/empty-state';
import { FormAlert } from '@components/auth/form-alert';
import { LetterBadge } from '@components/letter-badge';
import { LabelColorPicker } from '@components/label-color-picker';
import { RowsSkeleton } from '@components/skeletons';
import { SettingsSection } from '@components/settings/section';
import { ValueCommand } from '@components/issues/pickers';
import {
  useCreateSchemaValue,
  useDeleteSchemaValue,
  useSchemaValues,
  useUpdateSchemaValue,
} from '@hooks/use-project-schema';
import { isApiError } from '@lib/api/errors';
import type { SchemaTable, SchemaTables } from '@lib/api/project-schema';
import { cn } from '@lib/utils';

const CATEGORY_LABELS: Record<StatusCategory, string> = {
  backlog: 'Backlog',
  unstarted: 'Unstarted',
  started: 'Started',
  done: 'Done',
  cancelled: 'Cancelled',
};

interface TableCopy {
  title: string;
  description: string;
  noun: string;
  placeholder: string;
}

const COPY: Record<SchemaTable, TableCopy> = {
  statuses: {
    title: 'Statuses',
    description:
      'Every issue is in exactly one. Done and Cancelled categories mark an issue resolved. Any status can follow any other.',
    noun: 'status',
    placeholder: 'Add a status',
  },
  priorities: {
    title: 'Priorities',
    description: 'Ordered from most to least urgent. The badge colour follows the priority everywhere it appears.',
    noun: 'priority',
    placeholder: 'Add a priority',
  },
  types: {
    title: 'Issue types',
    description: 'What kind of work an issue is. New issues start as the default type.',
    noun: 'type',
    placeholder: 'Add a type',
  },
  'work-types': {
    title: 'Work types',
    description:
      'The kind of work a time entry records. New entries start as the default. Archived types stay on old entries but cannot be chosen.',
    noun: 'work type',
    placeholder: 'Add a work type',
  },
};

// Every table row, read through the fields any of the four may carry.
interface AnyValue {
  name: string;
  position: number;
  color?: LabelColor;
  short_label?: string;
  category?: StatusCategory;
  is_default?: boolean;
  is_archived?: boolean;
}

type AnyUpdate = SchemaTables[SchemaTable]['update'];

interface SchemaValuesProps {
  projectKey: string;
  table: SchemaTable;
  canEdit: boolean;
  /** Replaces the table's own heading, where the list sits inside another section. */
  heading?: { title: string; description: string };
}

export function SchemaValues({ projectKey, table, canEdit, heading }: SchemaValuesProps) {
  const copy = { ...COPY[table], ...heading };
  const values = useSchemaValues(projectKey, table);
  const update = useUpdateSchemaValue(projectKey, table);
  const remove = useDeleteSchemaValue(projectKey, table);
  const [dragging, setDragging] = useState<string | null>(null);
  const [markOpen, setMarkOpen] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<{ name: string; message?: string; targets?: readonly string[] } | null>(
    null,
  );

  const rows = ((values.data ?? []) as AnyValue[]).toSorted((a, b) => a.position - b.position);

  const patch = (name: string, body: AnyUpdate) =>
    update.mutate({ name, body } as never, { onError: error => toast.error(error.message) });

  const move = (name: string, to: number) => {
    const from = rows.findIndex(r => r.name === name);
    if (from < 0 || to < 0 || to >= rows.length || from === to) return;
    patch(name, { position: to });
  };

  const onDelete = (name: string, moveTo?: string) =>
    remove.mutate(
      { name, moveTo },
      {
        onSuccess: () => {
          setDeleting(null);
          toast.success(moveTo ? `Deleted ${name}; its issues moved to ${moveTo}.` : `Deleted ${name}.`);
        },
        onError: error => {
          if (isApiError(error) && error.code === 'config.in_use') {
            setDeleting({ name, message: error.message, targets: error.validValues ?? [] });
          } else toast.error(error.message);
        },
      },
    );

  const onRowKey = (event: KeyboardEvent, name: string, index: number) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    move(name, index + (event.key === 'ArrowUp' ? -1 : 1));
  };

  return (
    <SettingsSection title={copy.title} description={copy.description}>
      {values.isPending ? (
        <RowsSkeleton rows={5} />
      ) : values.isError ? (
        <FormAlert title={`The ${copy.noun} list could not be loaded.`} />
      ) : rows.length === 0 ? (
        <EmptyState title={`No ${copy.noun} yet.`} description={canEdit ? 'Add the first one below.' : undefined} />
      ) : (
        <ol className="flex flex-col divide-y divide-border-subtle rounded-md border" aria-label={copy.title}>
          {rows.map((row, index) => (
            <li
              key={row.name}
              onKeyDown={canEdit ? e => onRowKey(e, row.name, index) : undefined}
              onDragOver={
                canEdit && dragging
                  ? e => {
                      e.preventDefault();
                      setOverIndex(index);
                    }
                  : undefined
              }
              onDrop={
                canEdit && dragging
                  ? e => {
                      e.preventDefault();
                      move(dragging, index);
                      setDragging(null);
                      setOverIndex(null);
                    }
                  : undefined
              }
              className={cn(
                'flex h-row items-center gap-2 px-2',
                dragging === row.name && 'opacity-50',
                overIndex === index && dragging !== row.name && 'bg-selected',
              )}
            >
              {canEdit ? (
                <button
                  type="button"
                  draggable
                  aria-label={`Reorder ${row.name}. Alt and the arrow keys move it.`}
                  title="Drag to reorder · Alt+↑/↓"
                  onDragStart={e => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', row.name);
                    setDragging(row.name);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setOverIndex(null);
                  }}
                  className="grid size-6 cursor-grab place-items-center rounded-sm text-text-muted hover:bg-hover hover:text-text active:cursor-grabbing"
                >
                  <GripVertical className="size-3.5" />
                </button>
              ) : null}

              <ValueMark
                row={row}
                canEdit={canEdit}
                open={markOpen === row.name}
                onOpenChange={o => setMarkOpen(o ? row.name : null)}
                onChange={body => patch(row.name, body)}
              />
              <ValueName name={row.name} canEdit={canEdit} onRename={name => patch(row.name, { name })} />

              <span className="ml-auto flex items-center gap-2">
                {row.category ? (
                  <CategoryLabel
                    category={row.category}
                    canEdit={canEdit}
                    onChange={c => patch(row.name, { category: c })}
                  />
                ) : null}
                {row.is_default ? (
                  <span className="rounded-xs border px-1.5 text-2xs leading-5 text-text-secondary">Default</span>
                ) : null}
                {row.is_archived ? (
                  <span className="rounded-xs bg-inset px-1.5 text-2xs leading-5 text-text-secondary">Archived</span>
                ) : null}
                {canEdit ? (
                  <RowMenu
                    row={row}
                    first={index === 0}
                    last={index === rows.length - 1}
                    onMove={by => move(row.name, index + by)}
                    onPatch={body => patch(row.name, body)}
                    onDelete={() => setDeleting({ name: row.name })}
                    onEditMark={() => setMarkOpen(row.name)}
                  />
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      )}

      {canEdit ? <AddValue projectKey={projectKey} table={table} placeholder={copy.placeholder} /> : null}
      {!canEdit ? <p className="text-xs text-text-muted">Only a Project Admin can change these.</p> : null}

      {deleting ? (
        <DeleteValueDialog
          key={deleting.targets ? 'move' : 'plain'}
          name={deleting.name}
          message={deleting.message}
          targets={deleting.targets}
          pending={remove.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={target => onDelete(deleting.name, target)}
        />
      ) : null}
    </SettingsSection>
  );
}

function ValueMark({
  row,
  canEdit,
  open,
  onOpenChange,
  onChange,
}: {
  row: AnyValue;
  canEdit: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (body: AnyUpdate) => void;
}) {
  const [letter, setLetter] = useState(row.short_label ?? '');
  if (!row.short_label) return null;
  const noun = row.color ? 'Colour and letter' : 'Letter';

  // Work types carry no colour: a neutral outlined letter.
  const mark = row.color ? (
    <LetterBadge letter={row.short_label} label={row.name} swatch={row.color} />
  ) : (
    <LetterBadge letter={row.short_label} label={row.name} variant="outlined" />
  );

  if (!canEdit) return <span className="grid h-6 place-items-center px-1">{mark}</span>;

  return (
    <Popover
      open={open}
      onOpenChange={next => {
        if (next) setLetter(row.short_label ?? '');
        onOpenChange(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${noun} for ${row.name}`}
          title={`Change ${noun.toLowerCase()}`}
          className="flex h-6 items-center gap-0.5 rounded-sm border border-transparent pr-0.5 pl-1 text-text-muted hover:border-border hover:bg-hover hover:text-text data-[state=open]:border-border"
        >
          {mark}
          <ChevronDown className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-auto flex-col gap-3 p-3">
        {row.color ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Colour</span>
            <LabelColorPicker value={row.color} onChange={color => onChange({ color })} />
          </div>
        ) : null}
        <form
          noValidate
          className="flex items-end gap-2"
          onSubmit={e => {
            e.preventDefault();
            const next = letter.trim();
            if (next.length === 1 && next !== row.short_label) onChange({ short_label: next });
          }}
        >
          <label className="flex flex-col gap-1.5 text-xs font-medium text-text-secondary">
            Letter
            <input
              value={letter}
              onChange={e => setLetter(e.target.value.slice(-1))}
              className="h-control w-12 rounded-md border border-border-strong bg-surface text-center font-mono text-sm text-text"
            />
          </label>
          <Button type="submit" size="sm" variant="outline" disabled={letter.trim().length !== 1}>
            Set letter
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function ValueName({ name, canEdit, onRename }: { name: string; canEdit: boolean; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    return canEdit ? (
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
    );
  }

  const commit = () => {
    const next = draft.trim();
    setDraft(null);
    if (next && next !== name) onRename(next);
  };

  return (
    <input
      autoFocus
      aria-label={`Rename ${name}`}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(null);
      }}
      className="h-control-sm min-w-0 rounded-sm border border-border-strong bg-surface px-1 text-sm text-text"
    />
  );
}

function CategoryLabel({
  category,
  canEdit,
  onChange,
}: {
  category: StatusCategory;
  canEdit: boolean;
  onChange: (category: StatusCategory) => void;
}) {
  if (!canEdit) return <span className="text-xs text-text-secondary">{CATEGORY_LABELS[category]}</span>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="xs" className="font-normal text-text-secondary" aria-label="Category">
          {CATEGORY_LABELS[category]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={category} onValueChange={v => onChange(v as StatusCategory)}>
          {STATUS_CATEGORIES.map(c => (
            <DropdownMenuRadioItem key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface RowMenuProps {
  row: AnyValue;
  first: boolean;
  last: boolean;
  onMove: (by: number) => void;
  onPatch: (body: AnyUpdate) => void;
  onDelete: () => void;
  onEditMark: () => void;
}

function RowMenu({ row, first, last, onMove, onPatch, onDelete, onEditMark }: RowMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${row.name}`} className="text-text-secondary">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {/* Deferred a tick so the menu's focus return does not immediately close the popover. */}
        <DropdownMenuItem onSelect={() => window.setTimeout(onEditMark, 0)}>
          {row.color ? 'Change colour' : 'Change letter'}
        </DropdownMenuItem>
        {row.is_default === false ? (
          <DropdownMenuItem onSelect={() => onPatch({ is_default: true })}>Make default</DropdownMenuItem>
        ) : null}
        {row.is_archived !== undefined ? (
          <DropdownMenuItem
            disabled={row.is_default === true && !row.is_archived}
            onSelect={() => onPatch({ is_archived: !row.is_archived })}
          >
            {row.is_archived ? 'Unarchive' : 'Archive'}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Move</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem disabled={first} onSelect={() => onMove(-1)}>
              Up <span className="ml-auto text-2xs text-text-muted">Alt ↑</span>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={last} onSelect={() => onMove(1)}>
              Down <span className="ml-auto text-2xs text-text-muted">Alt ↓</span>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled={row.is_default === true} onSelect={onDelete}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AddValue({ projectKey, table, placeholder }: { projectKey: string; table: SchemaTable; placeholder: string }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<StatusCategory>('unstarted');
  const [error, setError] = useState<string | null>(null);
  const create = useCreateSchemaValue(projectKey, table);

  return (
    <form
      noValidate
      className="flex flex-col gap-1.5"
      onSubmit={e => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        const body = table === 'statuses' ? { name: trimmed, category } : { name: trimmed };
        create.mutate(body as never, {
          onSuccess: () => {
            setName('');
            setError(null);
          },
          onError: err => setError(err.message),
        });
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label={placeholder}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          className="h-control min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-text-muted sm:max-w-xs"
        />
        {table === 'statuses' ? <CategoryLabel category={category} canEdit onChange={setCategory} /> : null}
        <Button type="submit" variant="outline" size="sm" disabled={!name.trim() || create.isPending}>
          Add
        </Button>
      </div>
      {error ? <p className="text-xs text-danger-fg">{error}</p> : null}
    </form>
  );
}

export interface DeleteValueDialogProps {
  name: string;
  /** Present once the API answered `config.in_use`: the count, and where the issues may go. */
  message?: string;
  targets?: readonly string[];
  pending: boolean;
  onCancel: () => void;
  onConfirm: (target?: string) => void;
  /** What moves when the value goes: `issues`, or `time entries` for a work item attribute. */
  movedNoun?: string;
}

export function DeleteValueDialog({
  name,
  message,
  targets,
  pending,
  onCancel,
  onConfirm,
  movedNoun = 'issues',
}: DeleteValueDialogProps) {
  const [target, setTarget] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const mustMove = targets !== undefined;

  return (
    <Dialog open onOpenChange={o => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {name}?</DialogTitle>
          <DialogDescription>
            {message ??
              `It is removed from this project for good. If any ${movedNoun} use it, you will be asked where to move them.`}
          </DialogDescription>
        </DialogHeader>
        {mustMove ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Move its {movedNoun} to</span>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start font-normal">
                  {target ?? <span className="text-text-muted">Choose where they go</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
                <ValueCommand
                  placeholder="Find a value"
                  selected={target}
                  options={targets.map(t => ({ name: t }))}
                  onSelect={t => {
                    setTarget(t);
                    setOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
            {movedNoun === 'issues' ? (
              <p className="text-xs text-text-secondary">Each moved issue records the change in its history.</p>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={(mustMove && !target) || pending}
            onClick={() => onConfirm(mustMove ? (target ?? undefined) : undefined)}
          >
            {pending ? 'Deleting…' : mustMove ? `Delete and move ${movedNoun}` : `Delete ${name}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
