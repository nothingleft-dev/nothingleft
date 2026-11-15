'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronsUpDown, MoreHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import { customFieldSlug, isCustomFieldSlug } from '@nothingleft/format';
import {
  CUSTOM_FIELD_DECIMALS_MAX,
  type CreateCustomField,
  type CustomField,
  type CustomFieldOption,
  type CustomFieldType,
  type CustomFieldValueInput,
  type LabelColor,
  type UpdateCustomField,
} from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { CommandEmpty, CommandGroup, CommandInput, CommandList } from '@components/ui/command';
import { PickerCommand, PickerItem } from '@components/picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/dialog';
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
import { Popover, PopoverContent, PopoverTrigger } from '@components/popover';
import { Switch } from '@components/ui/switch';
import { FormAlert } from '@components/auth/form-alert';
import { ConfirmDialog } from '@components/confirm-dialog';
import { DialogBody } from '@components/dialog-body';
import { LabelColorPicker } from '@components/label-color-picker';
import { TypeBadge } from '@components/issues/value-marks';
import { DeleteValueDialog } from '@components/projects/schema-values';
import {
  InlineRename,
  MarkFrame,
  ReorderGrip,
  RowChip,
  archivedLast,
  markButtonClass,
  nameColumnClass,
  rowCellClass,
} from '@components/projects/value-row';
import { FieldValue } from '@components/custom-fields/field-value';
import { FieldEditor } from '@components/custom-fields/field-editors';
import {
  FIELD_TYPE_GROUPS,
  FIELD_TYPE_META,
  emptyLabelOf,
  hasOptions,
  hasRange,
} from '@components/custom-fields/field-types';
import { useApiError } from '@hooks/use-api-error';
import {
  useCreateCustomField,
  useCreateCustomFieldOption,
  useDeleteCustomField,
  useDeleteCustomFieldOption,
  useUpdateCustomField,
  useUpdateCustomFieldOption,
} from '@hooks/use-custom-fields';
import { useProjectAssignees } from '@hooks/use-projects';
import { useSchemaValues } from '@hooks/use-project-schema';
import { useWorkCalendar } from '@hooks/use-work-calendar';
import { isApiError } from '@lib/api/errors';
import { cn } from '@lib/utils';
import { toastError } from '@components/toast-error';
import { PendingButton } from '@components/pending-button';
import { plural } from '@lib/numbers';

const OPTION_COLORS: readonly LabelColor[] = [
  'blue-2',
  'green-2',
  'yellow-2',
  'red-2',
  'teal-2',
  'orange-2',
  'pink-2',
  'gray-2',
];

const inputClass =
  'h-control w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-text-muted aria-invalid:border-danger-fg';

// Pickers sit at an input's height and inset, on the same fill and edge, so a column of fields lines up.
const triggerClass =
  'w-full justify-start border-border-strong bg-surface px-3 font-normal has-[>svg]:px-3 dark:bg-surface';

interface CustomFieldDialogProps {
  projectKey: string;
  /** Absent creates a field. */
  field?: CustomField;
  onClose: () => void;
}

export function CustomFieldDialog({ projectKey, field, onClose }: CustomFieldDialogProps) {
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="gap-0 p-0 sm:max-w-xl">
        <FieldForm projectKey={projectKey} field={field} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  /** Takes the hint's place while it shows: the two would say the same thing twice. */
  error?: string | null;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-text-secondary">
        {label}
      </label>
      {children}
      {error ? <FieldError message={error} /> : hint ? <div className="text-xs text-text-secondary">{hint}</div> : null}
    </div>
  );
}

/** A value that can no longer change, shown as text at a control's height rather than as a disabled input. */
function Fixed({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('flex h-control min-w-0 items-center gap-2 text-sm', className)}>{children}</span>;
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="text-xs text-danger-fg">
      {message}
    </p>
  ) : null;
}

const numberText = (n: number | undefined) => (n === undefined ? '' : String(n));
const parseNumber = (text: string) => (text.trim() === '' ? undefined : Number(text.trim()));

interface DraftOption {
  name: string;
  color: LabelColor;
  is_archived: boolean;
}

function FieldForm({ projectKey, field, onClose }: CustomFieldDialogProps) {
  const ids = {
    name: useId(),
    slug: useId(),
    empty: useId(),
    min: useId(),
    max: useId(),
    decimals: useId(),
    range: useId(),
  };
  const editing = field !== undefined;
  const [name, setName] = useState(field?.name ?? '');
  const [type, setType] = useState<CustomFieldType | null>(field?.type ?? null);
  const [slug, setSlug] = useState('');
  const [slugLeft, setSlugLeft] = useState(false);
  const [appliesTo, setAppliesTo] = useState<string[]>(field?.applies_to ?? []);
  const [required, setRequired] = useState(field?.is_required ?? false);
  const [defaultValue, setDefaultValue] = useState<CustomFieldValueInput>(field?.default_value ?? null);
  const [emptyLabel, setEmptyLabel] = useState(field?.empty_label ?? '');
  const [min, setMin] = useState(numberText(field?.config.min));
  const [max, setMax] = useState(numberText(field?.config.max));
  const [decimals, setDecimals] = useState(numberText(field?.config.decimals));
  const [draftOptions, setDraftOptions] = useState<DraftOption[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const create = useCreateCustomField(projectKey);
  const update = useUpdateCustomField(projectKey);
  const remove = useDeleteCustomField(projectKey);
  const mutation = editing ? update : create;
  const error = useApiError(mutation.error, [
    'name',
    'slug',
    'applies_to',
    'config',
    'default_value',
    'empty_label',
    'is_required',
  ]);

  const generatedSlug = customFieldSlug(name);
  const options: CustomFieldOption[] = editing
    ? field.options
    : draftOptions.map((o, position) => ({ ...o, position }));

  const config = {
    ...(hasRange(type ?? 'text') && parseNumber(min) !== undefined ? { min: parseNumber(min) } : {}),
    ...(hasRange(type ?? 'text') && parseNumber(max) !== undefined ? { max: parseNumber(max) } : {}),
    ...(type === 'number' && parseNumber(decimals) !== undefined ? { decimals: parseNumber(decimals) } : {}),
  };
  const notNumber = (v: number | undefined) => v !== undefined && !Number.isFinite(v);
  const rangeInverted = config.min !== undefined && config.max !== undefined && config.min > config.max;
  const decimalsWrong =
    config.decimals !== undefined &&
    (notNumber(config.decimals) ||
      !Number.isInteger(config.decimals) ||
      config.decimals < 0 ||
      config.decimals > CUSTOM_FIELD_DECIMALS_MAX);
  const invalid = {
    min: notNumber(config.min) || rangeInverted,
    max: notNumber(config.max) || rangeInverted,
    decimals: decimalsWrong,
  };
  const configProblem =
    notNumber(config.min) || notNumber(config.max)
      ? 'Minimum and maximum must be numbers.'
      : rangeInverted
        ? 'The minimum is above the maximum.'
        : decimalsWrong
          ? `Decimals is a whole number from 0 to ${CUSTOM_FIELD_DECIMALS_MAX}.`
          : null;

  // The default picker edits a field shaped like the one being made.
  const shape: CustomField | null = type
    ? {
        slug: field?.slug ?? generatedSlug ?? 'field',
        name: name.trim() || 'Default',
        type,
        config,
        is_required: required,
        default_value: null,
        empty_label: emptyLabel.trim() || null,
        applies_to: appliesTo,
        options,
        position: 0,
        is_archived: false,
        time_role: null,
        issue_count: 0,
        created_at: '',
        updated_at: '',
      }
    : null;

  const canSave = name.trim() !== '' && type !== null && !configProblem && !mutation.isPending;
  const slugProblem =
    !editing && slug.trim() !== '' && !isCustomFieldSlug(slug.trim())
      ? 'Use a lower-case letter, then letters, digits or hyphens, at most 40 characters.'
      : null;

  const submit = () => {
    if (!canSave || !type) return;
    setSlugLeft(true);
    if (slugProblem) return;
    const trimmedEmpty = emptyLabel.trim();
    if (!editing) {
      const body: CreateCustomField = {
        name: name.trim(),
        type,
        ...(slug.trim() ? { slug: slug.trim() } : {}),
        ...(Object.keys(config).length ? { config } : {}),
        ...(required ? { is_required: true } : {}),
        ...(defaultValue !== null ? { default_value: defaultValue } : {}),
        ...(trimmedEmpty ? { empty_label: trimmedEmpty } : {}),
        ...(appliesTo.length ? { applies_to: appliesTo } : {}),
        ...(hasOptions(type) && draftOptions.length
          ? { options: draftOptions.map(o => ({ name: o.name, color: o.color })) }
          : {}),
      };
      create.mutate(body, {
        onSuccess: created => {
          toast.success(`Added ${created.name}. Search it as ${created.slug}:`);
          onClose();
        },
      });
      return;
    }
    const body: UpdateCustomField = {};
    if (name.trim() !== field.name) body.name = name.trim();
    if (required !== field.is_required) body.is_required = required;
    if (JSON.stringify(defaultValue) !== JSON.stringify(field.default_value)) body.default_value = defaultValue;
    if ((trimmedEmpty || null) !== field.empty_label) body.empty_label = trimmedEmpty || null;
    if (JSON.stringify(appliesTo.toSorted()) !== JSON.stringify(field.applies_to.toSorted()))
      body.applies_to = appliesTo;
    if (JSON.stringify(config) !== JSON.stringify(field.config)) body.config = config;
    if (Object.keys(body).length === 0) return onClose();
    update.mutate({ slug: field.slug, body }, { onSuccess: onClose });
  };

  return (
    <form
      noValidate
      onSubmit={e => {
        e.preventDefault();
        submit();
      }}
    >
      <DialogHeader className="border-b px-5 py-4">
        <DialogTitle>{editing ? `Edit ${field.name}` : 'New custom field'}</DialogTitle>
        <DialogDescription>
          {editing
            ? 'Renaming keeps the slug, so saved searches and history keep working.'
            : 'It appears on this project’s issues, in the list, in search and in the CSV export.'}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="m-0 flex flex-col gap-5 p-5">
        {error.summary ? <FormAlert title={error.summary} /> : null}

        <div className={cn('grid gap-4', !editing && 'sm:grid-cols-2')}>
          <Row label="Name" htmlFor={ids.name} error={error.fields['name']}>
            <input
              id={ids.name}
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Severity"
              aria-invalid={Boolean(error.fields['name'])}
              className={inputClass}
            />
          </Row>
          {editing ? null : (
            <Row label="Type">
              <TypePicker value={type} onChange={setType} />
            </Row>
          )}
        </div>

        {editing ? (
          <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
            <Row label="Type">
              <Fixed>
                {(() => {
                  const meta = FIELD_TYPE_META[field.type];
                  return (
                    <>
                      <meta.icon className="size-icon flex-none text-text-secondary" />
                      {meta.label}
                    </>
                  );
                })()}
              </Fixed>
            </Row>
            <Row label="Slug">
              <Fixed className="font-mono text-xs">{field.slug}</Fixed>
            </Row>
            <p className="text-xs text-text-secondary sm:col-span-2">
              Both are fixed once the field exists. Search queries name the field by its slug.
            </p>
          </div>
        ) : (
          <Row
            label="Slug"
            htmlFor={ids.slug}
            error={(slugLeft ? slugProblem : null) ?? error.fields['slug']}
            hint="How search queries name the field: lower-case letters, digits and hyphens. Made from the name unless you choose one, and fixed once created."
          >
            <input
              id={ids.slug}
              value={slug}
              onChange={e => setSlug(e.target.value.toLowerCase())}
              onBlur={() => setSlugLeft(true)}
              placeholder={generatedSlug ?? 'severity'}
              aria-invalid={Boolean((slugLeft && slugProblem) || error.fields['slug'])}
              className={cn(inputClass, 'font-mono text-xs')}
            />
          </Row>
        )}

        <Row
          label="Applies to"
          error={error.fields['applies_to']}
          hint={appliesTo.length === 0 ? 'Every issue type. Narrow it so the field does not clutter the others.' : null}
        >
          <AppliesToPicker projectKey={projectKey} value={appliesTo} onChange={setAppliesTo} />
        </Row>

        {type && hasOptions(type) ? (
          <Row label="Options" hint="Drag to reorder: the order is also how they sort.">
            {editing ? (
              <SavedOptions projectKey={projectKey} field={field} />
            ) : (
              <OptionsList
                options={options}
                onAdd={(n, color) => setDraftOptions(o => [...o, { name: n, color, is_archived: false }])}
                onChange={(n, patch) => setDraftOptions(o => o.map(x => (x.name === n ? { ...x, ...patch } : x)))}
                onMove={(n, to) =>
                  setDraftOptions(o => {
                    const moving = o.find(x => x.name === n);
                    if (!moving) return o;
                    const rest = o.filter(x => x !== moving);
                    rest.splice(to, 0, moving);
                    return rest;
                  })
                }
                onDelete={n => {
                  setDraftOptions(o => o.filter(x => x.name !== n));
                  if (defaultValue === n) setDefaultValue(null);
                  if (Array.isArray(defaultValue)) setDefaultValue(defaultValue.filter(v => v !== n));
                }}
              />
            )}
          </Row>
        ) : null}

        {type && hasRange(type) ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Row label="Minimum" htmlFor={ids.min}>
              <input
                id={ids.min}
                inputMode="decimal"
                value={min}
                onChange={e => setMin(e.target.value)}
                placeholder="None"
                aria-invalid={invalid.min || undefined}
                aria-describedby={invalid.min ? ids.range : undefined}
                className={cn(inputClass, 'font-mono text-xs')}
              />
            </Row>
            <Row label="Maximum" htmlFor={ids.max}>
              <input
                id={ids.max}
                inputMode="decimal"
                value={max}
                onChange={e => setMax(e.target.value)}
                placeholder="None"
                aria-invalid={invalid.max || undefined}
                aria-describedby={invalid.max ? ids.range : undefined}
                className={cn(inputClass, 'font-mono text-xs')}
              />
            </Row>
            {type === 'number' ? (
              <Row label="Decimals" htmlFor={ids.decimals} hint="Digits after the point. Empty allows any.">
                <input
                  id={ids.decimals}
                  inputMode="numeric"
                  value={decimals}
                  onChange={e => setDecimals(e.target.value)}
                  placeholder="Any"
                  aria-invalid={invalid.decimals || undefined}
                  aria-describedby={invalid.decimals ? ids.range : undefined}
                  className={cn(inputClass, 'font-mono text-xs')}
                />
              </Row>
            ) : null}
            {(configProblem ?? error.fields['config']) ? (
              <p id={ids.range} role="alert" className="text-xs text-danger-fg sm:col-span-full">
                {configProblem ?? error.fields['config']}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Row
            label="Default"
            error={error.fields['default_value']}
            hint="Filled in on every new issue that does not set the field."
          >
            {shape ? (
              <DefaultPicker field={shape} projectKey={projectKey} value={defaultValue} onChange={setDefaultValue} />
            ) : (
              <p className="flex h-control items-center text-sm text-text-secondary">Choose a type first.</p>
            )}
          </Row>
          <Row
            label="Empty label"
            htmlFor={ids.empty}
            error={error.fields['empty_label']}
            hint="What an issue shows when the field has no value."
          >
            <input
              id={ids.empty}
              value={emptyLabel}
              onChange={e => setEmptyLabel(e.target.value)}
              placeholder={emptyLabelOf({ name: name.trim() || 'value', empty_label: null })}
              className={inputClass}
            />
          </Row>
        </div>

        <RequiredSwitch type={type} value={required} onChange={setRequired} />
        <FieldError message={error.fields['is_required']} />
      </DialogBody>

      <DialogFooter className="flex-row items-center border-t px-5 py-3 sm:justify-start">
        {editing ? (
          <>
            <ArchiveButton projectKey={projectKey} field={field} onDone={onClose} />
            <Button
              type="button"
              variant="ghost"
              className="text-danger-fg hover:text-danger-fg"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </Button>
          </>
        ) : null}
        <span className="flex-1" />
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <PendingButton type="submit" disabled={!canSave} pending={mutation.isPending} pendingLabel="Saving…">
          {editing ? 'Save changes' : 'Add field'}
        </PendingButton>
      </DialogFooter>

      {editing ? (
        <ConfirmDialog
          open={confirmingDelete}
          onOpenChange={setConfirmingDelete}
          title={`Delete ${field.name}?`}
          confirmLabel="Delete field"
          pendingLabel="Deleting…"
          pending={remove.isPending}
          onConfirm={() =>
            remove.mutate(field.slug, {
              onSuccess: () => {
                toast.success(`Deleted ${field.name}.`);
                setConfirmingDelete(false);
                onClose();
              },
              onError: e => toastError(`Could not delete ${field.name}`, e),
            })
          }
        >
          <DeleteConsequences field={field} />
        </ConfirmDialog>
      ) : null}
    </form>
  );
}

export function DeleteConsequences({ field }: { field: CustomField }) {
  const count = field.issue_count;
  return (
    <>
      <p>
        {count === 0 ? (
          'No issue has a value in it, so nothing is lost.'
        ) : (
          <>
            <b className="font-semibold text-text">
              {plural(count, 'issue loses its value', 'issues lose their values')}
            </b>{' '}
            for {field.name}, permanently. The entries it left in issue histories stay.
          </>
        )}
      </p>
      {field.time_role ? (
        <p>
          It is this project’s {field.time_role === 'estimation' ? 'Estimation' : 'Spent time'} field; the project goes
          back to the built-in one.
        </p>
      ) : null}
      {count > 0 ? <p>To hide it and keep the values, archive it instead.</p> : null}
    </>
  );
}

function RequiredSwitch({
  type,
  value,
  onChange,
}: {
  type: CustomFieldType | null;
  value: boolean;
  onChange: (on: boolean) => void;
}) {
  const id = useId();
  const checkbox = type === 'checkbox';
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={value && !checkbox} disabled={checkbox} onCheckedChange={onChange} className="mt-0.5" />
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="text-sm font-medium">
          Required
        </label>
        <p className="text-xs text-text-secondary">
          {checkbox
            ? 'A checkbox is never empty — unticked is No — so it cannot be required.'
            : 'A new issue must have a value, and it cannot be cleared afterwards. A default counts.'}
        </p>
      </div>
    </div>
  );
}

function ArchiveButton({ projectKey, field, onDone }: { projectKey: string; field: CustomField; onDone: () => void }) {
  const update = useUpdateCustomField(projectKey);
  const blocked = field.time_role !== null && !field.is_archived;
  const button = (
    <Button
      type="button"
      variant="outline"
      disabled={blocked || update.isPending}
      onClick={() =>
        update.mutate(
          { slug: field.slug, body: { is_archived: !field.is_archived } },
          {
            onSuccess: f => {
              toast.success(
                f.is_archived ? `Archived ${f.name}. Its values are kept.` : `${f.name} is back on issues.`,
              );
              onDone();
            },
            onError: e =>
              toastError(field.is_archived ? `Could not restore ${field.name}` : `Could not archive ${field.name}`, e),
          },
        )
      }
    >
      {field.is_archived ? 'Unarchive' : 'Archive'}
    </Button>
  );
  if (!blocked) return button;
  return (
    <span title="The project uses it for time tracking. Choose another field on the Time tracking tab first.">
      {button}
    </span>
  );
}

function TypePicker({ value, onChange }: { value: CustomFieldType | null; onChange: (type: CustomFieldType) => void }) {
  const [open, setOpen] = useState(false);
  const meta = value ? FIELD_TYPE_META[value] : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          role="combobox"
          aria-label="Type"
          aria-expanded={open}
          className={triggerClass}
        >
          {meta ? (
            <>
              <meta.icon className="text-text-secondary" />
              {meta.label}
            </>
          ) : (
            <span className="text-text-secondary">Choose a type</span>
          )}
          <ChevronsUpDown className="ml-auto text-text-secondary" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-(--radix-popover-trigger-width) min-w-[24rem] p-0">
        <PickerCommand>
          <CommandInput placeholder="Find a type" />
          <CommandList className="max-h-[360px]">
            <CommandEmpty>No type matches.</CommandEmpty>
            {FIELD_TYPE_GROUPS.map(group => (
              <CommandGroup key={group.label} heading={group.label}>
                {group.types.map(t => {
                  const m = FIELD_TYPE_META[t];
                  return (
                    <PickerItem
                      checked={t === value}
                      checkClassName="mt-0.5"
                      key={t}
                      value={`${m.label} ${m.hint}`}
                      onSelect={() => {
                        onChange(t);
                        setOpen(false);
                      }}
                      className="items-start"
                    >
                      <m.icon className="mt-0.5 text-text-secondary" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span>{m.label}</span>
                        <span className="text-xs text-text-secondary">{m.hint}</span>
                      </span>
                    </PickerItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </PickerCommand>
      </PopoverContent>
    </Popover>
  );
}

function AppliesToPicker({
  projectKey,
  value,
  onChange,
}: {
  projectKey: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const types = useSchemaValues(projectKey, 'types');
  const live = types.data ?? [];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          role="combobox"
          aria-label="Applies to"
          aria-expanded={open}
          className={cn(triggerClass, 'h-auto min-h-(--control) py-1')}
        >
          {value.length === 0 ? (
            <span>All types</span>
          ) : (
            <span className="flex flex-wrap gap-1.5">
              {value.map(name => {
                const type = live.find(t => t.name === name);
                return (
                  <span key={name} className="inline-flex items-center gap-1 text-sm">
                    {type ? <TypeBadge type={type} /> : null}
                    {name}
                  </span>
                );
              })}
            </span>
          )}
          <ChevronsUpDown className="ml-auto text-text-secondary" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
        <PickerCommand>
          <CommandList>
            <PickerItem checked={value.length === 0} value="\u0000all" onSelect={() => onChange([])}>
              <span className="min-w-0 flex-1">All types</span>
            </PickerItem>
            {live.map(t => {
              const on = value.includes(t.name);
              return (
                <PickerItem
                  checked={on}
                  key={t.name}
                  value={t.name}
                  onSelect={() => onChange(on ? value.filter(v => v !== t.name) : [...value, t.name])}
                >
                  <TypeBadge type={t} />
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                </PickerItem>
              );
            })}
          </CommandList>
        </PickerCommand>
      </PopoverContent>
    </Popover>
  );
}

/** The default's picker: the same editor the issue sidebar uses, on a field shaped like the draft. */
function DefaultPicker({
  field,
  projectKey,
  value,
  onChange,
}: {
  field: CustomField;
  projectKey: string;
  value: CustomFieldValueInput;
  onChange: (value: CustomFieldValueInput) => void;
}) {
  const [open, setOpen] = useState(false);
  const people = useProjectAssignees(
    open && (field.type === 'user' || field.type === 'multi_user') ? projectKey : null,
  );
  const calendar = useWorkCalendar();
  const empty =
    value === null || (Array.isArray(value) && value.length === 0) || (field.type === 'checkbox' && value !== true);

  if (field.type === 'checkbox') {
    return (
      <div className="flex h-control items-center gap-2">
        <Switch
          checked={value === true}
          onCheckedChange={on => onChange(on ? true : null)}
          aria-label="Ticked by default"
        />
        <span className="text-sm">{value === true ? 'Ticked' : 'Unticked'}</span>
      </div>
    );
  }

  if (hasOptions(field.type) && field.options.length === 0) {
    return <p className="flex h-control items-center text-sm text-text-secondary">Add options first.</p>;
  }

  const preview = (() => {
    if (empty) return <span className="text-text-secondary">No default</span>;
    switch (field.type) {
      case 'select':
        return (
          <FieldValue
            calendar={calendar}
            variant="sidebar"
            entry={{
              ...entryBase(field),
              type: 'select',
              value: { name: String(value), color: field.options.find(o => o.name === value)?.color ?? 'gray-2' },
            }}
          />
        );
      case 'multi_select':
        return (
          <FieldValue
            calendar={calendar}
            variant="sidebar"
            entry={{
              ...entryBase(field),
              type: 'multi_select',
              value: (value as string[]).map(n => ({
                name: n,
                color: field.options.find(o => o.name === n)?.color ?? 'gray-2',
              })),
            }}
          />
        );
      case 'user':
      case 'multi_user':
        return (
          <span className="truncate">
            {(Array.isArray(value) ? value : [String(value)]).map(u => `@${u}`).join(', ')}
          </span>
        );
      case 'date':
      case 'datetime':
        return (
          <FieldValue
            calendar={calendar}
            variant="sidebar"
            entry={{ ...entryBase(field), type: field.type, value: String(value) }}
          />
        );
      case 'duration':
        return (
          <span className="font-mono text-xs">
            {typeof value === 'number' ? (
              <FieldValue
                calendar={calendar}
                variant="sidebar"
                entry={{ ...entryBase(field), type: 'duration', value }}
              />
            ) : (
              String(value)
            )}
          </span>
        );
      default:
        return <span className="truncate">{String(value)}</span>;
    }
  })();

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Default"
            className={cn(triggerClass, 'min-w-0 flex-1 overflow-hidden')}
          >
            <span className="flex min-w-0 flex-1 items-center overflow-hidden">{preview}</span>
            <ChevronsUpDown className="text-text-secondary" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className={cn('p-0', field.type === 'markdown' ? 'w-[520px]' : 'w-[284px]')}>
          <FieldEditor
            field={field}
            value={value}
            people={people.data ?? []}
            peopleLoading={people.isPending}
            calendar={calendar}
            projectKey={projectKey}
            onSave={v => {
              onChange(v);
              setOpen(false);
            }}
            onToggle={v => onChange(v.length ? v : null)}
            onCancel={() => setOpen(false)}
          />
        </PopoverContent>
      </Popover>
      {!empty ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Remove the default"
          onClick={() => onChange(null)}
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
}

const entryBase = (field: CustomField) => ({ slug: field.slug, name: field.name, empty_label: emptyLabelOf(field) });

interface OptionsListProps {
  options: readonly CustomFieldOption[];
  onAdd: (name: string, color: LabelColor) => void;
  onChange: (name: string, patch: Partial<Pick<CustomFieldOption, 'name' | 'color' | 'is_archived'>>) => void;
  onMove: (name: string, to: number) => void;
  onDelete: (name: string) => void;
  error?: string | null;
}

/** The option rows: grip, colour, name and a menu — one line each, like the project's value lists. */
function OptionsList({ options, onAdd, onChange, onMove, onDelete, error }: OptionsListProps) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const order = archivedLast(options);
  const rows = order.shown;
  const nextColor = OPTION_COLORS[rows.length % OPTION_COLORS.length]!;
  const moveTo = (name: string, to: number) => {
    const target = order.live[to];
    if (target && target.name !== name) onMove(name, order.positionOf(target));
  };

  const add = () => {
    const n = draft.trim();
    if (!n) return;
    onAdd(n, nextColor);
    setDraft('');
  };

  return (
    <div className="flex flex-col gap-2">
      {rows.length > 0 ? (
        <ol className="flex flex-col divide-y divide-border-subtle rounded-md border" aria-label="Options">
          {rows.map((option, index) => {
            const live = !option.is_archived;
            return (
              <li
                key={option.name}
                onKeyDown={e => {
                  if (!live || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
                  e.preventDefault();
                  moveTo(option.name, index + (e.key === 'ArrowUp' ? -1 : 1));
                }}
                onDragOver={
                  dragging && live
                    ? e => {
                        e.preventDefault();
                        setOver(index);
                      }
                    : undefined
                }
                onDrop={
                  dragging && live
                    ? e => {
                        e.preventDefault();
                        moveTo(dragging, index);
                        setDragging(null);
                        setOver(null);
                      }
                    : undefined
                }
                className={cn(
                  'flex min-h-row items-start gap-2 px-2',
                  dragging === option.name && 'bg-inset',
                  over === index && dragging !== option.name && 'bg-selected',
                  !live && 'text-text-secondary',
                )}
              >
                <span className={rowCellClass}>
                  <ReorderGrip
                    name={live ? option.name : null}
                    onDragStart={() => setDragging(option.name)}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                  />
                </span>
                <span className={cn(rowCellClass, 'w-10')}>
                  <OptionColor option={option} onChange={color => onChange(option.name, { color })} />
                </span>
                <span className={nameColumnClass}>
                  <InlineRename name={option.name} canEdit onRename={n => onChange(option.name, { name: n })} />
                </span>
                <span className={cn(rowCellClass, 'w-18 max-sm:w-auto')}>
                  {live ? null : <RowChip>Archived</RowChip>}
                </span>
                <span className={cn(rowCellClass, 'ml-auto')}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Actions for ${option.name}`}
                        className="text-text-secondary"
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onSelect={() => onChange(option.name, { is_archived: live })}>
                        {live ? 'Archive' : 'Unarchive'}
                      </DropdownMenuItem>
                      {live ? (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>Move</DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            <DropdownMenuItem disabled={index === 0} onSelect={() => moveTo(option.name, index - 1)}>
                              Up <span className="ml-auto text-2xs text-text-secondary">Alt ↑</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={index === order.live.length - 1}
                              onSelect={() => moveTo(option.name, index + 1)}
                            >
                              Down <span className="ml-auto text-2xs text-text-secondary">Alt ↓</span>
                            </DropdownMenuItem>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      ) : null}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => window.setTimeout(() => onDelete(option.name), 0)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
      <div className="flex items-center gap-2">
        <input
          aria-label="Add an option"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add an option"
          className={cn(inputClass, 'flex-1')}
        />
        <Button type="button" variant="outline" size="sm" disabled={!draft.trim()} onClick={add}>
          Add
        </Button>
      </div>
      <FieldError message={error ?? undefined} />
    </div>
  );
}

/** An option's colour, carrying its first letter in the colour's own text ink, as the option reads on an issue. */
function OptionSwatch({ option }: { option: Pick<CustomFieldOption, 'name' | 'color'> }) {
  return (
    <span
      aria-hidden
      className={cn(
        `l-${option.color}`,
        'grid size-badge-letter flex-none place-items-center rounded-xs bg-c-bg text-[11px] font-semibold text-c-fg',
      )}
    >
      {option.name.charAt(0).toUpperCase()}
    </span>
  );
}

function OptionColor({ option, onChange }: { option: CustomFieldOption; onChange: (color: LabelColor) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Colour for ${option.name}`}
          title="Change colour"
          className={markButtonClass}
        >
          <MarkFrame>
            <OptionSwatch option={option} />
          </MarkFrame>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <LabelColorPicker
          value={option.color}
          onChange={color => {
            onChange(color);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** An existing field's options change one request at a time, as the project's value lists do. */
function SavedOptions({ projectKey, field }: { projectKey: string; field: CustomField }) {
  const createOption = useCreateCustomFieldOption(projectKey);
  const updateOption = useUpdateCustomFieldOption(projectKey);
  const deleteOption = useDeleteCustomFieldOption(projectKey);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ name: string; message?: string; targets?: readonly string[] } | null>(
    null,
  );
  const fail = (e: Error) => setError(e.message);
  const ok = () => setError(null);

  const onDelete = (name: string, moveTo?: string) =>
    deleteOption.mutate(
      { slug: field.slug, name, moveTo },
      {
        onSuccess: () => {
          setDeleting(null);
          ok();
          toast.success(moveTo ? `Deleted ${name}; its issues moved to ${moveTo}.` : `Deleted ${name}.`);
        },
        onError: e => {
          if (isApiError(e) && e.code === 'custom_field.option_in_use') {
            setDeleting({ name, message: e.message, targets: e.validValues ?? [] });
          } else fail(e);
        },
      },
    );

  return (
    <>
      <OptionsList
        options={field.options}
        error={error}
        onAdd={(name, color) =>
          createOption.mutate({ slug: field.slug, body: { name, color } }, { onSuccess: ok, onError: fail })
        }
        onChange={(name, body) =>
          updateOption.mutate({ slug: field.slug, name, body }, { onSuccess: ok, onError: fail })
        }
        onMove={(name, position) =>
          updateOption.mutate({ slug: field.slug, name, body: { position } }, { onSuccess: ok, onError: fail })
        }
        onDelete={name => setDeleting({ name })}
      />
      {deleting ? (
        <DeleteValueDialog
          key={deleting.targets ? 'move' : 'plain'}
          name={deleting.name}
          message={deleting.message}
          targets={deleting.targets}
          valueNoun="option"
          markOf={name => {
            const option = field.options.find(o => o.name === name);
            return option ? <OptionSwatch option={option} /> : null;
          }}
          onArchive={() => {
            updateOption.mutate(
              { slug: field.slug, name: deleting.name, body: { is_archived: true } },
              { onSuccess: ok, onError: fail },
            );
            setDeleting(null);
          }}
          pending={deleteOption.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={target => onDelete(deleting.name, target)}
        />
      ) : null}
    </>
  );
}
