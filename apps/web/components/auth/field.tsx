'use client';

import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Label } from '@components/ui/label';
import { cn } from '@lib/utils';

interface FieldProps extends Omit<ComponentProps<'input'>, 'id' | 'required' | 'minLength' | 'maxLength'> {
  label: string;
  hint?: string;
  error?: string | undefined;
  trailing?: ReactNode;
  below?: ReactNode;
}

// The focus ring is the one in globals.css, not a second one declared here: two
// treatments for the same state is how the app ended up with a loud ring on some
// controls and a quiet one on others.
const inputClass =
  'h-control w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text transition-colors ' +
  'placeholder:text-text-muted hover:border-border-strong focus:border-border-strong ' +
  'disabled:cursor-not-allowed disabled:opacity-50 read-only:cursor-default read-only:bg-inset read-only:text-text-secondary';

/**
 * Deliberately not shadcn's `Input`: these fields carry no `required`, `minLength` or
 * `pattern`, so the browser never puts its own tooltip on top of ours. Every message
 * below comes from the shared Zod schema or from the API (CLAUDE.md rule 10).
 */
export function Field({ label, hint, error, trailing, below, className, type, ...props }: FieldProps) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';
  const noteId = error || hint ? `${id}-note` : undefined;

  // `type="email"` is itself a native constraint: it makes the browser refuse a submit
  // with its own bubble. The keyboard hint is what we actually wanted, so keep that and
  // let the Zod schema decide what a valid address is.
  const inputType = type === 'email' ? 'text' : isPassword && revealed ? 'text' : type;
  const inputMode = type === 'email' ? 'email' : props.inputMode;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id} className="text-sm font-medium text-text-secondary">
          {label}
        </Label>
        {trailing}
      </div>

      <div className="relative">
        <input
          id={id}
          data-slot="form-input"
          type={inputType}
          aria-invalid={error ? true : undefined}
          aria-describedby={noteId}
          className={cn(
            inputClass,
            isPassword && 'pr-10',
            error && 'border-danger-fg hover:border-danger-fg',
            className,
          )}
          {...props}
          inputMode={inputMode}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setRevealed(v => !v)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 grid w-10 place-items-center text-text-muted hover:text-text"
          >
            {revealed ? <EyeOff className="size-icon-sm" /> : <Eye className="size-icon-sm" />}
          </button>
        ) : null}
      </div>

      {error ? null : below}

      {error ? (
        <p id={noteId} role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      ) : hint ? (
        <p id={noteId} className="text-sm text-text-secondary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
