'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { formatDateTimeWithZone, supportedTimeZones, viewerTimeZone } from '@lib/datetime';
import { cn } from '@lib/utils';

interface TimezonePickerProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

// A Command in a Popover rather than a <select>: 400+ zones need a search field.
export function TimezonePicker({ value, onChange, disabled }: TimezonePickerProps) {
  const [open, setOpen] = useState(false);
  const zones = useMemo(() => {
    const all = supportedTimeZones();
    return all.includes(value) ? all : [value, ...all];
  }, [value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-label="Time zone"
          aria-expanded={open}
          disabled={disabled}
          className="justify-between"
        >
          <span className="truncate">{value}</span>
          <ChevronsUpDown className="size-icon-sm shrink-0 text-text-muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search time zones…" />
          <CommandList>
            <CommandEmpty>No zone matches that.</CommandEmpty>
            {zones.map(zone => (
              <CommandItem
                key={zone}
                value={zone}
                onSelect={() => {
                  onChange(zone);
                  setOpen(false);
                }}
              >
                <Check className={cn('size-icon-sm', zone === value ? 'opacity-100' : 'opacity-0')} />
                <span className="flex-1 truncate">{zone}</span>
                {zone === viewerTimeZone() ? <span className="text-2xs text-text-muted">this device</span> : null}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function ZoneExample({ timeZone }: { timeZone: string }) {
  return <span className="text-xs text-text-muted">Times read as {formatDateTimeWithZone(new Date(), timeZone)}</span>;
}
