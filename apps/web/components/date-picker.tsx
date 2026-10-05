'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { formatCalendarDate } from '@lib/datetime';
import { cn } from '@lib/utils';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/** Monday-first offset for the 1st of the month. */
const leadingBlanks = (year: number, month: number) => (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;

const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

interface DatePickerProps {
  label: string;
  /** `YYYY-MM-DD`, never an instant: calendar dates are not timezone-converted. */
  value: string | null;
  onChange: (value: string | null) => void;
}

interface DatePickerProps {
  label: string;
  /** `YYYY-MM-DD`, never an instant: calendar dates are not timezone-converted. */
  value: string | null;
  onChange: (value: string | null) => void;
}

export function DatePicker({ label, value, onChange }: DatePickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`${label} date`}>
          <span className="text-text-muted">{label}</span>
          <span>{value ? formatCalendarDate(value) : 'any'}</span>
          {value ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label={`Clear ${label.toLowerCase()} date`}
              onClick={event => {
                event.stopPropagation();
                onChange(null);
              }}
              className="text-text-muted hover:text-text"
            >
              <X className="size-3" />
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[260px] p-3" align="start">
        <MonthGrid
          value={value}
          onSelect={next => {
            onChange(next);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

interface MonthGridProps {
  value: string | null;
  onSelect: (value: string) => void;
  /** Marks both ends and shades the days between; `value` is ignored when given. */
  range?: { from: string | null; to: string | null };
}

/** The calendar body alone, for callers that own their trigger (the issue sidebar, the create dialog). */
export function MonthGrid({ value, onSelect, range }: MonthGridProps) {
  const today = useMemo(() => new Date(), []);
  const anchor = range ? (range.to ?? range.from) : value;
  const parsed = anchor ? anchor.split('-').map(Number) : null;
  const [cursor, setCursor] = useState(() => ({
    year: parsed?.[0] ?? today.getFullYear(),
    month: (parsed?.[1] ?? today.getMonth() + 1) - 1,
  }));

  const step = (by: number) => {
    const next = cursor.month + by;
    setCursor({ year: cursor.year + Math.floor(next / 12), month: ((next % 12) + 12) % 12 });
  };

  const todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Button variant="ghost" size="icon-xs" aria-label="Previous month" onClick={() => step(-1)}>
          <ChevronLeft className="size-icon-sm" />
        </Button>
        <span className="font-medium">
          {MONTHS[cursor.month]} {cursor.year}
        </span>
        <Button variant="ghost" size="icon-xs" aria-label="Next month" onClick={() => step(1)}>
          <ChevronRight className="size-icon-sm" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map(day => (
          <span key={day} className="py-1 text-2xs font-medium text-text-muted">
            {day}
          </span>
        ))}

        {Array.from({ length: leadingBlanks(cursor.year, cursor.month) }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}

        {Array.from({ length: daysIn(cursor.year, cursor.month) }, (_, i) => {
          const day = i + 1;
          const dayIso = iso(cursor.year, cursor.month, day);
          const selected = range ? dayIso === range.from || dayIso === range.to : dayIso === value;
          const between = range?.from && range.to ? dayIso > range.from && dayIso < range.to : false;

          return (
            <button
              key={day}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(dayIso)}
              className={cn(
                'grid h-7 place-items-center rounded-sm text-xs tabular hover:bg-hover',
                between && 'bg-active',
                dayIso === todayIso && !selected && 'font-semibold text-brand-text',
                selected && 'bg-ink font-medium text-ink-fg hover:bg-ink',
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
