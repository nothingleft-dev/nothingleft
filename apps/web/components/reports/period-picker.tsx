'use client';

import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@components/popover';
import { MonthGrid } from '@components/date-picker';
import { formatCalendarRange } from '@lib/datetime';
import { cn } from '@lib/utils';

// The query language's own period words (search-query-language.md), so the URL reads as typed.
export const PERIOD_PRESETS = ['This week', 'Last week', 'This month', 'Last month', 'This year'] as const;
export const DEFAULT_PERIOD = 'This week';

export interface PeriodValue {
  period: string | null;
  from: string | null;
  to: string | null;
}

interface Range {
  from: string;
  to: string;
}

interface PeriodPickerProps {
  value: PeriodValue;
  /** The dates the API resolved this exact period to; null while a response for it is still on its way. */
  resolved: Range | null;
  /** True while the figures for the chosen period are loading. */
  pending?: boolean;
  /** The presets this report accepts: one with a day limit leaves out the ones that always exceed it. */
  presets?: readonly string[];
  onChange: (value: PeriodValue) => void;
}

export function PeriodPicker({
  value,
  resolved,
  pending = false,
  presets = PERIOD_PRESETS,
  onChange,
}: PeriodPickerProps) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  const custom = value.from !== null && value.to !== null;
  const name = custom ? null : (value.period ?? DEFAULT_PERIOD);
  // A preset's dates only come back from the API, so ones already seen are kept to show while the next loads.
  const [seen, setSeen] = useState<Record<string, Range>>(() => (name && resolved ? { [name]: resolved } : {}));
  if (name && resolved && (seen[name]?.from !== resolved.from || seen[name]?.to !== resolved.to)) {
    setSeen({ ...seen, [name]: resolved });
  }
  const active: Range | null = custom ? { from: value.from!, to: value.to! } : name ? (seen[name] ?? resolved) : null;

  const pick = (period: string) => {
    onChange({ period: period === DEFAULT_PERIOD ? null : period, from: null, to: null });
    setOpen(false);
  };

  const pickDay = (day: string) => {
    if (!range.from || range.to) return setRange({ from: day, to: null });
    const [from, to] = day < range.from ? [day, range.from] : [range.from, day];
    setRange({ from, to });
  };

  return (
    <Popover
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (next) setRange(custom ? { from: value.from, to: value.to } : { from: null, to: null });
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="xs" className="max-w-full gap-1.5 font-normal text-text-secondary">
          Period <span className="font-medium text-text">{name ?? 'Custom'}</span>
          {active ? (
            <span className="truncate tabular text-text-secondary">{formatCalendarRange(active.from, active.to)}</span>
          ) : pending ? (
            <Skeleton className="h-3 w-[88px] rounded-xs" />
          ) : null}
          <ChevronDown className="size-3 text-text-muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[276px] max-w-[calc(100vw-32px)] p-1">
        <ul role="listbox" aria-label="Period" className="flex flex-col">
          {presets.map(preset => (
            <li key={preset}>
              <button
                type="button"
                role="option"
                aria-selected={name === preset}
                onClick={() => pick(preset)}
                className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left hover:bg-hover"
              >
                {preset}
                <Check className={cn('ml-auto size-icon-sm', name !== preset && 'invisible')} />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-1 border-t px-2 pt-3 pb-2">
          <p className="mb-2 text-xs font-medium text-text-secondary">Custom range</p>
          <MonthGrid value={null} range={range.from ? range : (active ?? range)} onSelect={pickDay} />
          <div className="mt-2 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs tabular text-text-secondary">
              {range.from && range.to
                ? formatCalendarRange(range.from, range.to)
                : range.from
                  ? 'Choose the last day'
                  : 'Choose the first day'}
            </span>
            <Button
              size="xs"
              disabled={!range.from || !range.to}
              onClick={() => {
                onChange({ period: null, from: range.from, to: range.to });
                setOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
