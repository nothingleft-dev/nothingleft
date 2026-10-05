'use client';

import { useId, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { EmailSchema } from '@nothingleft/types';
import { cn } from '@lib/utils';

const SEPARATORS = /[\s,;]+/;

interface EmailChipsProps {
  value: string[];
  onChange: (value: string[]) => void;
  max: number;
  disabled?: boolean;
  invalid?: Record<string, string>;
}

export function EmailChips({ value, onChange, max, disabled, invalid = {} }: EmailChipsProps) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [rejected, setRejected] = useState<string[]>([]);

  const commit = (raw: string) => {
    const candidates = raw.split(SEPARATORS).filter(Boolean);
    if (candidates.length === 0) return;

    const accepted: string[] = [];
    const bad: string[] = [];
    for (const candidate of candidates) {
      const parsed = EmailSchema.safeParse(candidate);
      if (!parsed.success) bad.push(candidate);
      else if (!value.includes(parsed.data) && !accepted.includes(parsed.data)) accepted.push(parsed.data);
    }

    onChange([...value, ...accepted].slice(0, max));
    setRejected(bad);
    setDraft(bad.join(' '));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === ' ') {
      if (draft.trim() === '') return;
      event.preventDefault();
      commit(draft);
      return;
    }
    if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text');
    if (!SEPARATORS.test(text)) return;
    event.preventDefault();
    commit(text);
  };

  const full = value.length >= max;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text-secondary">
        Email addresses
      </label>

      <div
        className={cn(
          'flex min-h-control flex-wrap items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2 py-1.5',
          'focus-within:border-border-strong focus-within:shadow-(--focus-ring)',
          disabled && 'opacity-50',
        )}
      >
        {value.map(email => {
          const problem = invalid[email];
          return (
            <span
              key={email}
              title={problem}
              className={cn(
                'inline-flex h-6 items-center gap-1 rounded-sm border px-2 text-xs',
                problem ? 'border-danger-fg/30 bg-danger-bg text-danger-fg' : 'bg-inset text-text-secondary',
              )}
            >
              <span className="max-w-[220px] truncate">{email}</span>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove ${email}`}
                onClick={() => onChange(value.filter(e => e !== email))}
                className="text-text-muted hover:text-text"
              >
                <X className="size-3" />
              </button>
            </span>
          );
        })}

        <input
          id={id}
          value={draft}
          disabled={disabled || full}
          onChange={e => {
            setDraft(e.target.value);
            setRejected([]);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => commit(draft)}
          placeholder={value.length === 0 ? 'jordan@company.com, sam@company.com' : full ? '' : 'Add another'}
          className="h-6 min-w-[180px] flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
        />
      </div>

      {rejected.length > 0 ? (
        <p className="text-xs text-danger-fg">
          {rejected.length === 1 ? 'That is not an email address' : 'Those are not email addresses'}:{' '}
          {rejected.join(', ')}
        </p>
      ) : (
        <p className="text-sm text-text-secondary">
          {full
            ? `That is the limit of ${max} at a time.`
            : `Separate them with a comma, a space or Enter. Up to ${max} at a time.`}
        </p>
      )}
    </div>
  );
}
