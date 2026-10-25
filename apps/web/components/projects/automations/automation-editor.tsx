'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  STATUS_CATEGORIES,
  type Automation,
  type AutomationCatalogue,
  type AutomationTrigger,
  type StatusCategory,
} from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Checkbox } from '@components/ui/checkbox';
import { Input } from '@components/ui/input';
import { Label } from '@components/ui/label';
import { Switch } from '@components/ui/switch';
import { Command, CommandGroup, CommandItem, CommandList } from '@components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@components/ui/sheet';
import { FormAlert } from '@components/auth/form-alert';
import { Segmented } from '@components/segmented';
import { StatusPicker } from '@components/projects/automations/status-picker';
import { useCreateAutomation, useUpdateAutomation } from '@hooks/use-automations';
import { useSchemaValues } from '@hooks/use-project-schema';
import { isApiError } from '@lib/api/errors';
import { CATEGORY_LABEL } from '@lib/git/words';
import { cn } from '@lib/utils';

export type EditorTarget = { rule: Automation } | { trigger: AutomationTrigger | null };

interface AutomationEditorProps {
  projectKey: string;
  catalogue: AutomationCatalogue;
  gitEnabled: boolean;
  target: EditorTarget | null;
  onClose: () => void;
}

export function AutomationEditor({ projectKey, catalogue, gitEnabled, target, onClose }: AutomationEditorProps) {
  return (
    <Sheet open={target !== null} onOpenChange={open => (open ? null : onClose())}>
      <SheetContent className="w-full gap-0 sm:max-w-lg">
        {target ? (
          <EditorForm
            key={'rule' in target ? target.rule.name : (target.trigger ?? 'new')}
            projectKey={projectKey}
            catalogue={catalogue}
            gitEnabled={gitEnabled}
            target={target}
            onClose={onClose}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

type Conditions = Record<string, unknown>;

interface JsonSchemaProperty {
  type?: string;
  enum?: string[];
  items?: { type?: string; enum?: string[] };
  minimum?: number;
  maximum?: number;
}

const VALUE_LABEL: Record<string, string> = {
  closes: 'Closes the issue',
  mention: 'Only names it',
  any: 'Any',
  yes: 'Draft',
  no: 'Ready for review',
};

function EditorForm({
  projectKey,
  catalogue,
  gitEnabled,
  target,
  onClose,
}: AutomationEditorProps & { target: EditorTarget }) {
  const rule = 'rule' in target ? target.rule : null;
  const [trigger, setTrigger] = useState<AutomationTrigger | null>(
    rule?.trigger ?? ('trigger' in target ? target.trigger : null),
  );
  const [conditions, setConditions] = useState<Conditions>(rule?.conditions ?? {});
  const [status, setStatus] = useState<string | null>((rule?.action_params.status as string | undefined) ?? null);
  const [name, setName] = useState(rule?.name ?? '');
  const [errors, setErrors] = useState<{ name?: string; status?: string; conditions?: string; form?: string }>({});
  const create = useCreateAutomation(projectKey);
  const update = useUpdateAutomation(projectKey);
  const pending = create.isPending || update.isPending;

  const spec = catalogue.triggers.find(t => t.key === trigger) ?? null;
  const properties = (spec?.conditions.properties ?? {}) as Record<string, JsonSchemaProperty>;

  const refuse = (error: Error) => {
    if (!isApiError(error)) return setErrors({ form: error.message });
    if (error.field === 'name' || error.code === 'automation.name_taken' || error.code === 'automation.name_reserved') {
      return setErrors({ name: error.message });
    }
    if (error.field === 'action_params' || error.code === 'automation.status_missing')
      return setErrors({ status: error.message });
    if (error.field === 'conditions' || error.code === 'automation.condition_invalid')
      return setErrors({ conditions: error.message });
    setErrors({ form: error.message });
  };

  const save = () => {
    if (!trigger) return setErrors({ form: 'Choose what fires the rule.' });
    if (!status) return setErrors({ status: 'Choose the status it sets.' });
    setErrors({});
    const body = {
      trigger,
      conditions,
      action: 'issue.set_status' as const,
      action_params: { status },
      ...(name.trim() ? { name: name.trim() } : {}),
    };
    if (rule) {
      update.mutate(
        { name: rule.name, body },
        {
          onSuccess: saved => {
            toast.success(`${saved.name} is saved.`);
            onClose();
          },
          onError: refuse,
        },
      );
    } else {
      create.mutate(
        { ...body, is_enabled: true },
        {
          onSuccess: saved => {
            toast.success(`${saved.name} is on.`);
            onClose();
          },
          onError: refuse,
        },
      );
    }
  };

  const set = (key: string, value: unknown) => {
    const next = { ...conditions };
    if (value === undefined) delete next[key];
    else next[key] = value;
    setConditions(next);
  };

  return (
    <form
      noValidate
      onSubmit={event => {
        event.preventDefault();
        save();
      }}
      className="flex h-full min-h-0 flex-col"
    >
      <SheetHeader className="border-b px-5 py-4">
        <SheetTitle>{rule ? `Edit ${rule.name}` : 'New automation'}</SheetTitle>
        <SheetDescription>
          When something happens, if the issue fits, set its status. A change an automation makes never fires another
          one.
        </SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
        {errors.form ? <FormAlert title={errors.form} /> : null}

        <Step title="When">
          <TriggerPicker
            catalogue={catalogue}
            gitEnabled={gitEnabled}
            value={trigger}
            onChange={next => {
              setTrigger(next);
              setConditions({});
            }}
          />
        </Step>

        {spec ? (
          <Step title="Only if">
            <div className="flex flex-col gap-4">
              {Object.entries(properties).map(([key, schema]) => (
                <ConditionRow
                  key={key}
                  name={key}
                  label={catalogue.conditions[key] ?? key}
                  schema={schema}
                  value={conditions[key]}
                  fallback={spec.defaults[key]}
                  projectKey={projectKey}
                  onChange={value => set(key, value)}
                />
              ))}
            </div>
            {errors.conditions ? <p className="text-xs text-danger-fg">{errors.conditions}</p> : null}
          </Step>
        ) : null}

        <Step title="Then">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-text-secondary">Set status to</span>
            <StatusPicker
              projectKey={projectKey}
              value={status}
              onChange={next => {
                setStatus(next);
                setErrors({ ...errors, status: undefined });
              }}
              invalid={errors.status !== undefined}
              label="Status it sets"
            />
          </div>
          {errors.status ? <p className="text-xs text-danger-fg">{errors.status}</p> : null}
        </Step>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="automation-name">Name</Label>
          <Input
            id="automation-name"
            value={name}
            placeholder="Named after the rule when left empty"
            aria-invalid={errors.name !== undefined}
            onChange={event => {
              setName(event.target.value);
              setErrors({ ...errors, name: undefined });
            }}
          />
          <p className={cn('text-xs', errors.name ? 'text-danger-fg' : 'text-text-secondary')}>
            {errors.name ?? 'Shown in the issue’s history beside each change the rule makes.'}
          </p>
        </div>

        {rule ? (
          <div className="flex flex-col gap-1 rounded-md bg-inset px-3 py-2.5 text-xs">
            <span className="text-text-muted">As saved</span>
            <span className="text-text-secondary">{rule.sentence}</span>
          </div>
        ) : null}
      </div>

      <SheetFooter className="flex-row justify-end gap-2 border-t px-5 py-3">
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !trigger || !status}>
          {pending ? 'Saving…' : rule ? 'Save changes' : 'Create automation'}
        </Button>
      </SheetFooter>
    </form>
  );
}

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function TriggerPicker({
  catalogue,
  gitEnabled,
  value,
  onChange,
}: {
  catalogue: AutomationCatalogue;
  gitEnabled: boolean;
  value: AutomationTrigger | null;
  onChange: (trigger: AutomationTrigger) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = catalogue.triggers.find(t => t.key === value);
  const groups = [
    { heading: 'Git', triggers: catalogue.triggers.filter(t => t.group === 'git') },
    { heading: 'Subtasks', triggers: catalogue.triggers.filter(t => t.group === 'hierarchy') },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="What fires the rule"
          className="justify-between font-normal"
        >
          <span className={cn('truncate', !current && 'text-text-muted')}>{current?.label ?? 'Choose a trigger'}</span>
          <ChevronsUpDown className="size-icon-sm text-text-muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-72 p-0">
        <Command>
          <CommandList>
            {groups.map(group => (
              <CommandGroup key={group.heading} heading={group.heading}>
                {group.triggers.map(t => {
                  const off = t.group === 'git' && !gitEnabled;
                  return (
                    <CommandItem
                      key={t.key}
                      value={t.key}
                      disabled={off}
                      onSelect={() => {
                        setOpen(false);
                        onChange(t.key);
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">{t.label}</span>
                      {off ? <span className="text-2xs text-text-muted">link a repository first</span> : null}
                      <Check className={cn('size-icon-sm', t.key === value ? 'opacity-100' : 'opacity-0')} />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface ConditionRowProps {
  name: string;
  label: string;
  schema: JsonSchemaProperty;
  value: unknown;
  fallback: unknown;
  projectKey: string;
  onChange: (value: unknown) => void;
}

// Rows are drawn from the catalogue's JSON Schema, so a condition the API adds needs no web change.
function ConditionRow({ name, label, schema, value, fallback, projectKey, onChange }: ConditionRowProps) {
  const id = `condition-${name}`;

  if (schema.type === 'boolean') {
    const checked = (value ?? fallback ?? false) as boolean;
    return (
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={id} className="font-normal">
          {label}
        </Label>
        <Switch id={id} checked={checked} onCheckedChange={next => onChange(next)} />
      </div>
    );
  }

  if (schema.type === 'string' && schema.enum) {
    const current = (value ?? fallback ?? schema.enum[0]) as string;
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm">{label}</span>
        <Segmented
          ariaLabel={label}
          value={current}
          options={schema.enum.map(v => ({ value: v, label: VALUE_LABEL[v] ?? v }))}
          onChange={onChange}
        />
      </div>
    );
  }

  if (schema.type === 'integer' || schema.type === 'number') {
    const current = (value ?? fallback ?? '') as number | '';
    return (
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={id} className="font-normal">
          {label}
        </Label>
        <Input
          id={id}
          inputMode="numeric"
          value={String(current)}
          className="w-20 text-right tabular"
          onChange={event => {
            const n = Number.parseInt(event.target.value, 10);
            onChange(Number.isNaN(n) ? undefined : n);
          }}
        />
      </div>
    );
  }

  if (schema.type === 'array' && schema.items?.enum) {
    const options = schema.items.enum;
    const chosen = (value ?? fallback ?? []) as string[];
    const categories = name === 'issue_status_category';
    return (
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm">{label}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {options.map(option => {
            const on = chosen.includes(option);
            return (
              <label key={option} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={on}
                  onCheckedChange={next => {
                    const list = next === true ? [...chosen, option] : chosen.filter(o => o !== option);
                    onChange(list.length === 0 ? undefined : list);
                  }}
                />
                {categories ? CATEGORY_LABEL[option as StatusCategory] : (VALUE_LABEL[option] ?? option)}
              </label>
            );
          })}
        </div>
        {categories && chosen.length === 0 ? <p className="text-xs text-text-muted">Any status category.</p> : null}
      </fieldset>
    );
  }

  if (schema.type === 'array' && name === 'issue_type') {
    return <TypeChoice label={label} projectKey={projectKey} value={(value ?? []) as string[]} onChange={onChange} />;
  }

  if (schema.type === 'array') {
    return <ChipsField id={id} label={label} value={(value ?? []) as string[]} onChange={onChange} />;
  }

  return null;
}

function TypeChoice({
  label,
  projectKey,
  value,
  onChange,
}: {
  label: string;
  projectKey: string;
  value: string[];
  onChange: (value: unknown) => void;
}) {
  const types = useSchemaValues(projectKey, 'types');
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm">{label}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {(types.data ?? []).map(type => (
          <label key={type.name} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={value.includes(type.name)}
              onCheckedChange={next => {
                const list = next === true ? [...value, type.name] : value.filter(v => v !== type.name);
                onChange(list.length === 0 ? undefined : list);
              }}
            />
            {type.name}
          </label>
        ))}
      </div>
      {value.length === 0 ? <p className="text-xs text-text-muted">Any type.</p> : null}
    </fieldset>
  );
}

function ChipsField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string[];
  onChange: (value: unknown) => void;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    setDraft('');
    if (v && !value.includes(v)) onChange([...value, v]);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
      <div className="flex flex-wrap items-center gap-1">
        {value.map(v => (
          <button
            key={v}
            type="button"
            className="inline-flex h-6 items-center gap-1 rounded-sm border px-1.5 font-mono text-2xs hover:border-border-strong"
            aria-label={`Remove ${v}`}
            onClick={() => {
              const next = value.filter(x => x !== v);
              onChange(next.length === 0 ? undefined : next);
            }}
          >
            {v} <span className="text-text-muted">×</span>
          </button>
        ))}
        <Input
          id={id}
          value={draft}
          placeholder="main, release/*"
          className="h-7 w-40 font-mono text-xs"
          onChange={event => setDraft(event.target.value)}
          onBlur={add}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add();
            }
          }}
        />
      </div>
      <p className="text-xs text-text-secondary">
        {value.length === 0
          ? 'Left empty, each repository’s own merge branches count: its default branch, unless it says otherwise.'
          : 'Patterns work: release/*.'}
      </p>
    </div>
  );
}

export { STATUS_CATEGORIES };
