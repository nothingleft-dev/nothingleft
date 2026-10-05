'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import type { MemberRef } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { MemberAvatar } from '@components/issues/member-avatar';
import { PickerSkeleton } from '@components/issues/pickers';
import { cn } from '@lib/utils';

interface MemberPickerProps {
  people: readonly MemberRef[];
  value: string | null;
  onChange: (username: string) => void;
  placeholder: string;
  label: string;
  loading?: boolean;
  disabled?: boolean;
}

export function MemberPicker({ people, value, onChange, placeholder, label, loading, disabled }: MemberPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = people.find(p => p.username === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          disabled={disabled}
          className="w-full min-w-0 justify-between font-normal"
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <MemberAvatar member={selected} />
              <span className="truncate">{selected.name}</span>
            </span>
          ) : (
            <span className="truncate text-text-muted">{placeholder}</span>
          )}
          <ChevronsUpDown className="size-icon-sm shrink-0 text-text-muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 max-w-[calc(100vw-32px)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search people" />
          <CommandList>
            {loading ? <PickerSkeleton /> : <CommandEmpty>Nobody matches.</CommandEmpty>}
            {people.map(person => (
              <CommandItem
                key={person.username}
                value={`${person.name} ${person.username}`}
                onSelect={() => {
                  onChange(person.username);
                  setOpen(false);
                }}
              >
                <MemberAvatar member={person} />
                <span className="min-w-0 flex-1 truncate">{person.name}</span>
                <span className="truncate font-mono text-2xs text-text-muted">@{person.username}</span>
                <Check className={cn('size-icon-sm', person.username === value ? 'opacity-100' : 'opacity-0')} />
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
