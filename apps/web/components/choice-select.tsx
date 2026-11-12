'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { Button } from '@components/ui/button';
import { CommandList } from '@components/ui/command';
import { PickerCommand, PickerItem } from '@components/picker';
import { Popover, PopoverContent, PopoverTrigger } from '@components/popover';
import { cn } from '@lib/utils';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  hint: string;
  /** Drawn before the label in the list and the trigger: a project's mark. */
  mark?: ReactNode;
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
            <span className="flex min-w-0 items-center gap-2">
              {selected?.mark}
              <span className="truncate">{selected?.label ?? 'Choose a role'}</span>
            </span>
            <ChevronsUpDown className="size-icon-sm shrink-0 text-text-muted" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-(--radix-popover-trigger-width) min-w-[min(280px,calc(100vw-32px))] max-w-[calc(100vw-32px)] p-0"
          align="start"
        >
          <PickerCommand>
            <CommandList>
              {options.map(option => (
                <PickerItem
                  key={option.value}
                  value={option.value}
                  checked={option.value === value}
                  checkClassName="mt-0.5"
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className="items-start"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex items-center gap-2 font-medium">
                      {option.mark}
                      {option.label}
                    </span>
                    <span className="text-xs text-text-muted">{option.hint}</span>
                  </span>
                </PickerItem>
              ))}
            </CommandList>
          </PickerCommand>
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
