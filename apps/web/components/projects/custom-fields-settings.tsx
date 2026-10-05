'use client';

import { useState, type KeyboardEvent } from 'react';
import { GripVertical, MoreHorizontal, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { CUSTOM_FIELDS_MAX, type CustomField } from '@nothingleft/types';
import { Button } from '@components/ui/button';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { ConfirmDialog } from '@components/confirm-dialog';
import { EmptyState } from '@components/empty-state';
import { FormAlert } from '@components/auth/form-alert';
import { RowsSkeleton } from '@components/skeletons';
import { SettingsSection } from '@components/settings/section';
import { CustomFieldDialog, DeleteConsequences } from '@components/projects/custom-field-dialog';
import { FIELD_TYPE_META, hasOptions } from '@components/custom-fields/field-types';
import { useCustomFields, useDeleteCustomField, useUpdateCustomField } from '@hooks/use-custom-fields';
import { cn } from '@lib/utils';

interface CustomFieldsSettingsProps {
  projectKey: string;
  canEdit: boolean;
  readOnlyReason: string;
}

export function CustomFieldsSettings({ projectKey, canEdit, readOnlyReason }: CustomFieldsSettingsProps) {
  const fields = useCustomFields(projectKey);
  const update = useUpdateCustomField(projectKey);
  const remove = useDeleteCustomField(projectKey);
  const [editing, setEditing] = useState<CustomField | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CustomField | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const all = (fields.data ?? []).toSorted((a, b) => a.position - b.position);
  const live = all.filter(f => !f.is_archived);
  const archived = all.filter(f => f.is_archived);
  const atCap = live.length >= CUSTOM_FIELDS_MAX;

  const patch = (field: CustomField, body: Parameters<typeof update.mutate>[0]['body'], done?: string) =>
    update.mutate(
      { slug: field.slug, body },
      { onSuccess: () => done && toast.success(done), onError: e => toast.error(e.message) },
    );

  // Positions are across every field, archived included, so a move names the target's own position.
  const move = (field: CustomField, to: number) => {
    const target = live[to];
    if (!target || target.slug === field.slug) return;
    patch(field, { position: all.indexOf(target) });
  };

  const onRowKey = (event: KeyboardEvent, field: CustomField, index: number) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    move(field, index + (event.key === 'ArrowUp' ? -1 : 1));
  };

  const newButton = canEdit ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button size="sm" disabled={atCap} onClick={() => setEditing('new')}>
            <Plus /> New field
          </Button>
        </span>
      </TooltipTrigger>
      {atCap ? (
        <TooltipContent>
          {CUSTOM_FIELDS_MAX} active fields is the limit. Archive or delete one to add another.
        </TooltipContent>
      ) : null}
    </Tooltip>
  ) : null;

  return (
    <SettingsSection
      title="Custom fields"
      description="Your own information on this project’s issues. Each field shows in the sidebar in this order, and search uses its slug."
      actions={
        <>
          {fields.data ? (
            <span className={cn('text-xs tabular', atCap ? 'font-medium text-warning-fg' : 'text-text-muted')}>
              {live.length} of {CUSTOM_FIELDS_MAX} active
            </span>
          ) : null}
          {newButton}
        </>
      }
    >
      {atCap && canEdit ? (
        <p className="rounded-md bg-warning-bg px-3 py-2 text-xs text-warning-fg">
          This project has {CUSTOM_FIELDS_MAX} active fields, the most it can hold. Archive or delete one to add
          another; archived fields do not count.
        </p>
      ) : null}

      {fields.isPending ? (
        <RowsSkeleton rows={5} />
      ) : fields.isError ? (
        <FormAlert title="The fields could not be loaded." />
      ) : all.length === 0 ? (
        <EmptyState
          title="No custom fields yet."
          description={
            canEdit
              ? 'Add one for what this project needs to record: a severity, the customer affected, a launch date, a reviewer.'
              : 'A Project Admin can add fields for what this project needs to record.'
          }
          action={
            canEdit ? (
              <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
                <Plus /> New field
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {live.length > 0 ? (
            <ol className="flex flex-col divide-y divide-border-subtle rounded-md border" aria-label="Custom fields">
              {live.map((field, index) => (
                <li
                  key={field.slug}
                  onKeyDown={canEdit ? e => onRowKey(e, field, index) : undefined}
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
                          const moving = live.find(f => f.slug === dragging);
                          if (moving) move(moving, index);
                          setDragging(null);
                          setOver(null);
                        }
                      : undefined
                  }
                  className={cn(
                    'flex h-row items-center gap-2 px-2',
                    dragging === field.slug && 'opacity-50',
                    over === index && dragging !== field.slug && 'bg-selected',
                  )}
                >
                  {canEdit ? (
                    <button
                      type="button"
                      draggable
                      aria-label={`Reorder ${field.name}. Alt and the arrow keys move it.`}
                      title="Drag to reorder · Alt+↑/↓"
                      onDragStart={e => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', field.slug);
                        setDragging(field.slug);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                      className="grid size-6 flex-none cursor-grab place-items-center rounded-sm text-text-muted hover:bg-hover hover:text-text active:cursor-grabbing"
                    >
                      <GripVertical className="size-3.5" />
                    </button>
                  ) : null}
                  <FieldRow
                    field={field}
                    canEdit={canEdit}
                    onOpen={() => setEditing(field)}
                    menu={
                      canEdit ? (
                        <FieldMenu
                          field={field}
                          first={index === 0}
                          last={index === live.length - 1}
                          onEdit={() => setEditing(field)}
                          onMove={by => move(field, index + by)}
                          onArchive={() =>
                            patch(field, { is_archived: true }, `Archived ${field.name}. Its values are kept.`)
                          }
                          onDelete={() => setDeleting(field)}
                        />
                      ) : null
                    }
                  />
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-text-secondary">Every field is archived.</p>
          )}

          {archived.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-text-secondary">
                Archived <span className="font-normal text-text-muted">{archived.length}</span>
              </h3>
              <p className="text-xs text-text-secondary">
                Hidden from issues and pickers, still searchable, values kept. They do not count toward the{' '}
                {CUSTOM_FIELDS_MAX}.
              </p>
              <ol
                className="flex flex-col divide-y divide-border-subtle rounded-md border"
                aria-label="Archived fields"
              >
                {archived.map(field => (
                  <li key={field.slug} className="flex h-row items-center gap-2 px-2 text-text-secondary">
                    <FieldRow
                      field={field}
                      canEdit={canEdit}
                      onOpen={() => setEditing(field)}
                      menu={
                        canEdit ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`Actions for ${field.name}`}
                                className="text-text-secondary"
                              >
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                disabled={atCap}
                                onSelect={() =>
                                  patch(field, { is_archived: false }, `${field.name} is back on issues.`)
                                }
                              >
                                Unarchive
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(field)}>
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null
                      }
                    />
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </>
      )}

      {!canEdit ? <p className="text-xs text-text-muted">{readOnlyReason}</p> : null}

      {editing ? (
        <CustomFieldDialog
          key={editing === 'new' ? 'new' : editing.slug}
          projectKey={projectKey}
          field={editing === 'new' ? undefined : (all.find(f => f.slug === editing.slug) ?? editing)}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={open => (open ? null : setDeleting(null))}
        title={`Delete ${deleting?.name ?? ''}?`}
        confirmLabel="Delete field"
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.slug, {
            onSuccess: f => {
              toast.success(`Deleted ${f.name}.`);
              setDeleting(null);
            },
            onError: e => toast.error(e.message),
          });
        }}
      >
        {deleting ? <DeleteConsequences field={deleting} /> : null}
      </ConfirmDialog>
    </SettingsSection>
  );
}

function FieldRow({
  field,
  canEdit,
  onOpen,
  menu,
}: {
  field: CustomField;
  canEdit: boolean;
  onOpen: () => void;
  menu: React.ReactNode;
}) {
  const meta = FIELD_TYPE_META[field.type];
  const scope = field.applies_to.length === 0 ? 'All types' : field.applies_to.join(', ');
  const optionCount = hasOptions(field.type) ? field.options.filter(o => !o.is_archived).length : null;
  const name = canEdit ? (
    <button
      type="button"
      onClick={onOpen}
      title="Edit field"
      className="min-w-0 truncate rounded-sm px-1 text-left text-sm font-medium text-text hover:bg-hover"
    >
      {field.name}
    </button>
  ) : (
    <span className="min-w-0 truncate px-1 text-sm font-medium text-text">{field.name}</span>
  );

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="grid size-6 flex-none place-items-center text-text-secondary">
            <meta.icon className="size-3.5" aria-label={meta.label} />
          </span>
        </TooltipTrigger>
        <TooltipContent>{meta.label}</TooltipContent>
      </Tooltip>
      {name}
      <span className="flex-none font-mono text-2xs text-text-muted">{field.slug}</span>
      <span className="ml-auto flex min-w-0 items-center gap-3 text-xs text-text-secondary">
        {field.time_role ? (
          <span className="rounded-xs border px-1.5 text-2xs leading-5">
            {field.time_role === 'estimation' ? 'Estimation' : 'Spent time'}
          </span>
        ) : null}
        {field.is_required ? <span className="rounded-xs border px-1.5 text-2xs leading-5">Required</span> : null}
        <span className="w-24 flex-none truncate max-md:hidden">{meta.label}</span>
        <span className="w-32 flex-none truncate max-lg:hidden" title={scope}>
          {scope}
        </span>
        <span className="w-20 flex-none text-right tabular text-text-muted max-md:hidden">
          {optionCount !== null
            ? `${optionCount} ${optionCount === 1 ? 'option' : 'options'}`
            : `${field.issue_count} ${field.issue_count === 1 ? 'issue' : 'issues'}`}
        </span>
        <span className="w-6 flex-none">{menu}</span>
      </span>
    </>
  );
}

function FieldMenu({
  field,
  first,
  last,
  onEdit,
  onMove,
  onArchive,
  onDelete,
}: {
  field: CustomField;
  first: boolean;
  last: boolean;
  onEdit: () => void;
  onMove: (by: number) => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${field.name}`} className="text-text-secondary">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => window.setTimeout(onEdit, 0)}>Edit</DropdownMenuItem>
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
        <DropdownMenuItem disabled={field.time_role !== null} onSelect={onArchive}>
          {field.time_role ? 'Archive (used for time tracking)' : 'Archive'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => window.setTimeout(onDelete, 0)}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
