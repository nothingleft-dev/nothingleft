'use client';

import { useState, type KeyboardEvent } from 'react';
import { MoreHorizontal, Plus } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { ConfirmDialog } from '@components/confirm-dialog';
import { EmptyState } from '@components/empty-state';
import { LoadError, errorDetail } from '@components/query-state';
import { RowsSkeleton } from '@components/skeletons';
import { SettingsSection } from '@components/settings/section';
import { CustomFieldDialog, DeleteConsequences } from '@components/projects/custom-field-dialog';
import { FIELD_TYPE_META, hasOptions } from '@components/custom-fields/field-types';
import { useCustomFields, useDeleteCustomField, useUpdateCustomField } from '@hooks/use-custom-fields';
import { ReorderGrip, RowChip } from '@components/projects/value-row';
import { cn } from '@lib/utils';
import { toastError } from '@components/toast-error';
import { plural } from '@lib/numbers';

interface CustomFieldsSettingsProps {
  projectKey: string;
  canEdit: boolean;
}

export function CustomFieldsSettings({ projectKey, canEdit }: CustomFieldsSettingsProps) {
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
      { onSuccess: () => done && toast.success(done), onError: e => toastError(`Could not update ${field.name}`, e) },
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

  const newButton =
    canEdit && all.length > 0 ? (
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
            <span className={cn('text-xs tabular', atCap ? 'font-medium text-warning-fg' : 'text-text-secondary')}>
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
      ) : fields.isError && !fields.data ? (
        <LoadError onRetry={() => void fields.refetch()} detail={errorDetail(fields.error)}>
          The fields could not be loaded.
        </LoadError>
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
              <Button size="sm" onClick={() => setEditing('new')}>
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
                    dragging === field.slug && 'bg-inset',
                    over === index && dragging !== field.slug && 'bg-selected',
                  )}
                >
                  {canEdit ? (
                    <ReorderGrip
                      name={field.name}
                      onDragStart={() => setDragging(field.slug)}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                    />
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
            <div className="flex flex-col gap-2 pt-3">
              <div className="flex flex-col gap-0.5">
                <h3 className="text-sm font-semibold">
                  Archived <span className="font-normal text-text-secondary tabular">{archived.length}</span>
                </h3>
                <p className="text-sm text-text-secondary">
                  Hidden from issues and pickers, still searchable, values kept. They do not count toward the{' '}
                  {CUSTOM_FIELDS_MAX}.
                </p>
              </div>
              <ol
                className="flex flex-col divide-y divide-border-subtle rounded-md border"
                aria-label="Archived fields"
              >
                {archived.map(field => (
                  <li key={field.slug} className="flex h-row items-center gap-2 px-2 text-text-secondary">
                    {canEdit ? <ReorderGrip name={null} /> : null}
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
        pendingLabel="Deleting…"
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.slug, {
            onSuccess: f => {
              toast.success(`Deleted ${f.name}.`);
              setDeleting(null);
            },
            onError: e => toastError(`Could not delete ${deleting.name}`, e),
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
  const ink = field.is_archived ? 'text-text-secondary' : 'text-text';
  const name = canEdit ? (
    <button
      type="button"
      onClick={onOpen}
      title="Edit field"
      className={cn('min-w-0 truncate rounded-sm px-1 text-left text-sm hover:bg-hover', ink)}
    >
      {field.name}
    </button>
  ) : (
    <span className={cn('min-w-0 truncate px-1 text-sm', ink)}>{field.name}</span>
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
      <span className="flex-none font-mono text-2xs text-text-secondary max-sm:hidden">{field.slug}</span>
      <span className="ml-auto flex min-w-0 flex-none items-center gap-3 text-xs text-text-secondary">
        <span className="flex gap-1.5">
          {field.time_role ? <RowChip>{field.time_role === 'estimation' ? 'Estimation' : 'Spent time'}</RowChip> : null}
          {field.is_required ? <RowChip>Required</RowChip> : null}
        </span>
        <span className="w-40 flex-none truncate max-md:hidden">
          {meta.label}
          {optionCount !== null ? <span className="tabular"> · {plural(optionCount, 'option')}</span> : null}
        </span>
        <span className="w-32 flex-none truncate max-lg:hidden" title={scope}>
          {scope}
        </span>
        <span className="w-20 flex-none text-right tabular max-md:hidden">{plural(field.issue_count, 'issue')}</span>
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
              Up <span className="ml-auto text-2xs text-text-secondary">Alt ↑</span>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={last} onSelect={() => onMove(1)}>
              Down <span className="ml-auto text-2xs text-text-secondary">Alt ↓</span>
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
