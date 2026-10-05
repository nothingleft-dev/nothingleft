'use client';

import { useId, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Command, CommandItem, CommandList } from '@components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { cn } from '@lib/utils';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  hint: string;
}

interface ChoiceSelectProps<T extends string> {
  value: T;
  options: readonly ChoiceOption<T>[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
  showHint?: boolean;
  /** For a row that names the choice itself: the label stays for screen readers only. */
  hideLabel?: boolean;
  className?: string;
}

// A Command in a Popover, never a <select> — CLAUDE.md rule 10. Each choice carries a
// line of its own because "Contributor" alone does not say what it can do.
export function ChoiceSelect<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
  showHint,
  hideLabel,
  className,
}: ChoiceSelectProps<T>) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span id={`${id}-label`} className={cn('text-sm font-medium text-text-secondary', hideLabel && 'sr-only')}>
        {label}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-labelledby={`${id}-label`}
            aria-describedby={showHint ? `${id}-hint` : undefined}
            disabled={disabled}
            className="justify-between"
          >
            <span className="truncate">{selected?.label ?? 'Choose a role'}</span>
            <ChevronsUpDown className="size-icon-sm shrink-0 text-text-muted" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-(--radix-popover-trigger-width) min-w-[min(280px,calc(100vw-32px))] max-w-[calc(100vw-32px)] p-0"
          align="start"
        >
          <Command>
            <CommandList>
              {options.map(option => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className="items-start"
                >
                  <Check className={cn('mt-0.5 size-icon-sm', option.value === value ? 'opacity-100' : 'opacity-0')} />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium">{option.label}</span>
                    <span className="text-xs text-text-muted">{option.hint}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {showHint && selected ? (
        <p id={`${id}-hint`} className="text-sm text-text-secondary">
          {selected.hint}
        </p>
      ) : null}
    </div>
  );
}
