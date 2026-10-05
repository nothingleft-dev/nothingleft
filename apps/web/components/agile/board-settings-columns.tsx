'use client';

import { useState, type KeyboardEvent } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, ChevronDown, GripVertical, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  BOARD_COLUMNS_MAX,
  BOARD_COLUMN_FIELDS,
  BOARD_WIP_MAX,
  RESOLVED_STATUS_CATEGORIES,
  type Board,
  type BoardColumn,
  type BoardColumnField,
  type BoardColumnInput,
  type BoardValueRef,
} from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Checkbox } from '@components/ui/checkbox';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { ConfirmDialog } from '@components/confirm-dialog';
import { SettingsSection } from '@components/settings/section';
import { StatusDot } from '@components/issues/value-marks';
import { useUpdateBoard } from '@hooks/use-boards';
import { cn } from '@lib/utils';

export const COLUMN_FIELD_LABELS: Record<BoardColumnField, string> = {
  status: 'Status',
  priority: 'Priority',
  type: 'Type',
};

const toInput = (c: BoardColumn): BoardColumnInput => ({
  name: c.name,
  values: c.values.map(v => v.name),
  wip_min: c.wip_min,
  wip_max: c.wip_max,
  collapsed_by_default: c.collapsed_by_default,
});

const withResolved = (c: BoardColumn, field: BoardColumnField): BoardColumn => ({
  ...c,
  resolved:
    field === 'status' &&
    c.values.length > 0 &&
    c.values.every(v => v.category !== null && RESOLVED_STATUS_CATEGORIES.includes(v.category)),
});

const freeName = (wanted: string, columns: readonly BoardColumn[]) => {
  const taken = new Set(columns.map(c => c.name.toLowerCase()));
  let name = wanted;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${wanted} ${n}`;
  return name;
};

const newColumn = (name: string, value: BoardValueRef): BoardColumn => ({
  name,
  values: [value],
  wip_min: null,
  wip_max: null,
  collapsed_by_default: false,
  resolved: false,
});

interface BoardColumnsEditorProps {
  projectKey: string;
  board: Board;
  canEdit: boolean;
}

export function BoardColumnsEditor({ projectKey, board, canEdit }: BoardColumnsEditorProps) {
  const update = useUpdateBoard(projectKey);
  const [switchTo, setSwitchTo] = useState<BoardColumnField | null>(null);
  const field = board.column_field;
  const columns = board.columns;
  const unmapped = board.unmapped_values;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const save = (next: BoardColumn[], onError?: (message: string) => void) => {
    const all = [...columns.flatMap(c => c.values), ...unmapped];
    const mapped = new Set(next.flatMap(c => c.values.map(v => v.name)));
    const columnsNext = next.map(c => withResolved(c, field));
    update.mutate(
      {
        slug: board.slug,
        body: { columns: columnsNext.map(toInput) },
        optimistic: b => ({ ...b, columns: columnsNext, unmapped_values: all.filter(v => !mapped.has(v.name)) }),
      },
      { onError: error => (onError ? onError(error.message) : toast.error(error.message)) },
    );
  };

  const change = (index: number, patch: Partial<BoardColumn>, onError?: (message: string) => void) =>
    save(
      columns.map((c, i) => (i === index ? { ...c, ...patch } : c)),
      onError,
    );

  const move = (from: number, to: number) => {
    if (to < 0 || to >= columns.length || from === to) return;
    save(arrayMove(columns, from, to));
  };

  const mergeInto = (index: number, other: number) => {
    const target = columns[index]!;
    const source = columns[other]!;
    save(
      columns
        .map((c, i) => (i === index ? { ...c, values: [...target.values, ...source.values] } : c))
        .filter((_, i) => i !== other),
    );
  };

  // Splitting a value out of a merged column puts it back as a column of its own, right after.
  const split = (index: number, value: BoardValueRef) => {
    const column = columns[index]!;
    const rest = { ...column, values: column.values.filter(v => v.name !== value.name) };
    const next = [...columns];
    next.splice(index, 1, rest, newColumn(freeName(value.name, columns), value));
    save(next);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    move(
      columns.findIndex(c => c.name === active.id),
      columns.findIndex(c => c.name === over.id),
    );
  };

  const switchField = (next: BoardColumnField) =>
    update.mutate(
      { slug: board.slug, body: { column_field: next } },
      {
        onSuccess: () => {
          toast.success(`Columns are now one per ${COLUMN_FIELD_LABELS[next].toLowerCase()}.`);
          setSwitchTo(null);
        },
        onError: error => toast.error(error.message),
      },
    );

  return (
    <SettingsSection
      title="Columns"
      description="Left to right. Moving a card to a column sets that value on the issue; WIP limits warn, they never stop a move."
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sm">
          <span>
            <b className="font-semibold">Columns</b> are identified by
          </span>
          <FieldPicker value={field} disabled={!canEdit} onPick={f => f !== field && setSwitchTo(f)} />
        </div>

        <div role="table" aria-label={`Columns of ${board.name}`} className="flex flex-col">
          <div
            role="row"
            className="grid grid-cols-[48px_minmax(0,1fr)_88px_88px_88px_120px_32px] items-end gap-x-3 border-b pb-1.5 text-xs font-medium text-text-secondary"
          >
            <span role="columnheader" aria-label="Order" />
            <span role="columnheader">Column</span>
            <span role="columnheader">Min WIP</span>
            <span role="columnheader">Max WIP</span>
            <span role="columnheader" className="text-center">
              Collapsed
            </span>
            <span role="columnheader" aria-label="Merge" />
            <span role="columnheader" aria-label="Delete" />
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={columns.map(c => c.name)} strategy={verticalListSortingStrategy}>
              {columns.map((column, index) => (
                <ColumnRow
                  key={column.name}
                  index={index}
                  column={column}
                  columns={columns}
                  field={field}
                  canEdit={canEdit}
                  onRename={(name, onError) => change(index, { name }, onError)}
                  onWip={(patch, onError) => change(index, patch, onError)}
                  onCollapsed={collapsed_by_default => change(index, { collapsed_by_default })}
                  onMerge={other => mergeInto(index, other)}
                  onSplit={value => split(index, value)}
                  onDelete={() => save(columns.filter((_, i) => i !== index))}
                  onMove={to => move(index, to)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {canEdit ? (
            <AddColumn
              values={unmapped}
              disabled={columns.length >= BOARD_COLUMNS_MAX}
              onAdd={value => save([...columns, newColumn(freeName(value.name, columns), value)])}
            />
          ) : null}
          {unmapped.length > 0 ? (
            <p className="text-xs text-text-secondary">
              On no column, so their cards are hidden: {unmapped.map(v => v.name).join(', ')}.
            </p>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={switchTo !== null}
        onOpenChange={open => !open && setSwitchTo(null)}
        title={`Make columns ${switchTo ? COLUMN_FIELD_LABELS[switchTo].toLowerCase() : ''} values?`}
        confirmLabel="Rebuild columns"
        destructive={false}
        pending={update.isPending}
        onConfirm={() => switchTo && switchField(switchTo)}
      >
        <p>
          The board gets one column per {switchTo ? COLUMN_FIELD_LABELS[switchTo].toLowerCase() : 'value'}, in the
          project&rsquo;s order. The current columns, their names and WIP limits are replaced.
        </p>
        <p>Moving a card will then change its {switchTo ? COLUMN_FIELD_LABELS[switchTo].toLowerCase() : 'value'}.</p>
      </ConfirmDialog>
    </SettingsSection>
  );
}

function FieldPicker({
  value,
  disabled,
  onPick,
}: {
  value: BoardColumnField;
  disabled: boolean;
  onPick: (field: BoardColumnField) => void;
}) {
  const [open, setOpen] = useState(false);
  if (disabled) return <b className="font-semibold">{COLUMN_FIELD_LABELS[value]}</b>;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="min-w-40 justify-between" aria-label="Columns are identified by">
          {COLUMN_FIELD_LABELS[value]}
          <ChevronDown className="text-text-muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <Command>
          <CommandList>
            {BOARD_COLUMN_FIELDS.map(f => (
              <CommandItem
                key={f}
                value={f}
                onSelect={() => {
                  setOpen(false);
                  onPick(f);
                }}
              >
                <span className="flex-1">{COLUMN_FIELD_LABELS[f]}</span>
                <Check className={cn('size-icon-sm', f === value ? 'opacity-100' : 'opacity-0')} />
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ValueMark({ value }: { value: BoardValueRef }) {
  return value.category ? (
    <StatusDot category={value.category} color={value.color} />
  ) : (
    <i aria-hidden className={`l-${value.color} inline-block size-2 flex-none rounded-full bg-c-solid`} />
  );
}

interface ColumnRowProps {
  index: number;
  column: BoardColumn;
  columns: readonly BoardColumn[];
  field: BoardColumnField;
  canEdit: boolean;
  onRename: (name: string, onError: (message: string) => void) => void;
  onWip: (patch: Pick<BoardColumn, 'wip_min'> | Pick<BoardColumn, 'wip_max'>, onError: (m: string) => void) => void;
  onCollapsed: (collapsed: boolean) => void;
  onMerge: (other: number) => void;
  onSplit: (value: BoardValueRef) => void;
  onDelete: () => void;
  onMove: (to: number) => void;
}

function ColumnRow({
  index,
  column,
  columns,
  canEdit,
  onRename,
  onWip,
  onCollapsed,
  onMerge,
  onSplit,
  onDelete,
  onMove,
}: ColumnRowProps) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners, setActivatorNodeRef } = useSortable({
    id: column.name,
    disabled: !canEdit,
  });
  const [error, setError] = useState<string | null>(null);
  const merged = column.values.length > 1 || column.values[0]?.name !== column.name;

  const onGripKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!e.altKey) return;
    const to = e.key === 'ArrowUp' ? index - 1 : e.key === 'ArrowDown' ? index + 1 : null;
    if (to === null) return;
    e.preventDefault();
    onMove(to);
    // React moves the row's node, and a moved node loses focus.
    requestAnimationFrame(() => document.getElementById(`column-grip-${to}`)?.focus());
  };

  return (
    <div
      ref={setNodeRef}
      role="row"
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'group/row grid min-h-12 grid-cols-[48px_minmax(0,1fr)_88px_88px_88px_120px_32px] items-center gap-x-3 border-b bg-surface py-1.5 text-sm',
        isDragging && 'relative z-10 shadow-md',
      )}
    >
      <span role="cell" className="flex items-center gap-1 text-text-muted">
        {canEdit ? (
          <button
            id={`column-grip-${index}`}
            ref={setActivatorNodeRef}
            type="button"
            aria-label={`Move ${column.name}; Alt and the arrow keys move it too`}
            className="grid size-6 cursor-grab place-items-center rounded-sm hover:bg-hover hover:text-text active:cursor-grabbing"
            {...attributes}
            {...listeners}
            onKeyDown={e => {
              onGripKey(e);
              if (!e.defaultPrevented) listeners?.onKeyDown?.(e);
            }}
          >
            <GripVertical className="size-4" />
          </button>
        ) : null}
        <span className="tabular">{index + 1}</span>
      </span>

      <span role="cell" className="flex min-w-0 flex-col gap-1">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <ColumnName name={column.name} canEdit={canEdit} onRename={name => onRename(name, setError)} />
          {column.resolved ? (
            <span className="rounded-xs border px-1.5 text-2xs leading-[18px] font-medium text-text-secondary">
              resolved
            </span>
          ) : null}
          {merged ? (
            <span className="flex flex-wrap items-center gap-1">
              {column.values.map(value => (
                <span
                  key={value.name}
                  className="inline-flex h-6 items-center gap-1.5 rounded-sm bg-inset px-1.5 text-xs text-text-secondary"
                >
                  <ValueMark value={value} />
                  {value.name}
                  {canEdit && column.values.length > 1 ? (
                    <button
                      type="button"
                      aria-label={`Split ${value.name} into its own column`}
                      title="Split into its own column"
                      className="-mr-0.5 grid size-4 place-items-center rounded-xs text-text-muted hover:bg-hover hover:text-text"
                      onClick={() => onSplit(value)}
                    >
                      <X className="size-3" />
                    </button>
                  ) : null}
                </span>
              ))}
            </span>
          ) : null}
        </span>
        {error ? <span className="text-xs text-danger-fg">{error}</span> : null}
      </span>

      <span role="cell">
        <WipInput
          label={`Min WIP for ${column.name}`}
          value={column.wip_min}
          canEdit={canEdit}
          onSave={wip_min => {
            setError(null);
            onWip({ wip_min }, setError);
          }}
        />
      </span>
      <span role="cell">
        <WipInput
          label={`Max WIP for ${column.name}`}
          value={column.wip_max}
          canEdit={canEdit}
          onSave={wip_max => {
            setError(null);
            onWip({ wip_max }, setError);
          }}
        />
      </span>
      <span role="cell" className="flex justify-center">
        <Checkbox
          checked={column.collapsed_by_default}
          disabled={!canEdit}
          onCheckedChange={v => onCollapsed(v === true)}
          aria-label={`Collapse ${column.name} by default`}
        />
      </span>
      <span role="cell">
        {canEdit && columns.length > 1 ? <MergeWith columns={columns} index={index} onMerge={onMerge} /> : null}
      </span>
      <span role="cell">
        {canEdit ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${column.name}`}
                  disabled={columns.length <= 1}
                  onClick={onDelete}
                  className="text-text-secondary"
                >
                  <X />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {columns.length <= 1 ? 'A board needs at least one column' : 'Delete column; Add column brings it back'}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </span>
    </div>
  );
}

function ColumnName({ name, canEdit, onRename }: { name: string; canEdit: boolean; onRename: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(name);

  if (editing) {
    return (
      <form
        noValidate
        onSubmit={e => {
          e.preventDefault();
          const trimmed = text.trim();
          setEditing(false);
          if (trimmed && trimmed !== name) onRename(trimmed);
        }}
      >
        <input
          autoFocus
          value={text}
          aria-label="Column name"
          onChange={e => setText(e.target.value)}
          onBlur={e => e.currentTarget.form?.requestSubmit()}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              setText(name);
              setEditing(false);
            }
          }}
          className="h-8 w-56 rounded-md border border-border-strong bg-surface px-2 text-sm text-text"
        />
      </form>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="truncate font-medium">{name}</span>
      {canEdit ? (
        <button
          type="button"
          aria-label={`Rename ${name}`}
          onClick={() => {
            setText(name);
            setEditing(true);
          }}
          className="grid size-7 place-items-center rounded-sm text-text-muted hover:bg-hover hover:text-text"
        >
          <Pencil className="size-3.5" />
        </button>
      ) : null}
    </span>
  );
}

function WipInput({
  label,
  value,
  canEdit,
  onSave,
}: {
  label: string;
  value: number | null;
  canEdit: boolean;
  onSave: (value: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value === null ? '' : String(value));
  }
  const trimmed = text.trim();
  const parsed = /^\d{1,3}$/.test(trimmed) ? Number(trimmed) : null;
  const invalid = trimmed !== '' && (parsed === null || parsed < 1 || parsed > BOARD_WIP_MAX);

  if (!canEdit) {
    return <span className="text-sm tabular text-text-secondary">{value ?? 'No'}</span>;
  }

  const commit = () => {
    if (invalid) return;
    const next = trimmed === '' ? null : parsed;
    if (next !== value) onSave(next);
  };

  return (
    <input
      aria-label={label}
      inputMode="numeric"
      value={text}
      placeholder="No"
      aria-invalid={invalid}
      title={invalid ? `A whole number from 1 to ${BOARD_WIP_MAX}, or empty for none` : undefined}
      onChange={e => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') commit();
      }}
      className="h-8 w-full rounded-md border border-border-strong bg-surface px-2 text-sm tabular text-text placeholder:text-text-muted aria-invalid:border-danger-fg"
    />
  );
}

function MergeWith({
  columns,
  index,
  onMerge,
}: {
  columns: readonly BoardColumn[];
  index: number;
  onMerge: (other: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="text-text-secondary">
          Merge with
          <ChevronDown className="text-text-muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-0">
        <Command>
          <CommandInput placeholder="Filter columns" />
          <CommandList>
            <CommandEmpty>No other column matches.</CommandEmpty>
            {columns.map((c, i) =>
              i === index ? null : (
                <CommandItem
                  key={c.name}
                  value={c.name}
                  onSelect={() => {
                    setOpen(false);
                    onMerge(i);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="text-2xs text-text-muted">{c.values.map(v => v.name).join(', ')}</span>
                </CommandItem>
              ),
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function AddColumn({
  values,
  disabled,
  onAdd,
}: {
  values: readonly BoardValueRef[];
  disabled: boolean;
  onAdd: (value: BoardValueRef) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled || values.length === 0}>
          Add column
          <ChevronDown className="text-text-muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-0">
        <Command>
          <CommandInput placeholder="Filter values" />
          <CommandList>
            <CommandEmpty>Every value is on a column.</CommandEmpty>
            {values.map(value => (
              <CommandItem
                key={value.name}
                value={value.name}
                onSelect={() => {
                  setOpen(false);
                  onAdd(value);
                }}
              >
                <ValueMark value={value} />
                <span className="flex-1 truncate">{value.name}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
