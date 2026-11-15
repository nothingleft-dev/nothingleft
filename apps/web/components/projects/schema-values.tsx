'use client';

import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown, ChevronsUpDown, MoreHorizontal } from 'lucide-react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@components/popover';
import { EmptyState } from '@components/empty-state';
import { LoadError, errorDetail } from '@components/query-state';
import { LetterBadge } from '@components/letter-badge';
import { LabelColorPicker } from '@components/label-color-picker';
import { Skeleton } from '@components/ui/skeleton';
import { SettingsSection } from '@components/settings/section';
import { ValueCommand } from '@components/issues/pickers';
import {
  InlineRename,
  MarkFrame,
  ReorderGrip,
  RowChip,
  archivedLast,
  listHeaderClass,
  markButtonClass,
  nameColumnClass,
  rowCellClass,
} from '@components/projects/value-row';
import {
  useCreateSchemaValue,
  useDeleteSchemaValue,
  useRenameSchemaValue,
  useSchemaValues,
  useUpdateSchemaValue,
} from '@hooks/use-project-schema';
import { isApiError } from '@lib/api/errors';
import type { SchemaTable, SchemaTables } from '@lib/api/project-schema';
import { cn } from '@lib/utils';
import { toastError } from '@components/toast-error';
import { PendingButton } from '@components/pending-button';

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
  plural: string;
  /** The column caption over the names. */
  column: string;
  placeholder: string;
  /** What an empty list suggests adding. */
  start: string;
}

const COPY: Record<SchemaTable, TableCopy> = {
  statuses: {
    title: 'Statuses',
    description:
      'Every issue is in exactly one. Done and Cancelled categories mark an issue resolved. Any status can follow any other.',
    noun: 'status',
    plural: 'statuses',
    column: 'Status',
    placeholder: 'Add a status',
    start: 'Add them in the order work moves, for example Todo, In Progress, Done.',
  },
  priorities: {
    title: 'Priorities',
    description: 'Ordered from most to least urgent. The badge colour follows the priority everywhere it appears.',
    noun: 'priority',
    plural: 'priorities',
    column: 'Priority',
    placeholder: 'Add a priority',
    start: 'Add them from most to least urgent, for example Urgent, High, Medium, Low.',
  },
  types: {
    title: 'Issue types',
    description: 'What kind of work an issue is. New issues start as the default type.',
    noun: 'type',
    plural: 'types',
    column: 'Type',
    placeholder: 'Add a type',
    start: 'Add the kinds of work this project tracks, for example Bug, Feature, Task.',
  },
  'work-types': {
    title: 'Work types',
    description:
      'The kind of work a time entry records. New entries start as the default. Archived types stay on old entries but cannot be chosen.',
    noun: 'work type',
    plural: 'work types',
    column: 'Work type',
    placeholder: 'Add a work type',
    start: 'Add the kinds of work time is logged against, for example Development, Review.',
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
  const rename = useRenameSchemaValue(projectKey, table);
  const remove = useDeleteSchemaValue(projectKey, table);
  const [dragging, setDragging] = useState<string | null>(null);
  const [markOpen, setMarkOpen] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<{ name: string; message?: string; targets?: readonly string[] } | null>(
    null,
  );

  const order = archivedLast((values.data ?? []) as AnyValue[]);
  const rows = order.shown;
  const byName = new Map(rows.map(r => [r.name, r]));
  const statuses = table === 'statuses';

  const patch = (name: string, body: AnyUpdate) =>
    update.mutate({ name, body } as never, { onError: error => toastError(`Could not update ${name}`, error) });

  const move = (name: string, to: number) => {
    const from = order.live.findIndex(r => r.name === name);
    const target = order.live[to];
    if (from < 0 || !target || from === to) return;
    patch(name, { position: order.positionOf(target) });
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
          } else toastError(`Could not delete ${name}`, error);
        },
      },
    );

  const onRowKey = (event: KeyboardEvent, name: string, index: number) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    move(name, index + (event.key === 'ArrowUp' ? -1 : 1));
  };

  const addForm = <AddValue projectKey={projectKey} table={table} placeholder={copy.placeholder} />;

  return (
    <SettingsSection title={copy.title} description={copy.description}>
      {values.isPending ? (
        <ValuesSkeleton category={statuses} canEdit={canEdit} />
      ) : values.isError && !values.data ? (
        <LoadError onRetry={() => void values.refetch()} detail={errorDetail(values.error)}>
          {`The ${copy.noun} list could not be loaded.`}
        </LoadError>
      ) : rows.length === 0 ? (
        <EmptyState
          title={`No ${copy.plural} yet.`}
          description={canEdit ? copy.start : `A Project Admin can add ${copy.plural}.`}
        />
      ) : (
        <div className="flex flex-col rounded-md border">
          {statuses ? (
            <div aria-hidden className={listHeaderClass}>
              <span className={cn('flex-none', canEdit ? 'w-[4.5rem]' : 'w-10')} />
              <span className={cn(nameColumnClass, 'px-1')}>{copy.column}</span>
              <span className="w-24 flex-none pl-1.5 sm:w-28">Category</span>
            </div>
          ) : null}
          <ol className="flex flex-col divide-y divide-border-subtle" aria-label={copy.title}>
            {rows.map((row, index) => {
              const live = !row.is_archived;
              const chip = row.is_default ? (
                <RowChip>Default</RowChip>
              ) : row.is_archived ? (
                <RowChip>Archived</RowChip>
              ) : null;
              return (
                <li
                  key={row.name}
                  onKeyDown={canEdit && live ? e => onRowKey(e, row.name, index) : undefined}
                  onDragOver={
                    canEdit && live && dragging
                      ? e => {
                          e.preventDefault();
                          setOverIndex(index);
                        }
                      : undefined
                  }
                  onDrop={
                    canEdit && live && dragging
                      ? e => {
                          e.preventDefault();
                          move(dragging, index);
                          setDragging(null);
                          setOverIndex(null);
                        }
                      : undefined
                  }
                  className={cn(
                    'flex min-h-row items-start gap-2 px-2',
                    dragging === row.name && 'bg-inset',
                    overIndex === index && dragging !== row.name && 'bg-selected',
                    row.is_archived && 'text-text-secondary',
                  )}
                >
                  {canEdit ? (
                    <span className={cn(rowCellClass, 'max-sm:hidden')}>
                      <ReorderGrip
                        name={live ? row.name : null}
                        onDragStart={() => setDragging(row.name)}
                        onDragEnd={() => {
                          setDragging(null);
                          setOverIndex(null);
                        }}
                      />
                    </span>
                  ) : null}

                  <span className={cn(rowCellClass, 'w-10')}>
                    <ValueMark
                      row={row}
                      canEdit={canEdit}
                      open={markOpen === row.name}
                      onOpenChange={o => setMarkOpen(o ? row.name : null)}
                      onChange={body => patch(row.name, body)}
                    />
                  </span>
                  <span className={cn(nameColumnClass, 'gap-2')}>
                    <InlineRename
                      name={row.name}
                      canEdit={canEdit}
                      onRename={to => rename.mutateAsync({ name: row.name, to })}
                    />
                    {chip ? <span className={cn(rowCellClass, 'sm:hidden')}>{chip}</span> : null}
                  </span>

                  {statuses ? (
                    <span className={cn(rowCellClass, 'w-24 sm:w-28')}>
                      {row.category ? (
                        <CategoryLabel
                          category={row.category}
                          canEdit={canEdit}
                          label={`${row.name} category`}
                          onChange={c => patch(row.name, { category: c })}
                        />
                      ) : null}
                    </span>
                  ) : null}
                  <span className={cn(rowCellClass, 'w-18 max-sm:hidden')}>{chip}</span>
                  {canEdit ? (
                    <span className={cn(rowCellClass, 'ml-auto')}>
                      <RowMenu
                        row={row}
                        first={index === 0}
                        last={index === order.live.length - 1}
                        onMove={by => move(row.name, index + by)}
                        onPatch={body => patch(row.name, body)}
                        onDelete={() => setDeleting({ name: row.name })}
                        onEditMark={() => setMarkOpen(row.name)}
                      />
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {canEdit && !values.isPending && !(values.isError && !values.data) ? addForm : null}

      {deleting ? (
        <DeleteValueDialog
          key={deleting.targets ? 'move' : 'plain'}
          name={deleting.name}
          message={deleting.message}
          targets={deleting.targets}
          valueNoun={copy.noun}
          markOf={name => {
            const row = byName.get(name);
            return row ? <PlainMark row={row} /> : null;
          }}
          pending={remove.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={target => onDelete(deleting.name, target)}
        />
      ) : null}
    </SettingsSection>
  );
}

const SKELETON_NAMES = [128, 184, 104, 216, 152];

/** The list before it loads, on the rows' own columns, with the add row under it. */
function ValuesSkeleton({ category, canEdit }: { category: boolean; canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="flex flex-col rounded-md border">
        {category ? (
          <div className={listHeaderClass}>
            <span className={cn('flex-none', canEdit ? 'w-[4.5rem]' : 'w-10')} />
            <Skeleton className="h-3 w-12" />
          </div>
        ) : null}
        <div className="flex flex-col divide-y divide-border-subtle">
          {SKELETON_NAMES.map((width, i) => (
            <div key={i} className="flex h-row items-center gap-2 px-2">
              {canEdit ? <span className="size-6 flex-none" /> : null}
              <span className={cn(rowCellClass, 'w-10 pl-1')}>
                <Skeleton className="size-badge-letter rounded-xs" />
              </span>
              <span className={cn(nameColumnClass, 'px-1')}>
                <Skeleton className="h-3.5" style={{ width }} />
              </span>
              {category ? (
                <span className="w-24 flex-none pl-1.5 sm:w-28">
                  <Skeleton className="h-3 w-[5.5rem]" />
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      {canEdit ? (
        <div className="flex items-center gap-2">
          <Skeleton className="h-control w-full rounded-md sm:max-w-xs" />
          {category ? <Skeleton className="h-control w-32 flex-none rounded-md" /> : null}
          <Skeleton className="h-control w-22 flex-none rounded-md" />
        </div>
      ) : null}
    </div>
  );
}

// Work types carry no colour: a neutral outlined letter.
function PlainMark({ row }: { row: AnyValue }) {
  if (!row.short_label) return null;
  return row.color ? (
    <LetterBadge letter={row.short_label} label={row.name} swatch={row.color} />
  ) : (
    <LetterBadge letter={row.short_label} label={row.name} variant="outlined" />
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

  if (!canEdit)
    return (
      <span className="grid h-6 flex-none place-items-center px-1">
        <PlainMark row={row} />
      </span>
    );

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
          className={markButtonClass}
        >
          <MarkFrame>
            <PlainMark row={row} />
          </MarkFrame>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-auto flex-col gap-3 p-3">
        {row.color ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-secondary">Colour</span>
            <LabelColorPicker value={row.color} onChange={color => onChange({ color })} />
          </div>
        ) : null}
        <LetterForm
          value={letter}
          onChange={setLetter}
          onSubmit={next => {
            if (next !== row.short_label) onChange({ short_label: next });
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** The one-letter badge editor, shared by every value list. */
export function LetterForm({
  value,
  onChange,
  onSubmit,
  autoFocus,
}: {
  value: string;
  onChange: (letter: string) => void;
  onSubmit: (letter: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <form
      noValidate
      className="flex items-end gap-2"
      onSubmit={e => {
        e.preventDefault();
        const next = value.trim();
        if (next.length === 1) onSubmit(next);
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium text-text-secondary">
        Letter
        <input
          autoFocus={autoFocus}
          value={value}
          onChange={e => onChange(e.target.value.slice(-1))}
          className="h-control w-12 rounded-md border border-border-strong bg-surface text-center font-mono text-sm text-text"
        />
      </label>
      <Button type="submit" size="sm" variant="outline" disabled={value.trim().length !== 1}>
        Set letter
      </Button>
    </form>
  );
}

function CategoryLabel({
  category,
  canEdit,
  label,
  onChange,
  variant = 'row',
}: {
  category: StatusCategory;
  canEdit: boolean;
  label: string;
  onChange: (category: StatusCategory) => void;
  /** `field` is the add form's picker: a bordered control at input height. */
  variant?: 'row' | 'field';
}) {
  if (!canEdit) return <span className="px-1.5 text-xs text-text-secondary">{CATEGORY_LABELS[category]}</span>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === 'field' ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`${label}: ${CATEGORY_LABELS[category]}`}
            className="h-control w-32 justify-between bg-surface font-normal dark:bg-surface"
          >
            {CATEGORY_LABELS[category]}
            <ChevronsUpDown className="text-text-secondary" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-label={`${label}: ${CATEGORY_LABELS[category]}`}
            className="font-normal text-text-secondary"
          >
            {CATEGORY_LABELS[category]}
            <ChevronDown className="text-text-muted" />
          </Button>
        )}
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
        {row.is_archived ? null : (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Move</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem disabled={first} onSelect={() => onMove(-1)}>
                Up <span className="ml-auto text-2xs text-text-secondary">Alt ↑</span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={last} onSelect={() => onMove(1)}>
                Down <span className="ml-auto text-2xs text-text-secondary">Alt ↓</span>
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
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
      className="flex w-full flex-col gap-1.5"
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
          onChange={e => {
            setName(e.target.value);
            setError(null);
          }}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          className="h-control min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-text-muted aria-invalid:border-danger-fg max-sm:basis-full sm:max-w-xs"
        />
        {table === 'statuses' ? (
          <CategoryLabel
            category={category}
            canEdit
            variant="field"
            label="New status category"
            onChange={setCategory}
          />
        ) : null}
        <PendingButton
          type="submit"
          variant="outline"
          size="sm"
          className="h-control"
          disabled={!name.trim()}
          pending={create.isPending}
          pendingLabel="Adding…"
        >
          Add
        </PendingButton>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-danger-fg">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export interface DeleteValueDialogProps {
  name: string;
  /** Present once the API answered that the value is in use: the count, and where its uses may go. */
  message?: string;
  targets?: readonly string[];
  /** The badge beside each target in the picker. */
  markOf?: (name: string) => ReactNode;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (target?: string) => void;
  /** Offered beside the delete once the value is in use, where archiving keeps it on what has it. */
  onArchive?: () => void;
  /** What moves when the value goes: `issues`, or `time entries` for a work item attribute. */
  movedNoun?: string;
  /** What the targets are, for the picker's search: `status`, `option`. */
  valueNoun?: string;
}

export function DeleteValueDialog({
  name,
  message,
  targets,
  markOf,
  pending,
  onCancel,
  onConfirm,
  onArchive,
  movedNoun = 'issues',
  valueNoun = 'value',
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
            <span className="text-sm font-medium text-text-secondary">Move its {movedNoun} to</span>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  role="combobox"
                  aria-expanded={open}
                  className="justify-start border-border-strong bg-surface font-normal dark:bg-surface"
                >
                  {target ? (
                    <>
                      {markOf?.(target)}
                      <span className="truncate">{target}</span>
                    </>
                  ) : (
                    <span className="text-text-secondary">Choose where they go</span>
                  )}
                  <ChevronsUpDown className="ml-auto text-text-secondary" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
                <ValueCommand
                  placeholder={`Find a ${valueNoun}`}
                  selected={target}
                  options={targets.map(t => ({ name: t, mark: markOf?.(t) }))}
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
          {mustMove && onArchive ? (
            <Button variant="outline" disabled={pending} onClick={onArchive} className="sm:mr-auto">
              Archive instead
            </Button>
          ) : null}
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <PendingButton
            variant="destructive"
            disabled={mustMove && !target}
            onClick={() => onConfirm(mustMove ? (target ?? undefined) : undefined)}
            pending={pending}
            pendingLabel="Deleting…"
          >
            {mustMove ? `Delete and move ${movedNoun}` : `Delete ${name}`}
          </PendingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
