'use client';

import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Check, ExternalLink } from 'lucide-react';
import type { WorkCalendar } from '@nothingleft/format';
import type { CustomField, CustomFieldValueInput, IssueCustomFieldValue, MemberRef } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@components/ui/command';
import { MonthGrid } from '@components/date-picker';
import { MarkdownEditor } from '@components/editor/markdown-editor';
import { AssigneeCommand, DateEditor, EstimateEditor, PickerSkeleton } from '@components/issues/pickers';
import { MemberAvatar } from '@components/issues/member-avatar';
import { emptyLabelOf } from '@components/custom-fields/field-types';
import {
  formatTimeOfDay,
  instantFromZoned,
  parseTimeOfDay,
  todayCalendarDate,
  zonedDateAndMinutes,
} from '@lib/datetime';
import { cn } from '@lib/utils';

/** A value in the form a request writes it, read from what the issue shows. */
export function inputOf(entry: IssueCustomFieldValue): CustomFieldValueInput {
  switch (entry.type) {
    case 'select':
      return entry.value?.name ?? null;
    case 'multi_select':
      return entry.value.map(o => o.name);
    case 'user':
      return entry.value?.username ?? null;
    case 'multi_user':
      return entry.value.map(p => p.username);
    default:
      return entry.value;
  }
}

/** What the issue will show once `input` is saved, drawn before the server answers. */
export function entryWith(
  entry: IssueCustomFieldValue,
  input: CustomFieldValueInput,
  field: CustomField | undefined,
  people: readonly MemberRef[],
): IssueCustomFieldValue {
  const option = (name: string) => {
    const found = field?.options.find(o => o.name === name);
    return { name, color: found?.color ?? 'gray-2' };
  };
  const person = (username: string) =>
    people.find(p => p.username === username) ?? {
      username,
      name: username,
      avatar_url: null,
      former_member: false,
      deactivated: false,
    };
  switch (entry.type) {
    case 'select':
      return { ...entry, value: typeof input === 'string' ? option(input) : null };
    case 'multi_select':
      return { ...entry, value: Array.isArray(input) ? input.map(option) : [] };
    case 'user':
      return { ...entry, value: typeof input === 'string' ? person(input) : null };
    case 'multi_user':
      return { ...entry, value: Array.isArray(input) ? input.map(person) : [] };
    case 'checkbox':
      return { ...entry, value: input === true };
    case 'number':
    case 'integer':
      return { ...entry, value: typeof input === 'number' ? input : null };
    // A typed duration is the server's to parse; the page waits for it.
    case 'duration':
      return entry;
    default:
      return { ...entry, value: typeof input === 'string' && input !== '' ? input : null };
  }
}

const inputClass =
  'h-control w-full rounded-md border border-border-strong bg-surface px-2 text-sm text-text placeholder:text-text-muted aria-invalid:border-danger-fg';

function EditorForm({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) {
  return (
    <form
      noValidate
      className="flex flex-col gap-2 p-3"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        // React bubbles through portals: without this the create dialog's form submits too.
        event.stopPropagation();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

function Hint({ error, children }: { error?: string | null; children?: ReactNode }) {
  if (!error && !children) return null;
  return (
    <p role={error ? 'alert' : undefined} className={cn('text-2xs', error ? 'text-danger-fg' : 'text-text-secondary')}>
      {error ?? children}
    </p>
  );
}

function SaveRow({ canClear, disabled, onClear }: { canClear: boolean; disabled?: boolean; onClear: () => void }) {
  return (
    <div className="flex gap-2">
      <Button type="submit" size="sm" disabled={disabled}>
        Save
      </Button>
      {canClear ? (
        <Button type="button" size="sm" variant="ghost" onClick={onClear}>
          Clear
        </Button>
      ) : null}
    </div>
  );
}

interface TextEditorProps {
  label: string;
  value: string | null;
  kind: 'text' | 'url';
  error?: string | null;
  onSave: (value: string | null) => void;
}

const isUrl = (text: string) => /^https?:\/\/\S+\.\S+/i.test(text);

export function TextValueEditor({ label, value, kind, error, onSave }: TextEditorProps) {
  const id = useId();
  const [text, setText] = useState(value ?? '');
  const trimmed = text.trim();
  const badUrl = kind === 'url' && trimmed !== '' && !isUrl(trimmed);

  return (
    <EditorForm onSubmit={() => !badUrl && onSave(trimmed === '' ? null : trimmed)}>
      <label htmlFor={id} className="text-2xs font-medium text-text-secondary">
        {label}
      </label>
      <input
        id={id}
        autoFocus
        value={text}
        inputMode={kind === 'url' ? 'url' : undefined}
        placeholder={kind === 'url' ? 'https://' : undefined}
        onChange={e => setText(e.target.value)}
        aria-invalid={badUrl || Boolean(error)}
        className={inputClass}
      />
      <Hint error={error ?? (badUrl ? 'Start the address with http:// or https://.' : null)}>
        {kind === 'url' && value && isUrl(value) ? (
          <a
            href={value}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-brand-text hover:underline"
          >
            Open link <ExternalLink className="size-3" />
          </a>
        ) : null}
      </Hint>
      <SaveRow canClear={value !== null} disabled={badUrl} onClear={() => onSave(null)} />
    </EditorForm>
  );
}

interface NumberEditorProps {
  field: Pick<CustomField, 'name' | 'type' | 'config'>;
  value: number | null;
  error?: string | null;
  onSave: (value: number | null) => void;
}

export function numberProblem(field: NumberEditorProps['field'], n: number): string | null {
  const { min, max, decimals } = field.config;
  if (field.type === 'integer' && !Number.isInteger(n)) return 'Use a whole number.';
  if (min !== undefined && n < min) return `The lowest allowed is ${min}.`;
  if (max !== undefined && n > max) return `The highest allowed is ${max}.`;
  if (field.type === 'number' && decimals !== undefined) {
    const places = String(n).split('.')[1]?.length ?? 0;
    if (places > decimals) return decimals === 0 ? 'Use a whole number.' : `Use at most ${decimals} decimal places.`;
  }
  return null;
}

export function rangeHint(field: NumberEditorProps['field']): string | null {
  const { min, max, decimals } = field.config;
  const parts = [
    min !== undefined && max !== undefined
      ? `From ${min} to ${max}`
      : min !== undefined
        ? `At least ${min}`
        : max !== undefined
          ? `At most ${max}`
          : null,
    field.type === 'number' && decimals !== undefined
      ? decimals === 0
        ? 'whole numbers'
        : `up to ${decimals} decimal places`
      : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join(', ')}.` : null;
}

export function NumberValueEditor({ field, value, error, onSave }: NumberEditorProps) {
  const id = useId();
  const [text, setText] = useState(value === null ? '' : String(value));
  const trimmed = text.trim();
  const n = trimmed === '' ? null : Number(trimmed);
  const problem =
    n === null ? null : Number.isFinite(n) ? numberProblem(field, n) : 'Write a number, such as 12 or 3.5.';

  return (
    <EditorForm onSubmit={() => !problem && onSave(n)}>
      <label htmlFor={id} className="text-2xs font-medium text-text-secondary">
        {field.name}
      </label>
      <input
        id={id}
        autoFocus
        inputMode="decimal"
        value={text}
        onChange={e => setText(e.target.value)}
        aria-invalid={Boolean(problem || error)}
        className={cn(inputClass, 'font-mono tabular')}
      />
      <Hint error={error ?? problem}>{rangeHint(field)}</Hint>
      <SaveRow canClear={value !== null} disabled={Boolean(problem)} onClear={() => onSave(null)} />
    </EditorForm>
  );
}

interface DateTimeEditorProps {
  label: string;
  value: string | null;
  timeZone?: string;
  error?: string | null;
  onSave: (value: string | null) => void;
}

export function DateTimeValueEditor({ label, value, timeZone, error, onSave }: DateTimeEditorProps) {
  const id = useId();
  const start = value ? zonedDateAndMinutes(value, timeZone) : null;
  const [date, setDate] = useState<string | null>(start?.date ?? todayCalendarDate(timeZone));
  const [time, setTime] = useState(start ? formatTimeOfDay(start.minutes) : '9:00am');
  const minutes = parseTimeOfDay(time);
  const invalid = minutes === null;

  return (
    <EditorForm onSubmit={() => date && !invalid && onSave(instantFromZoned(date, minutes, timeZone))}>
      <span className="text-2xs font-medium text-text-secondary">{label}</span>
      <MonthGrid value={date} onSelect={setDate} />
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-2xs text-text-secondary">
          Time
        </label>
        <input
          id={id}
          value={time}
          onChange={e => setTime(e.target.value)}
          placeholder="9:30am"
          aria-invalid={invalid || Boolean(error)}
          className={cn(inputClass, 'w-28 font-mono text-xs tabular')}
        />
      </div>
      <Hint error={error ?? (invalid ? 'Write a time such as 9:30am or 14:30.' : null)} />
      <SaveRow canClear={value !== null} disabled={!date || invalid} onClear={() => onSave(null)} />
    </EditorForm>
  );
}

interface MarkdownValueEditorProps {
  label: string;
  value: string | null;
  projectKey: string;
  error?: string | null;
  onSave: (value: string | null) => void;
  onCancel: () => void;
}

export function MarkdownValueEditor({ label, value, projectKey, error, onSave, onCancel }: MarkdownValueEditorProps) {
  const [text, setText] = useState(value ?? '');
  const save = () => onSave(text.trim() === '' ? null : text);
  return (
    <div className="flex flex-col gap-2 p-3">
      <MarkdownEditor
        value={text}
        onChange={setText}
        projectKey={projectKey}
        label={label}
        placeholder={`Write ${label}`}
        autoFocus
        invalid={Boolean(error)}
        onSubmit={save}
        onCancel={onCancel}
      />
      <Hint error={error} />
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={save}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

interface OptionCommandProps {
  field: Pick<CustomField, 'name' | 'empty_label' | 'options'>;
  selected: readonly string[];
  /** Offer the empty value as the first choice; a single select only. */
  withEmpty: boolean;
  onSelect: (name: string | null) => void;
}

/** Archived options stay visible only where they are already chosen. */
export function OptionCommand({ field, selected, withEmpty, onSelect }: OptionCommandProps) {
  const options = field.options
    .filter(o => !o.is_archived || selected.includes(o.name))
    .toSorted((a, b) => a.position - b.position);
  const empty = emptyLabelOf(field);
  return (
    <Command>
      <CommandInput placeholder={`Find ${field.name}`} />
      <CommandList>
        <CommandEmpty>No option matches.</CommandEmpty>
        {withEmpty ? (
          <CommandItem value={`\u0000${empty}`} onSelect={() => onSelect(null)}>
            <i aria-hidden className="inline-block size-2 flex-none rounded-full border border-border-strong" />
            <span className="min-w-0 flex-1 truncate text-text-muted">{empty}</span>
            <Check className={cn('size-icon-sm', selected.length === 0 ? 'opacity-100' : 'opacity-0')} />
          </CommandItem>
        ) : null}
        {options.map(option => (
          <CommandItem key={option.name} value={option.name} onSelect={() => onSelect(option.name)}>
            <i
              aria-hidden
              className={cn(`l-${option.color}`, 'inline-block size-2 flex-none rounded-full bg-c-solid')}
            />
            <span className="min-w-0 flex-1 truncate">{option.name}</span>
            {option.is_archived ? <span className="text-2xs text-text-muted">Archived</span> : null}
            <Check className={cn('size-icon-sm', selected.includes(option.name) ? 'opacity-100' : 'opacity-0')} />
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}

interface PersonCommandProps {
  people: readonly MemberRef[];
  loading: boolean;
  selected: string | null;
  emptyLabel: string;
  onSelect: (username: string | null) => void;
}

export function PersonCommand({ people, loading, selected, emptyLabel, onSelect }: PersonCommandProps) {
  return (
    <Command>
      <CommandInput placeholder="Find a person" />
      <CommandList>
        {loading ? <PickerSkeleton /> : <CommandEmpty>Nobody in this project matches.</CommandEmpty>}
        <CommandItem value={`\u0000${emptyLabel}`} onSelect={() => onSelect(null)}>
          <span aria-hidden className="inline-block size-5 rounded-full border border-dashed border-border-strong" />
          <span className="min-w-0 flex-1 truncate text-text-muted">{emptyLabel}</span>
          <Check className={cn('size-icon-sm', selected === null ? 'opacity-100' : 'opacity-0')} />
        </CommandItem>
        {people.map(person => (
          <CommandItem
            key={person.username}
            value={`${person.name} ${person.username}`}
            onSelect={() => onSelect(person.username)}
          >
            <MemberAvatar member={person} className="size-5" />
            <span className="min-w-0 flex-1 truncate">{person.name}</span>
            <span className="text-xs text-text-muted">@{person.username}</span>
            <Check className={cn('size-icon-sm', person.username === selected ? 'opacity-100' : 'opacity-0')} />
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}

export interface FieldEditorProps {
  field: CustomField;
  /** The value as a request writes it. */
  value: CustomFieldValueInput;
  people: readonly MemberRef[];
  peopleLoading: boolean;
  calendar: WorkCalendar;
  projectKey: string;
  timeZone?: string;
  error?: string | null;
  /** A single value: save it, and the caller closes on success. */
  onSave: (value: CustomFieldValueInput) => void;
  /** A multi type's running choice; the caller decides when it is saved. */
  onToggle: (value: string[]) => void;
  onCancel: () => void;
}

/** The popover body for one custom field, by type. A checkbox has no editor: it is a switch in place. */
export function FieldEditor(props: FieldEditorProps) {
  const { field, value, people, peopleLoading, calendar, projectKey, timeZone, error, onSave, onToggle } = props;
  const list = Array.isArray(value) ? value : [];
  const toggle = (name: string) => onToggle(list.includes(name) ? list.filter(v => v !== name) : [...list, name]);

  switch (field.type) {
    case 'text':
    case 'url':
      return (
        <TextValueEditor
          label={field.name}
          kind={field.type}
          value={typeof value === 'string' ? value : null}
          error={error}
          onSave={onSave}
        />
      );
    case 'markdown':
      return (
        <MarkdownValueEditor
          label={field.name}
          value={typeof value === 'string' ? value : null}
          projectKey={projectKey}
          error={error}
          onSave={onSave}
          onCancel={props.onCancel}
        />
      );
    case 'number':
    case 'integer':
      return (
        <NumberValueEditor
          field={field}
          value={typeof value === 'number' ? value : null}
          error={error}
          onSave={onSave}
        />
      );
    case 'duration':
      return (
        <EstimateEditor
          label={field.name}
          value={typeof value === 'number' ? value : null}
          calendar={calendar}
          error={error}
          onSave={onSave}
        />
      );
    case 'date':
      return (
        <div>
          <DateEditor value={typeof value === 'string' ? value : null} onChange={onSave} />
          {error ? <p className="px-3 pb-3 text-2xs text-danger-fg">{error}</p> : null}
        </div>
      );
    case 'datetime':
      return (
        <DateTimeValueEditor
          label={field.name}
          value={typeof value === 'string' ? value : null}
          timeZone={timeZone}
          error={error}
          onSave={onSave}
        />
      );
    case 'select':
      return (
        <OptionCommand field={field} selected={typeof value === 'string' ? [value] : []} withEmpty onSelect={onSave} />
      );
    case 'multi_select':
      return <OptionCommand field={field} selected={list} withEmpty={false} onSelect={n => n && toggle(n)} />;
    case 'user':
      return (
        <PersonCommand
          people={people}
          loading={peopleLoading}
          selected={typeof value === 'string' ? value : null}
          emptyLabel={emptyLabelOf(field)}
          onSelect={onSave}
        />
      );
    case 'multi_user':
      return <AssigneeCommand people={people} loading={peopleLoading} selected={list} onToggle={toggle} />;
    case 'checkbox':
      return null;
  }
}

/** A multi type saves when its popover closes, so toggling three options is one write. */
export const savesOnClose = (field: Pick<CustomField, 'type'>) =>
  field.type === 'multi_select' || field.type === 'multi_user';

/** The widest editors need more room than the sidebar's 280px popover. */
export const editorWidth = (field: Pick<CustomField, 'type'>) =>
  field.type === 'markdown'
    ? 'w-[560px]'
    : field.type === 'date' || field.type === 'datetime'
      ? 'w-[284px]'
      : undefined;
