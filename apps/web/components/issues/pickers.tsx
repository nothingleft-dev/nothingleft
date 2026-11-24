'use client';

import { useId, useState, type ReactNode } from 'react';
import { formatDuration, parseDuration, type WorkCalendar } from '@nothingleft/format';
import type { MemberRef } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { CommandEmpty, CommandInput, CommandList } from '@components/ui/command';
import { PickerCommand, PickerItem } from '@components/picker';
import { Skeleton } from '@components/ui/skeleton';
import { MonthGrid } from '@components/date-picker';
import { MemberAvatar } from '@components/issues/member-avatar';
import { todayCalendarDate } from '@lib/datetime';
import { cn } from '@lib/utils';

export interface PickerOption {
  name: string;
  mark?: ReactNode;
  /** Muted text after the name that also matches the filter: a project's key. */
  hint?: string;
}

interface ValueCommandProps {
  options: readonly PickerOption[];
  selected: string | null;
  placeholder: string;
  onSelect: (name: string) => void;
  /** The list is still on its way: rows of skeleton, never "nothing matches". */
  loading?: boolean;
  /** Set when the list failed to load: the picker says so and offers this, never "nothing matches". */
  onRetry?: () => void;
  /** What failed, in the picker's words: "The statuses could not be loaded." */
  failure?: string;
}

/** A query's retry, but only while it has failed: the `onRetry` the pickers take. */
export const retryOf = (query: { isError: boolean; refetch: () => unknown }) =>
  query.isError ? () => void query.refetch() : undefined;

function PickerFailure({ onRetry, message }: { onRetry: () => void; message: string }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-2 px-3 py-3 text-xs text-text-secondary">
      {message}
      <Button type="button" variant="outline" size="xs" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
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

export function ValueCommand({
  options,
  selected,
  placeholder,
  onSelect,
  loading = false,
  onRetry,
  failure = 'The list could not be loaded.',
}: ValueCommandProps) {
  return (
    <PickerCommand>
      <CommandInput placeholder={placeholder} />
      <CommandList>
        {loading ? (
          <PickerSkeleton />
        ) : onRetry && options.length === 0 ? (
          <PickerFailure onRetry={onRetry} message={failure} />
        ) : (
          <CommandEmpty>No value matches.</CommandEmpty>
        )}
        {options.map(option => (
          <PickerItem
            checked={option.name === selected}
            key={option.name}
            value={option.hint ? `${option.name} ${option.hint}` : option.name}
            onSelect={() => onSelect(option.name)}
          >
            {option.mark}
            <span className="min-w-0 flex-1 truncate">{option.name}</span>
            {option.hint ? <span className="font-mono text-2xs text-text-muted">{option.hint}</span> : null}
          </PickerItem>
        ))}
      </CommandList>
    </PickerCommand>
  );
}

interface AssigneeCommandProps {
  people: readonly MemberRef[];
  selected: readonly string[];
  onToggle: (username: string) => void;
  loading?: boolean;
  onRetry?: () => void;
  failure?: string;
}

/** Stays open while toggling: several people are often assigned in one go. */
export function AssigneeCommand({
  people,
  selected,
  onToggle,
  loading = false,
  onRetry,
  failure = 'The list could not be loaded.',
}: AssigneeCommandProps) {
  return (
    <PickerCommand>
      <CommandInput placeholder="Find a person" />
      <CommandList>
        {loading ? (
          <PickerSkeleton />
        ) : onRetry && people.length === 0 ? (
          <PickerFailure onRetry={onRetry} message={failure} />
        ) : (
          <CommandEmpty>Nobody in this project matches.</CommandEmpty>
        )}
        {people.map(person => {
          const on = selected.includes(person.username);
          return (
            <PickerItem
              checked={on}
              key={person.username}
              value={`${person.name} ${person.username}`}
              onSelect={() => onToggle(person.username)}
              aria-selected={on}
            >
              <MemberAvatar member={person} className="size-5" />
              <span className="min-w-0 flex-1 truncate">{person.name}</span>
              <span className="text-xs text-text-muted">@{person.username}</span>
            </PickerItem>
          );
        })}
      </CommandList>
    </PickerCommand>
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
        data-slot="input"
        aria-invalid={invalid || Boolean(error)}
        className="h-control w-full rounded-md border border-border-strong bg-surface px-2 font-mono text-xs text-text placeholder:text-text-muted"
      />
      <p className={cn('text-2xs', invalid || error ? 'text-danger-fg' : 'text-text-secondary')}>
        {error ??
          (invalid ? (
            <>
              Write it as <span className="font-mono">1w 1d 1h 1m</span>, or any part of that.
            </>
          ) : minutes === null ? (
            `Empty clears ${label === 'Estimation' ? 'the estimate' : label}.`
          ) : (
            <>
              Stored as <span className="font-mono">{formatDuration(minutes, calendar)}</span>.
            </>
          ))}
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
  /** The viewer's zone, so Today is their calendar day. */
  timeZone?: string | undefined;
  /** A line of context beside the actions, such as the issue's start date under its due date. */
  note?: string | undefined;
}

export function DateEditor({ value, onChange, timeZone, note }: DateEditorProps) {
  const today = todayCalendarDate(timeZone);
  return (
    <div className="flex flex-col gap-2 p-3">
      <MonthGrid value={value} onSelect={onChange} />
      <div className="flex items-center justify-end gap-1 border-t pt-2">
        {note ? <span className="mr-auto pl-1 text-2xs text-text-secondary">{note}</span> : null}
        {value !== today ? (
          <Button type="button" size="xs" variant="ghost" className="h-7" onClick={() => onChange(today)}>
            Today
          </Button>
        ) : null}
        {value ? (
          <Button type="button" size="xs" variant="ghost" className="h-7" onClick={() => onChange(null)}>
            Clear date
          </Button>
        ) : null}
      </div>
    </div>
  );
}
