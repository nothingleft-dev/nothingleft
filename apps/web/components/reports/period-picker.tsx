'use client';

import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
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

interface PeriodPickerProps {
  value: PeriodValue;
  /** The dates the API resolved the period to, shown beside its name. */
  resolved: { from: string; to: string } | null;
  onChange: (value: PeriodValue) => void;
}

export function PeriodPicker({ value, resolved, onChange }: PeriodPickerProps) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  const custom = value.from !== null && value.to !== null;
  const name = custom ? null : (value.period ?? DEFAULT_PERIOD);
  const dates = custom
    ? formatCalendarRange(value.from!, value.to!)
    : resolved
      ? formatCalendarRange(resolved.from, resolved.to)
      : null;

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
          {dates ? <span className="truncate tabular text-text-secondary">{dates}</span> : null}
          <ChevronDown className="size-3 text-text-muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[276px] max-w-[calc(100vw-32px)] p-1">
        <ul role="listbox" aria-label="Period" className="flex flex-col">
          {PERIOD_PRESETS.map(preset => (
            <li key={preset}>
              <button
                type="button"
                role="option"
                aria-selected={name === preset}
                onClick={() => pick(preset)}
                className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left hover:bg-hover"
              >
                <Check className={cn('size-icon-sm', name === preset ? 'opacity-100' : 'opacity-0')} />
                {preset}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-1 border-t px-2 pt-3 pb-2">
          <p className="mb-2 text-xs font-medium text-text-secondary">Custom range</p>
          <MonthGrid value={null} range={range} onSelect={pickDay} />
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
