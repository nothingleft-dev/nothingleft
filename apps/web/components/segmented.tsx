'use client';

import { cn } from '@lib/utils';

interface SegmentedProps<T extends string> {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange?: (value: T) => void;
  ariaLabel: string;
}

export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex max-w-full flex-wrap items-center gap-1"
      onKeyDown={event => {
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
        const index = buttons.indexOf(event.target as HTMLButtonElement);
        if (index < 0) return;
        const next =
          event.key === 'ArrowRight'
            ? (index + 1) % buttons.length
            : event.key === 'ArrowLeft'
              ? (index - 1 + buttons.length) % buttons.length
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? buttons.length - 1
                  : -1;
        if (next < 0) return;
        event.preventDefault();
        buttons[next]?.focus();
        const option = options[next];
        if (option) onChange?.(option.value);
      }}
    >
      {options.map(o => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          onClick={() => onChange?.(o.value)}
          className={cn(
            'h-control shrink-0 rounded-sm px-3 font-medium text-text-secondary hover:bg-hover hover:text-text',
            o.value === value && 'bg-active text-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
