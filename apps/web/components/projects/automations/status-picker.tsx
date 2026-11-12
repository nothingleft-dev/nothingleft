'use client';

import { useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { Button } from '@components/ui/button';
import { CommandEmpty, CommandInput, CommandList } from '@components/ui/command';
import { PickerCommand, PickerItem } from '@components/picker';
import { Popover, PopoverContent, PopoverTrigger } from '@components/popover';
import { PickerSkeleton } from '@components/issues/pickers';
import { StatusDot } from '@components/issues/value-marks';
import { useSchemaValues } from '@hooks/use-project-schema';
import { cn } from '@lib/utils';

export const OFF = '—';

interface StatusPickerProps {
  projectKey: string;
  value: string | null;
  onChange: (status: string | null) => void;
  /** Offers *— (off)* first; choosing it hands back null. */
  allowOff?: boolean;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  label: string;
  className?: string;
}

/** A project status by name, the archived ones left out: what an automation sets. */
export function StatusPicker({
  projectKey,
  value,
  onChange,
  allowOff = false,
  placeholder = 'Pick a status',
  disabled,
  invalid,
  label,
  className,
}: StatusPickerProps) {
  const [open, setOpen] = useState(false);
  const statuses = useSchemaValues(projectKey, 'statuses');
  const live = (statuses.data ?? []).filter(s => !s.is_archived);
  const current = live.find(s => s.name.toLowerCase() === value?.toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          aria-invalid={invalid}
          disabled={disabled}
          className={cn('w-44 justify-between font-normal', className)}
        >
          <span className="flex min-w-0 items-center gap-2">
            {current ? <StatusDot category={current.category} color={current.color} /> : null}
            <span className={cn('truncate', !value && 'text-text-muted', value && !current && 'text-danger-fg')}>
              {value ?? (allowOff ? `${OFF} off` : placeholder)}
            </span>
          </span>
          <ChevronsUpDown className="size-icon-sm shrink-0 text-text-muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-0">
        <PickerCommand>
          <CommandInput placeholder="Find a status" />
          <CommandList>
            {statuses.isPending ? <PickerSkeleton /> : <CommandEmpty>No status matches.</CommandEmpty>}
            {allowOff ? (
              <PickerItem
                checked={value === null}
                value={`${OFF} off`}
                onSelect={() => {
                  setOpen(false);
                  onChange(null);
                }}
              >
                <span className="min-w-0 flex-1 text-text-secondary">{OFF} off</span>
              </PickerItem>
            ) : null}
            {live.map(status => (
              <PickerItem
                checked={status.name === current?.name}
                key={status.name}
                value={status.name}
                onSelect={() => {
                  setOpen(false);
                  onChange(status.name);
                }}
              >
                <StatusDot category={status.category} color={status.color} />
                <span className="min-w-0 flex-1 truncate">{status.name}</span>
              </PickerItem>
            ))}
          </CommandList>
        </PickerCommand>
      </PopoverContent>
    </Popover>
  );
}
