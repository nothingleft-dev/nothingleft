'use client';

import { useId, useRef, useState } from 'react';
import { cn } from '@lib/utils';

export const CODE_LENGTH = 6;

interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called once the last digit lands, typed or pasted. */
  onComplete?: (value: string) => void;
  error?: string | undefined;
  disabled?: boolean;
  autoFocus?: boolean;
  label: string;
}

/**
 * Six cells drawn over one real input, so paste, the OS one-time-code autofill, backspace
 * and selection all behave as they do in any text field. The cells only mirror its value.
 */
export function CodeInput({ value, onChange, onComplete, error, disabled, autoFocus, label }: CodeInputProps) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const caret = Math.min(value.length, CODE_LENGTH - 1);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative" onClick={() => ref.current?.focus()}>
        <input
          ref={ref}
          id={id}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus={autoFocus}
          disabled={disabled}
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={event => {
            const digits = event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH);
            onChange(digits);
            if (digits.length === CODE_LENGTH && digits !== value) onComplete?.(digits);
          }}
          // The caret always sits after the last digit, so a click on any cell edits the end.
          onSelect={event => {
            const input = event.currentTarget;
            input.setSelectionRange(input.value.length, input.value.length);
          }}
          className="absolute inset-0 z-10 w-full cursor-text bg-transparent text-transparent caret-transparent outline-none focus-visible:shadow-none disabled:cursor-not-allowed"
        />
        <div aria-hidden className="grid grid-cols-6 gap-2">
          {Array.from({ length: CODE_LENGTH }, (_, index) => {
            const active = focused && index === caret;
            return (
              <div
                key={index}
                className={cn(
                  'grid h-12 place-items-center rounded-md border border-border-strong bg-surface font-mono text-xl text-text tabular transition-colors',
                  active && 'shadow-(--focus-ring)',
                  error && 'border-danger-fg',
                  disabled && 'opacity-50',
                )}
              >
                {value[index] ?? (active ? <span className="h-5 w-px animate-pulse bg-text" /> : null)}
              </div>
            );
          })}
        </div>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
