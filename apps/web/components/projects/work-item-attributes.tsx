'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import { GripVertical, MoreHorizontal, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { WORK_ITEM_ATTRIBUTES_MAX, type WorkItemAttribute, type WorkItemAttributeValue } from '@nothingleft/types';
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
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { FormAlert } from '@components/auth/form-alert';
import { ConfirmDialog } from '@components/confirm-dialog';
import { LetterBadge } from '@components/letter-badge';
import { RowsSkeleton } from '@components/skeletons';
import { SettingsSection } from '@components/settings/section';
import { DeleteValueDialog, SchemaValues } from '@components/projects/schema-values';
import { useApiError } from '@hooks/use-api-error';
import { useSchemaValues } from '@hooks/use-project-schema';
import {
  useCreateWorkItemAttribute,
  useCreateWorkItemAttributeValue,
  useDeleteWorkItemAttribute,
  useDeleteWorkItemAttributeValue,
  useUpdateWorkItemAttribute,
  useUpdateWorkItemAttributeValue,
  useWorkItemAttributes,
} from '@hooks/use-work-item-attributes';
import { isApiError } from '@lib/api/errors';
import { cn } from '@lib/utils';

const WORK_TYPE = '\u0000work-type';

const summary = (names: readonly string[]) =>
  names.length === 0
    ? 'No values yet'
    : names.length <= 2
      ? names.join(', ')
      : `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;

interface WorkItemAttributesProps {
  projectKey: string;
  canEdit: boolean;
  readOnlyReason: string;
}

/** Work type (built in) and the project's own attributes: a table, and the chosen one's values beside it. */
export function WorkItemAttributes({ projectKey, canEdit, readOnlyReason }: WorkItemAttributesProps) {
  const attributes = useWorkItemAttributes(projectKey);
  const workTypes = useSchemaValues(projectKey, 'work-types');
  const update = useUpdateWorkItemAttribute(projectKey);
  const [selected, setSelected] = useState<string>(WORK_TYPE);
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const rows = (attributes.data ?? []).toSorted((a, b) => a.position - b.position);
  const chosen = rows.find(r => r.name === selected) ?? null;
  const atCap = rows.length >= WORK_ITEM_ATTRIBUTES_MAX;

  const move = (name: string, to: number) => {
    if (to < 0 || to >= rows.length) return;
    update.mutate({ name, body: { position: to } }, { onError: e => toast.error(e.message) });
  };

  const onRowKey = (event: KeyboardEvent, name: string, index: number) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    move(name, index + (event.key === 'ArrowUp' ? -1 : 1));
  };

  const rowClass = (active: boolean) =>
    cn(
      'grid h-row cursor-pointer grid-cols-[24px_minmax(0,1fr)_minmax(0,1.3fr)] items-center gap-2 px-2 text-sm hover:bg-hover',
      active && 'bg-selected hover:bg-selected',
    );

  return (
    <SettingsSection
      title="Work item attributes"
      description="What someone picks when they log time. Work type is built in; add your own, such as Billable, each with its values and a one-letter badge. Attributes are not searched."
      actions={
        canEdit ? (
          <Button
            size="sm"
            variant="outline"
            disabled={atCap}
            onClick={() => setAdding(true)}
            title={atCap ? `${WORK_ITEM_ATTRIBUTES_MAX} attributes is the limit.` : undefined}
          >
            <Plus /> Add attribute
          </Button>
        ) : null
      }
    >
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col rounded-md border" role="table" aria-label="Work item attributes">
          <div
            role="row"
            className="grid h-row-dense grid-cols-[24px_minmax(0,1fr)_minmax(0,1.3fr)] items-center gap-2 border-b px-2 text-2xs font-medium text-text-muted"
          >
            <span />
            <span role="columnheader">Attribute</span>
            <span role="columnheader">Values</span>
          </div>
          <div
            role="row"
            tabIndex={0}
            onClick={() => setSelected(WORK_TYPE)}
            onKeyDown={e => e.key === 'Enter' && setSelected(WORK_TYPE)}
            className={rowClass(selected === WORK_TYPE)}
          >
            <span />
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">Work type</span>
              <span className="rounded-xs border px-1.5 text-2xs leading-5 text-text-secondary">Built in</span>
            </span>
            <span className="truncate text-text-secondary">
              {summary((workTypes.data ?? []).filter(t => !t.is_archived).map(t => t.name))}
            </span>
          </div>
          {attributes.isPending ? (
            <div className="p-2">
              <RowsSkeleton rows={2} />
            </div>
          ) : (
            rows.map((attribute, index) => (
              <div
                key={attribute.name}
                role="row"
                tabIndex={0}
                onClick={() => setSelected(attribute.name)}
                onKeyDown={e => {
                  if (e.key === 'Enter') setSelected(attribute.name);
                  if (canEdit) onRowKey(e, attribute.name, index);
                }}
                onDragOver={
                  canEdit && dragging
                    ? e => {
                        e.preventDefault();
                        setOver(index);
                      }
                    : undefined
                }
                onDrop={
                  canEdit && dragging
                    ? e => {
                        e.preventDefault();
                        if (dragging !== attribute.name) move(dragging, index);
                        setDragging(null);
                        setOver(null);
                      }
                    : undefined
                }
                className={cn(
                  rowClass(selected === attribute.name),
                  'border-t border-border-subtle',
                  dragging === attribute.name && 'opacity-50',
                  over === index && dragging !== attribute.name && 'bg-selected',
                  attribute.is_archived && 'text-text-secondary',
                )}
              >
                {canEdit ? (
                  <button
                    type="button"
                    draggable
                    aria-label={`Reorder ${attribute.name}. Alt and the arrow keys move it.`}
                    title="Drag to reorder · Alt+↑/↓"
                    onClick={e => e.stopPropagation()}
                    onDragStart={e => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', attribute.name);
                      setDragging(attribute.name);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    className="grid size-6 cursor-grab place-items-center rounded-sm text-text-muted hover:bg-hover hover:text-text active:cursor-grabbing"
                  >
                    <GripVertical className="size-3.5" />
                  </button>
                ) : (
                  <span />
                )}
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{attribute.name}</span>
                  {attribute.is_archived ? (
                    <span className="rounded-xs bg-inset px-1.5 text-2xs leading-5 text-text-secondary">Archived</span>
                  ) : null}
                </span>
                <span className="truncate text-text-secondary">
                  {summary(attribute.values.filter(v => !v.is_archived).map(v => v.name))}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="rounded-md border p-4">
          {selected === WORK_TYPE || !chosen ? (
            <SchemaValues
              projectKey={projectKey}
              table="work-types"
              canEdit={canEdit}
              heading={{
                title: 'Work type',
                description: 'Built in: you can change its values, but not remove it from the project.',
              }}
            />
          ) : (
            <AttributePanel
              key={chosen.name}
              projectKey={projectKey}
              attribute={chosen}
              canEdit={canEdit}
              onRenamed={setSelected}
              onDeleted={() => setSelected(WORK_TYPE)}
            />
          )}
        </div>
      </div>

      {!canEdit ? <p className="text-xs text-text-muted">{readOnlyReason}</p> : null}

      {adding ? (
        <AddAttributeDialog
          projectKey={projectKey}
          onClose={created => {
            setAdding(false);
            if (created) setSelected(created);
          }}
        />
      ) : null}
    </SettingsSection>
  );
}

function AttributePanel({
  projectKey,
  attribute,
  canEdit,
  onRenamed,
  onDeleted,
}: {
  projectKey: string;
  attribute: WorkItemAttribute;
  canEdit: boolean;
  onRenamed: (name: string) => void;
  onDeleted: () => void;
}) {
  const update = useUpdateWorkItemAttribute(projectKey);
  const remove = useDeleteWorkItemAttribute(projectKey);
  const updateValue = useUpdateWorkItemAttributeValue(projectKey);
  const createValue = useCreateWorkItemAttributeValue(projectKey);
  const deleteValue = useDeleteWorkItemAttributeValue(projectKey);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ name: string; message?: string; targets?: readonly string[] } | null>(
    null,
  );
  const values = attribute.values.toSorted((a, b) => a.position - b.position);
  const fail = (e: Error) => setError(e.message);
  const ok = () => setError(null);

  const patchValue = (value: string, body: Parameters<typeof updateValue.mutate>[0]['body']) =>
    updateValue.mutate({ name: attribute.name, value, body }, { onSuccess: ok, onError: fail });

  const moveValue = (value: string, to: number) => {
    if (to < 0 || to >= values.length) return;
    patchValue(value, { position: to });
  };

  const onDeleteValue = (value: string, moveTo?: string) =>
    deleteValue.mutate(
      { name: attribute.name, value, moveTo },
      {
        onSuccess: () => {
          setDeleting(null);
          ok();
          toast.success(moveTo ? `Deleted ${value}; its time entries moved to ${moveTo}.` : `Deleted ${value}.`);
        },
        onError: e => {
          if (isApiError(e) && e.code === 'work_item_attribute.value_in_use') {
            setDeleting({ name: value, message: e.message, targets: e.validValues ?? [] });
          } else fail(e);
        },
      },
    );

  const commitRename = () => {
    const next = renaming?.trim();
    setRenaming(null);
    if (!next || next === attribute.name) return;
    update.mutate(
      { name: attribute.name, body: { name: next } },
      { onSuccess: a => (ok(), onRenamed(a.name)), onError: fail },
    );
  };

  const add = () => {
    const name = draft.trim();
    if (!name) return;
    createValue.mutate(
      { name: attribute.name, body: { name } },
      { onSuccess: () => (ok(), setDraft('')), onError: fail },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-start gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          {renaming !== null ? (
            <input
              autoFocus
              aria-label={`Rename ${attribute.name}`}
              value={renaming}
              onChange={e => setRenaming(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setRenaming(null);
              }}
              className="h-control-sm rounded-sm border border-border-strong bg-surface px-1 font-medium text-text"
            />
          ) : canEdit ? (
            <button
              type="button"
              title="Click to rename"
              onClick={() => setRenaming(attribute.name)}
              className="-ml-1 truncate rounded-sm px-1 text-left font-medium hover:bg-hover"
            >
              {attribute.name}
            </button>
          ) : (
            <h3 className="font-medium">{attribute.name}</h3>
          )}
          <p className="text-sm text-text-secondary">
            {attribute.is_archived
              ? 'Archived: it stays on the entries that have it, but nobody can pick it.'
              : 'Picked for each time entry. Archived values stay on old entries but cannot be chosen.'}
          </p>
        </div>
        {canEdit ? (
          <div className="ml-auto flex flex-none items-center gap-1">
            <Button
              variant="outline"
              size="xs"
              onClick={() =>
                update.mutate(
                  { name: attribute.name, body: { is_archived: !attribute.is_archived } },
                  { onSuccess: ok, onError: fail },
                )
              }
            >
              {attribute.is_archived ? 'Unarchive' : 'Archive'}
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className="text-danger-fg hover:text-danger-fg"
              onClick={() => setConfirming(true)}
            >
              Delete
            </Button>
          </div>
        ) : null}
      </header>

      {error ? <FormAlert title={error} /> : null}

      <ol
        className="flex flex-col divide-y divide-border-subtle rounded-md border"
        aria-label={`${attribute.name} values`}
      >
        {values.length === 0 ? (
          <li className="px-3 py-2 text-sm text-text-secondary">No values yet. Add the first below.</li>
        ) : null}
        {values.map((value, index) => (
          <li
            key={value.name}
            onKeyDown={
              canEdit
                ? e => {
                    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
                    e.preventDefault();
                    moveValue(value.name, index + (e.key === 'ArrowUp' ? -1 : 1));
                  }
                : undefined
            }
            onDragOver={canEdit && dragging ? e => e.preventDefault() : undefined}
            onDrop={
              canEdit && dragging
                ? e => {
                    e.preventDefault();
                    if (dragging !== value.name) moveValue(dragging, index);
                    setDragging(null);
                  }
                : undefined
            }
            className={cn(
              'flex h-row items-center gap-2 px-2',
              dragging === value.name && 'opacity-50',
              value.is_archived && 'text-text-secondary',
            )}
          >
            {canEdit ? (
              <button
                type="button"
                draggable
                aria-label={`Reorder ${value.name}. Alt and the arrow keys move it.`}
                title="Drag to reorder · Alt+↑/↓"
                onDragStart={e => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', value.name);
                  setDragging(value.name);
                }}
                onDragEnd={() => setDragging(null)}
                className="grid size-6 cursor-grab place-items-center rounded-sm text-text-muted hover:bg-hover hover:text-text active:cursor-grabbing"
              >
                <GripVertical className="size-3.5" />
              </button>
            ) : null}
            <ValueLetter
              value={value}
              canEdit={canEdit}
              onChange={short_label => patchValue(value.name, { short_label })}
            />
            <ValueName name={value.name} canEdit={canEdit} onRename={name => patchValue(value.name, { name })} />
            <span className="ml-auto flex items-center gap-2">
              {value.is_archived ? (
                <span className="rounded-xs bg-inset px-1.5 text-2xs leading-5 text-text-secondary">Archived</span>
              ) : null}
              {canEdit ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Actions for ${value.name}`}
                      className="text-text-secondary"
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onSelect={() => patchValue(value.name, { is_archived: !value.is_archived })}>
                      {value.is_archived ? 'Unarchive' : 'Archive'}
                    </DropdownMenuItem>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Move</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuItem disabled={index === 0} onSelect={() => moveValue(value.name, index - 1)}>
                          Up <span className="ml-auto text-2xs text-text-muted">Alt ↑</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={index === values.length - 1}
                          onSelect={() => moveValue(value.name, index + 1)}
                        >
                          Down <span className="ml-auto text-2xs text-text-muted">Alt ↓</span>
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => window.setTimeout(() => setDeleting({ name: value.name }), 0)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </span>
          </li>
        ))}
      </ol>

      {canEdit ? (
        <form
          noValidate
          className="flex items-center gap-2"
          onSubmit={e => {
            e.preventDefault();
            add();
          }}
        >
          <input
            aria-label="Add a value"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Add a value"
            className="h-control min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-text-muted"
          />
          <Button type="submit" variant="outline" size="sm" disabled={!draft.trim() || createValue.isPending}>
            Add
          </Button>
        </form>
      ) : null}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${attribute.name}?`}
        confirmLabel="Delete attribute"
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(attribute.name, {
            onSuccess: () => {
              toast.success(`Deleted ${attribute.name}.`);
              setConfirming(false);
              onDeleted();
            },
            onError: e => toast.error(e.message),
          })
        }
      >
        <p>It is removed from every time entry that has it. What was logged stays in each issue’s history.</p>
        <p>To keep it on old entries but stop people picking it, archive it instead.</p>
      </ConfirmDialog>

      {deleting ? (
        <DeleteValueDialog
          key={deleting.targets ? 'move' : 'plain'}
          name={deleting.name}
          message={deleting.message}
          targets={deleting.targets}
          movedNoun="time entries"
          pending={deleteValue.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={target => onDeleteValue(deleting.name, target)}
        />
      ) : null}
    </div>
  );
}

function ValueLetter({
  value,
  canEdit,
  onChange,
}: {
  value: WorkItemAttributeValue;
  canEdit: boolean;
  onChange: (letter: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [letter, setLetter] = useState(value.short_label);
  const badge = <LetterBadge letter={value.short_label} label={value.name} variant="outlined" />;
  if (!canEdit) return <span className="grid h-6 place-items-center px-1">{badge}</span>;
  return (
    <Popover
      open={open}
      onOpenChange={next => {
        if (next) setLetter(value.short_label);
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Letter for ${value.name}`}
          title="Change letter"
          className="grid h-6 place-items-center rounded-sm border border-transparent px-1 hover:border-border hover:bg-hover"
        >
          {badge}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <form
          noValidate
          className="flex items-end gap-2"
          onSubmit={e => {
            e.preventDefault();
            const next = letter.trim();
            if (next.length === 1 && next !== value.short_label) onChange(next);
            setOpen(false);
          }}
        >
          <label className="flex flex-col gap-1.5 text-xs font-medium text-text-secondary">
            Letter
            <input
              autoFocus
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

function AddAttributeDialog({ projectKey, onClose }: { projectKey: string; onClose: (created?: string) => void }) {
  const ids = { name: useId(), values: useId() };
  const [name, setName] = useState('');
  const [values, setValues] = useState('');
  const create = useCreateWorkItemAttribute(projectKey);
  const error = useApiError(create.error);
  const list = values
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={e => {
            e.preventDefault();
            if (!name.trim()) return;
            create.mutate(
              { name: name.trim(), ...(list.length ? { values: list.map(v => ({ name: v })) } : {}) },
              { onSuccess: a => (toast.success(`Added ${a.name}.`), onClose(a.name)) },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>New work item attribute</DialogTitle>
            <DialogDescription>
              Picked for every time entry, beside Work type. Each value gets its first letter as a badge; change it
              afterwards.
            </DialogDescription>
          </DialogHeader>
          {error.summary ? <FormAlert title={error.summary} /> : null}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.name} className="text-sm font-medium text-text-secondary">
              Name
            </label>
            <input
              id={ids.name}
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Billable"
              aria-invalid={Boolean(error.fields['name'])}
              className="h-control rounded-md border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-text-muted aria-invalid:border-danger-fg"
            />
            {error.fields['name'] ? <p className="text-xs text-danger-fg">{error.fields['name']}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.values} className="text-sm font-medium text-text-secondary">
              Values
            </label>
            <input
              id={ids.values}
              value={values}
              onChange={e => setValues(e.target.value)}
              placeholder="Yes, No"
              className="h-control rounded-md border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-text-muted"
            />
            <p className="text-xs text-text-secondary">Separated by commas. You can add more later.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onClose()}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {create.isPending ? 'Adding…' : 'Add attribute'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
