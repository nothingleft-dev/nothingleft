'use client';

import { Fragment, useState, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@components/ui/button';
import { CommandEmpty, CommandGroup, CommandInput, CommandList, CommandSeparator } from '@components/ui/command';
import { PickerCommand, PickerItem } from '@components/picker';
import { Popover, PopoverContent, PopoverTrigger } from '@components/popover';
import { PickerSkeleton } from '@components/issues/pickers';
import { cn } from '@lib/utils';

export interface ReportOption {
  value: string;
  label: string;
  group?: string;
  mark?: ReactNode;
  /** A short code after the name, such as a project key: `Billing  BIL`. */
  hint?: string;
}

interface BaseProps {
  label: string;
  options: readonly ReportOption[];
  loading?: boolean;
  searchable?: boolean;
  filterPlaceholder?: string;
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
  /** Sits where the options' marks sit, so the clear row's label starts on their edge. */
  clearMark?: ReactNode;
}

function Trigger({
  label,
  text,
  marks,
  disabled,
}: {
  label: string;
  text: string;
  /** The chosen options' own marks, so a value reads the same in the trigger as in the list. */
  marks?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <PopoverTrigger asChild>
      <Button
        variant="outline"
        size="xs"
        className="max-w-full gap-1.5 font-normal text-text-secondary"
        disabled={disabled}
      >
        {label}
        {marks ? <span className="-mr-0.5 flex items-center gap-0.5">{marks}</span> : null}
        <span className="max-w-48 truncate font-medium text-text" title={text}>
          {text}
        </span>
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

/** A multi-select row's box in the trailing column: empty until ticked, ink-filled when it is. */
function Tick({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'ml-auto grid size-4 flex-none place-items-center rounded-[4px] border border-border-strong',
        checked && 'border-text bg-text text-surface',
      )}
    >
      {checked ? <Check className="size-3 text-surface" strokeWidth={3} /> : null}
    </span>
  );
}

function OptionRow({
  option,
  checked,
  multi,
  onSelect,
}: {
  option: ReportOption;
  checked: boolean;
  multi: boolean;
  onSelect: () => void;
}) {
  return (
    <PickerItem
      checked={checked}
      checkClassName={multi ? 'hidden' : undefined}
      value={`${option.label} ${option.hint ?? ''} ${option.value}`}
      onSelect={onSelect}
    >
      {option.mark}
      <span className="min-w-0 flex-1 truncate" title={option.label}>
        {option.label}
      </span>
      {option.hint ? <span className="flex-none font-mono text-xs text-text-secondary">{option.hint}</span> : null}
      {multi ? <Tick checked={checked} /> : null}
    </PickerItem>
  );
}

function Options({
  options,
  loading,
  searchable,
  filterPlaceholder = 'Filter…',
  isSelected,
  onSelect,
  lead,
  multi = false,
}: {
  options: readonly ReportOption[];
  loading?: boolean;
  searchable?: boolean;
  filterPlaceholder?: string;
  isSelected: (value: string) => boolean;
  onSelect: (value: string) => void;
  lead?: ReactNode;
  multi?: boolean;
}) {
  return (
    <PickerCommand>
      {searchable ? <CommandInput placeholder={filterPlaceholder} /> : null}
      {/* Ten and a half rows: the list stops mid-row only where it says there is more below. */}
      <CommandList className="max-h-[min(60vh,348px)]">
        {loading ? <PickerSkeleton /> : <CommandEmpty>Nothing matches.</CommandEmpty>}
        {lead}
        {loading
          ? null
          : grouped(options).map(([heading, list], index) => (
              <Fragment key={heading || index}>
                {index > 0 || lead ? <CommandSeparator /> : null}
                <CommandGroup heading={heading || undefined}>
                  {list.map(option => (
                    <OptionRow
                      key={option.value}
                      option={option}
                      checked={isSelected(option.value)}
                      multi={multi}
                      onSelect={() => onSelect(option.value)}
                    />
                  ))}
                </CommandGroup>
              </Fragment>
            ))}
      </CommandList>
    </PickerCommand>
  );
}

/** A report parameter with one value: a Command in a Popover, never a `<select>`. */
export function ReportPicker({ label, value, options, onChange, fallback, width = 'w-60', ...rest }: SingleProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Trigger
        label={label}
        text={selected?.label ?? fallback ?? value}
        marks={selected?.mark}
        disabled={rest.disabled}
      />
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
  clearMark,
  width = 'w-64',
  ...rest
}: MultiProps) {
  const chosen = values.map(v => options.find(o => o.value === v));
  const labels = chosen.map((o, i) => o?.label ?? values[i]!);
  const text = values.length === 0 ? none : values.length <= 2 ? labels.join(', ') : many(values.length);
  const marks =
    values.length > 0 && values.length <= 2 && chosen.every(o => o?.mark)
      ? chosen.map((o, i) => <Fragment key={values[i]}>{o!.mark}</Fragment>)
      : null;
  const toggle = (value: string) =>
    onChange(values.includes(value) ? values.filter(v => v !== value) : [...values, value]);
  return (
    <Popover>
      <Trigger label={label} text={text} marks={marks} disabled={rest.disabled} />
      <PopoverContent align="start" className={cn('max-w-[calc(100vw-32px)] p-0', width)}>
        <Options
          {...rest}
          multi
          options={options}
          isSelected={v => values.includes(v)}
          onSelect={toggle}
          lead={
            <CommandGroup>
              <PickerItem
                checked={values.length === 0}
                checkClassName="hidden"
                value={`__clear ${clearLabel}`}
                onSelect={() => onChange([])}
              >
                {clearMark}
                <span className="min-w-0 flex-1 truncate">{clearLabel}</span>
                <Tick checked={values.length === 0} />
              </PickerItem>
            </CommandGroup>
          }
        />
      </PopoverContent>
    </Popover>
  );
}
