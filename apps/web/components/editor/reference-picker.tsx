'use client';

import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import type { IssueRef, MemberRef } from '@nothingleft/types';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@components/ui/command';
import { Popover, PopoverAnchor, PopoverContent } from '@components/ui/popover';
import { IssueKey } from '@components/issue-key';
import { PickerSkeleton } from '@components/issues/pickers';
import { MemberAvatar } from '@components/issues/member-avatar';
import { TypeBadge } from '@components/issues/value-marks';
import { useDebounced } from '@hooks/use-debounced';
import { useIssueRefSearch } from '@hooks/use-issues';
import { useProjectAssignees } from '@hooks/use-projects';

export type ReferenceTrigger = '@' | '#';

export interface ReferenceQuery {
  trigger: ReferenceTrigger;
  query: string;
  rect: () => DOMRect | null;
  /** Replaces the typed trigger and query with the chosen text. */
  insert: (text: string) => void;
}

export interface ReferencePickerHandle {
  /** True when the picker used the key, so the editor must not. */
  keyDown: (event: KeyboardEvent) => boolean;
}

interface Option {
  value: string;
  insert: string;
  person?: MemberRef;
  issue?: IssueRef;
}

const PEOPLE_SHOWN = 8;

interface ReferencePickerProps {
  state: ReferenceQuery | null;
  projectKey: string | null;
  onClose: () => void;
}

export const ReferencePicker = forwardRef<ReferencePickerHandle, ReferencePickerProps>(function ReferencePicker(
  { state, projectKey, onClose },
  handle,
) {
  const trigger = state?.trigger ?? null;
  const query = state?.query ?? '';
  const debounced = useDebounced(query, 200);
  const people = useProjectAssignees(trigger === '@' ? projectKey : null);
  const issues = useIssueRefSearch(debounced, projectKey, trigger === '#');

  const options = useMemo<Option[]>(() => {
    if (trigger === '@') {
      const q = query.toLowerCase();
      return (people.data ?? [])
        .filter(p => p.username.includes(q) || p.name.toLowerCase().includes(q))
        .slice(0, PEOPLE_SHOWN)
        .map(p => ({ value: `@${p.username}`, insert: `@${p.username}`, person: p }));
    }
    if (trigger === '#') {
      return (issues.data ?? []).map(i => ({ value: i.key, insert: i.key, issue: i }));
    }
    return [];
  }, [trigger, query, people.data, issues.data]);

  // The highlight starts over whenever the query does.
  const queryKey = `${trigger}${query}`;
  const [highlight, setHighlight] = useState({ queryKey, index: 0 });
  const active = highlight.queryKey === queryKey ? Math.min(highlight.index, Math.max(0, options.length - 1)) : 0;
  const setActive = (next: number | ((index: number) => number)) =>
    setHighlight({ queryKey, index: typeof next === 'function' ? next(active) : next });

  const loading = trigger === '@' ? people.isPending : issues.isPending;
  // The list on screen is for an older query until the debounced search answers.
  const settling = loading || (trigger === '#' && (debounced !== query || issues.isPlaceholderData));

  useImperativeHandle(handle, () => ({
    keyDown: event => {
      if (!state) return false;
      if (event.key === 'Escape') {
        onClose();
        return true;
      }
      const navigation = ['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(event.key);
      // Still asking: a key meant for the list must not fall through to the text, or Tab to the next button.
      if (settling && navigation) return true;
      if (options.length === 0) return false;
      if (event.key === 'ArrowDown') {
        setActive(i => (i + 1) % options.length);
        return true;
      }
      if (event.key === 'ArrowUp') {
        setActive(i => (i - 1 + options.length) % options.length);
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const option = options[active];
        if (option) state.insert(option.insert);
        return true;
      }
      return false;
    },
  }));

  const rect = state?.rect() ?? null;

  return (
    <Popover open={state !== null && rect !== null} onOpenChange={open => (open ? null : onClose())}>
      <PopoverAnchor virtualRef={{ current: { getBoundingClientRect: () => rect ?? new DOMRect() } }} />
      {state ? (
        <PopoverContent
          align="start"
          side="bottom"
          className="w-80 p-0"
          onOpenAutoFocus={e => e.preventDefault()}
          onCloseAutoFocus={e => e.preventDefault()}
          // Clicking back into the text is what closes it; the editor keeps focus throughout.
          onInteractOutside={onClose}
        >
          <Command shouldFilter={false} value={options[active]?.value ?? ''}>
            <CommandList>
              {loading ? (
                <PickerSkeleton rows={3} />
              ) : (
                <CommandEmpty>
                  {trigger === '@' ? 'Nobody in this project matches.' : 'No issue matches that key or title.'}
                </CommandEmpty>
              )}
              {options.length > 0 ? (
                <CommandGroup heading={trigger === '@' ? 'Mention someone' : 'Link an issue'}>
                  {options.map((option, index) => (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      onMouseMove={() => setActive(index)}
                      onMouseDown={e => e.preventDefault()}
                      onSelect={() => state.insert(option.insert)}
                    >
                      {option.person ? <PersonOption person={option.person} /> : null}
                      {option.issue ? <IssueOption issue={option.issue} /> : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
          <div className="flex items-center gap-3 border-t px-3 py-1.5 text-2xs text-text-muted">
            <span>↑↓ to move</span>
            <span>↵ or ⇥ to insert</span>
            <span>esc to close</span>
          </div>
        </PopoverContent>
      ) : null}
    </Popover>
  );
});

function PersonOption({ person }: { person: MemberRef }) {
  return (
    <>
      <MemberAvatar member={person} className="size-5" />
      <span className="min-w-0 flex-1 truncate">{person.name}</span>
      <span className="text-xs text-text-muted">@{person.username}</span>
    </>
  );
}

function IssueOption({ issue }: { issue: IssueRef }) {
  return (
    <>
      <TypeBadge type={issue.type} />
      <IssueKey issueKey={issue.key} resolved={issue.resolved} className="flex-none" />
      <span className={issue.resolved ? 'min-w-0 flex-1 truncate text-text-muted' : 'min-w-0 flex-1 truncate'}>
        {issue.title}
      </span>
    </>
  );
}
