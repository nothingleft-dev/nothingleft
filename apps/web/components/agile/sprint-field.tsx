'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { STORY_POINTS_MAX, type Sprint } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@components/ui/command';
import { PickerSkeleton } from '@components/issues/pickers';
import { sprintDatesLabel } from '@components/agile/sprint-dates';
import { cn } from '@lib/utils';

export const UNSCHEDULED = 'Unscheduled';
export const NOT_ESTIMATED = 'Not estimated';

/** Sprints an issue can go into: the active one first, then the planned; completed ones take no issues. */
export const assignableSprints = (sprints: readonly Sprint[]) => [
  ...sprints.filter(s => s.state === 'active'),
  ...sprints.filter(s => s.state === 'planned'),
];

interface SprintCommandProps {
  sprints: readonly Sprint[];
  selected: string | null;
  loading?: boolean;
  onSelect: (slug: string | null) => void;
}

export function SprintCommand({ sprints, selected, loading = false, onSelect }: SprintCommandProps) {
  const options = assignableSprints(sprints);
  return (
    <Command>
      <CommandInput placeholder="Move to sprint" />
      <CommandList>
        {loading ? <PickerSkeleton rows={3} /> : <CommandEmpty>No sprint matches.</CommandEmpty>}
        {options.map(sprint => (
          <CommandItem key={sprint.slug} value={`${sprint.name} ${sprint.slug}`} onSelect={() => onSelect(sprint.slug)}>
            <span className="min-w-0 flex-1 truncate">{sprint.name}</span>
            <span className="text-2xs text-text-muted">
              {sprint.state === 'active' ? 'Active' : sprintDatesLabel(sprint)}
            </span>
            <Check className={cn('size-icon-sm', sprint.slug === selected ? 'opacity-100' : 'opacity-0')} />
          </CommandItem>
        ))}
        {loading ? null : (
          <CommandItem value={UNSCHEDULED} onSelect={() => onSelect(null)}>
            <span className="min-w-0 flex-1 truncate text-text-secondary">{UNSCHEDULED}</span>
            <span className="text-2xs text-text-muted">Backlog</span>
            <Check className={cn('size-icon-sm', selected === null ? 'opacity-100' : 'opacity-0')} />
          </CommandItem>
        )}
      </CommandList>
    </Command>
  );
}

interface StoryPointsEditorProps {
  value: number | null;
  error?: string | null;
  onSave: (points: number | null) => void;
}

export function StoryPointsEditor({ value, error, onSave }: StoryPointsEditorProps) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const trimmed = text.trim();
  const points = /^\d{1,3}$/.test(trimmed) ? Number(trimmed) : null;
  const invalid = trimmed !== '' && (points === null || points > STORY_POINTS_MAX);

  return (
    <form
      noValidate
      className="flex flex-col gap-2 p-3"
      onSubmit={event => {
        event.preventDefault();
        event.stopPropagation();
        if (!invalid) onSave(points);
      }}
    >
      <label htmlFor="story-points-input" className="text-2xs font-medium text-text-secondary">
        Story points
      </label>
      <input
        id="story-points-input"
        autoFocus
        inputMode="numeric"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="3"
        aria-invalid={invalid || Boolean(error)}
        className="h-control w-full rounded-md border border-border-strong bg-surface px-2 font-mono text-xs text-text tabular placeholder:text-text-muted aria-invalid:border-danger-fg"
      />
      <p className={cn('text-2xs', invalid || error ? 'text-danger-fg' : 'text-text-secondary')}>
        {error ??
          (invalid
            ? `A whole number from 0 to ${STORY_POINTS_MAX}.`
            : trimmed === ''
              ? 'Empty clears the points.'
              : `A whole number from 0 to ${STORY_POINTS_MAX}.`)}
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
