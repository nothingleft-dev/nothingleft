'use client';

import { useId, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { formatDuration, parseDuration, type WorkCalendar } from '@nothingleft/format';
import type { MemberRef } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@components/ui/command';
import { Skeleton } from '@components/ui/skeleton';
import { MonthGrid } from '@components/date-picker';
import { MemberAvatar } from '@components/issues/member-avatar';
import { cn } from '@lib/utils';

export interface PickerOption {
  name: string;
  mark?: ReactNode;
}

interface ValueCommandProps {
  options: readonly PickerOption[];
  selected: string | null;
  placeholder: string;
  onSelect: (name: string) => void;
  /** The list is still on its way: rows of skeleton, never "nothing matches". */
  loading?: boolean;
}

/** Shaped like the rows it stands in for, so the popover does not jump when they arrive. */
export function PickerSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy className="flex flex-col gap-1 p-1" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-8 items-center gap-2 px-2">
          <Skeleton className="size-4 rounded-full" />
          <Skeleton className="h-3" style={{ width: `${40 + ((i * 23) % 35)}%` }} />
        </div>
      ))}
    </div>
  );
}

export function ValueCommand({ options, selected, placeholder, onSelect, loading = false }: ValueCommandProps) {
  return (
    <Command>
      <CommandInput placeholder={placeholder} />
      <CommandList>
        {loading ? <PickerSkeleton /> : <CommandEmpty>No value matches.</CommandEmpty>}
        {options.map(option => (
          <CommandItem key={option.name} value={option.name} onSelect={() => onSelect(option.name)}>
            {option.mark}
            <span className="min-w-0 flex-1 truncate">{option.name}</span>
            <Check className={cn('size-icon-sm', option.name === selected ? 'opacity-100' : 'opacity-0')} />
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}

interface AssigneeCommandProps {
  people: readonly MemberRef[];
  selected: readonly string[];
  onToggle: (username: string) => void;
  loading?: boolean;
}

/** Stays open while toggling: several people are often assigned in one go. */
export function AssigneeCommand({ people, selected, onToggle, loading = false }: AssigneeCommandProps) {
  return (
    <Command>
      <CommandInput placeholder="Find a person" />
      <CommandList>
        {loading ? <PickerSkeleton /> : <CommandEmpty>Nobody in this project matches.</CommandEmpty>}
        {people.map(person => {
          const on = selected.includes(person.username);
          return (
            <CommandItem
              key={person.username}
              value={`${person.name} ${person.username}`}
              onSelect={() => onToggle(person.username)}
              aria-selected={on}
            >
              <MemberAvatar member={person} className="size-5" />
              <span className="min-w-0 flex-1 truncate">{person.name}</span>
              <span className="text-xs text-text-muted">@{person.username}</span>
              <Check className={cn('size-icon-sm', on ? 'opacity-100' : 'opacity-0')} />
            </CommandItem>
          );
        })}
      </CommandList>
    </Command>
  );
}

interface EstimateEditorProps {
  value: number | null;
  calendar: WorkCalendar;
  error?: string | null;
  onSave: (typed: string | null) => void;
  /** A duration custom field reuses the editor under its own name. */
  label?: string;
}

/** The typed string goes to the API as-is; parsing here only previews what it will store. */
export function EstimateEditor({ value, calendar, error, onSave, label = 'Estimation' }: EstimateEditorProps) {
  const id = useId();
  const [text, setText] = useState(value === null ? '' : formatDuration(value, calendar));
  const trimmed = text.trim();
  const minutes = trimmed === '' ? null : parseDuration(trimmed, calendar);
  const invalid = trimmed !== '' && minutes === null;

  return (
    <form
      noValidate
      className="flex flex-col gap-2 p-3"
      onSubmit={event => {
        event.preventDefault();
        // React bubbles through portals: without this the create dialog's form submits too.
        event.stopPropagation();
        if (!invalid) onSave(trimmed === '' ? null : trimmed);
      }}
    >
      <label htmlFor={id} className="text-2xs font-medium text-text-secondary">
        {label}
      </label>
      <input
        id={id}
        autoFocus
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="1w 1d 1h 1m"
        aria-invalid={invalid || Boolean(error)}
        className="h-control w-full rounded-md border border-border-strong bg-surface px-2 font-mono text-xs text-text placeholder:text-text-muted aria-invalid:border-danger-fg"
      />
      <p className={cn('text-2xs', invalid || error ? 'text-danger-fg' : 'text-text-secondary')}>
        {error ??
          (invalid
            ? 'Write it as 1w 1d 1h 1m, or any part of that.'
            : minutes === null
              ? `Empty clears ${label === 'Estimation' ? 'the estimate' : label}.`
              : `Stored as ${formatDuration(minutes, calendar)}.`)}
      </p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={invalid}>
          Save
        </Button>
        {value !== null ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => onSave(null)}>
            Clear
          </Button>
        ) : null}
      </div>
    </form>
  );
}

interface DateEditorProps {
  value: string | null;
  onChange: (value: string | null) => void;
}

export function DateEditor({ value, onChange }: DateEditorProps) {
  return (
    <div className="flex flex-col gap-2 p-3">
      <MonthGrid value={value} onSelect={onChange} />
      {value ? (
        <Button type="button" size="sm" variant="ghost" className="self-start" onClick={() => onChange(null)}>
          Clear date
        </Button>
      ) : null}
    </div>
  );
}
