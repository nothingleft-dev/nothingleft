'use client';

import { Fragment, useState, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { PickerSkeleton } from '@components/issues/pickers';
import { cn } from '@lib/utils';

export interface ReportOption {
  value: string;
  label: string;
  group?: string;
  mark?: ReactNode;
}

interface BaseProps {
  label: string;
  options: readonly ReportOption[];
  loading?: boolean;
  searchable?: boolean;
  width?: string;
  disabled?: boolean;
}

interface SingleProps extends BaseProps {
  value: string;
  onChange: (value: string) => void;
  fallback?: string;
}

interface MultiProps extends BaseProps {
  values: readonly string[];
  onChange: (values: string[]) => void;
  /** What the trigger reads when nothing is chosen: `All projects`, `Me`. */
  none: string;
  many: (count: number) => string;
  clearLabel: string;
}

function Trigger({ label, text, disabled }: { label: string; text: string; disabled?: boolean }) {
  return (
    <PopoverTrigger asChild>
      <Button
        variant="outline"
        size="xs"
        className="max-w-full gap-1.5 font-normal text-text-secondary"
        disabled={disabled}
      >
        {label} <span className="max-w-48 truncate font-medium text-text">{text}</span>
        <ChevronDown className="size-3 text-text-muted" />
      </Button>
    </PopoverTrigger>
  );
}

function grouped(options: readonly ReportOption[]) {
  const groups = new Map<string, ReportOption[]>();
  for (const option of options) {
    const key = option.group ?? '';
    groups.set(key, [...(groups.get(key) ?? []), option]);
  }
  return [...groups.entries()];
}

function Options({
  options,
  loading,
  searchable,
  isSelected,
  onSelect,
  lead,
}: {
  options: readonly ReportOption[];
  loading?: boolean;
  searchable?: boolean;
  isSelected: (value: string) => boolean;
  onSelect: (value: string) => void;
  lead?: ReactNode;
}) {
  return (
    <Command>
      {searchable ? <CommandInput placeholder="Filter…" /> : null}
      <CommandList className="max-h-[min(60vh,360px)]">
        {loading ? <PickerSkeleton /> : <CommandEmpty>Nothing matches.</CommandEmpty>}
        {lead}
        {loading
          ? null
          : grouped(options).map(([heading, list], index) => (
              <Fragment key={heading || index}>
                {index > 0 || lead ? <CommandSeparator /> : null}
                <CommandGroup heading={heading || undefined}>
                  {list.map(option => (
                    <CommandItem
                      key={option.value}
                      value={`${option.label} ${option.value}`}
                      onSelect={() => onSelect(option.value)}
                    >
                      {option.mark}
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      <Check className={cn('size-icon-sm', isSelected(option.value) ? 'opacity-100' : 'opacity-0')} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Fragment>
            ))}
      </CommandList>
    </Command>
  );
}

/** A report parameter with one value: a Command in a Popover, never a `<select>`. */
export function ReportPicker({ label, value, options, onChange, fallback, width = 'w-60', ...rest }: SingleProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Trigger label={label} text={selected?.label ?? fallback ?? value} disabled={rest.disabled} />
      <PopoverContent align="start" className={cn('max-w-[calc(100vw-32px)] p-0', width)}>
        <Options
          {...rest}
          options={options}
          isSelected={v => v === value}
          onSelect={v => {
            onChange(v);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Several values, applied as they are ticked; the first row clears them. */
export function ReportMultiPicker({
  label,
  values,
  options,
  onChange,
  none,
  many,
  clearLabel,
  width = 'w-64',
  ...rest
}: MultiProps) {
  const labels = values.map(v => options.find(o => o.value === v)?.label ?? v);
  const text = values.length === 0 ? none : values.length <= 2 ? labels.join(', ') : many(values.length);
  const toggle = (value: string) =>
    onChange(values.includes(value) ? values.filter(v => v !== value) : [...values, value]);
  return (
    <Popover>
      <Trigger label={label} text={text} disabled={rest.disabled} />
      <PopoverContent align="start" className={cn('max-w-[calc(100vw-32px)] p-0', width)}>
        <Options
          {...rest}
          options={options}
          isSelected={v => values.includes(v)}
          onSelect={toggle}
          lead={
            <CommandGroup>
              <CommandItem value={`__clear ${clearLabel}`} onSelect={() => onChange([])}>
                <span className="min-w-0 flex-1 truncate">{clearLabel}</span>
                <Check className={cn('size-icon-sm', values.length === 0 ? 'opacity-100' : 'opacity-0')} />
              </CommandItem>
            </CommandGroup>
          }
        />
      </PopoverContent>
    </Popover>
  );
}
