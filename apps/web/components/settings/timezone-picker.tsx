'use client';

import { useMemo, useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { Button } from '@components/ui/button';
import { CommandEmpty, CommandInput, CommandList } from '@components/ui/command';
import { PickerCommand, PickerItem } from '@components/picker';
import { Popover, PopoverContent, PopoverTrigger } from '@components/popover';
import {
  canonicalTimeZone,
  formatDateTimeWithZone,
  supportedTimeZones,
  viewerTimeZone,
  zoneOffset,
} from '@lib/datetime';

interface TimezonePickerProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

interface Zone {
  id: string;
  city: string;
  region: string;
  /** `UTC+05:30`; `UTC` at zero. */
  offset: string;
  minutes: number;
}

function describeZone(id: string, now: Date): Zone {
  const parts = id.split('/').map(p => p.replace(/_/g, ' '));
  const city = parts.at(-1) ?? id;
  const { label, minutes } = zoneOffset(id, now);
  return { id, city, region: parts.slice(0, -1).join(' / '), offset: label, minutes };
}

export const zoneLabel = (id: string) => {
  const zone = describeZone(id, new Date());
  return `${zone.city} (${zone.offset})`;
};

// A Command in a Popover rather than a <select>: 400+ zones need a search field.
export function TimezonePicker({ value, onChange, disabled }: TimezonePickerProps) {
  const [open, setOpen] = useState(false);
  const device = viewerTimeZone();
  const zones = useMemo(() => {
    if (!open) return [];
    const now = new Date();
    const pinned = [value, device];
    const byCanonical = new Map<string, string>();
    for (const id of [...pinned, ...supportedTimeZones()]) {
      const canonical = canonicalTimeZone(id);
      if (!byCanonical.has(canonical)) byCanonical.set(canonical, id);
    }
    const all = [...byCanonical.values()].map(id => describeZone(id, now));
    all.sort((a, b) => a.minutes - b.minutes || a.city.localeCompare(b.city));
    const first = new Set(pinned.map(id => byCanonical.get(canonicalTimeZone(id))));
    return [...all.filter(z => first.has(z.id)), ...all.filter(z => !first.has(z.id))];
  }, [open, value, device]);
  const deviceId = useMemo(() => (open ? canonicalTimeZone(device) : ''), [open, device]);

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
          <span className="truncate">{zoneLabel(value)}</span>
          <ChevronsUpDown className="size-icon-sm shrink-0 text-text-muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-[320px] p-0" align="start">
        <PickerCommand>
          <CommandInput placeholder="Search time zones…" />
          <CommandList>
            <CommandEmpty>No zone matches that.</CommandEmpty>
            {zones.map(zone => (
              <PickerItem
                checked={zone.id === value}
                key={zone.id}
                value={zone.id}
                keywords={[zone.city, zone.region, zone.offset]}
                onSelect={() => {
                  onChange(zone.id);
                  setOpen(false);
                }}
              >
                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                  <span className="truncate">{zone.city}</span>
                  {zone.region ? <span className="truncate text-xs text-text-secondary">{zone.region}</span> : null}
                </span>
                {canonicalTimeZone(zone.id) === deviceId ? (
                  <span className="shrink-0 text-2xs text-text-secondary">this device</span>
                ) : null}
                <span className="w-20 shrink-0 text-right text-xs text-text-secondary tabular">{zone.offset}</span>
              </PickerItem>
            ))}
          </CommandList>
        </PickerCommand>
      </PopoverContent>
    </Popover>
  );
}

export function ZoneExample({ timeZone }: { timeZone: string }) {
  return (
    <span className="text-xs text-text-secondary">Times read as {formatDateTimeWithZone(new Date(), timeZone)}</span>
  );
}
