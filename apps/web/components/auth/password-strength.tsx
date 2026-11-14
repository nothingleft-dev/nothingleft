'use client';

import { PASSWORD_MIN_LENGTH, passwordStrength, type PasswordContext } from '@nothingleft/types';
import { cn } from '@lib/utils';

const SEGMENTS = [0, 1, 2, 3];

/**
 * Four segments the width of the field, then one line. The bar is advisory and stays
 * neutral — the only rules the API refuses on are the minimum length and the
 * breached-password check, so a red bar for "no symbols" would be a lie about what
 * happens on submit.
 */
export function PasswordStrength({ value, context }: { value: string; context?: PasswordContext }) {
  const strength = passwordStrength(value, context);
  const touched = value.length > 0;
  const weak = touched && strength.score <= 1;
  const missing = PASSWORD_MIN_LENGTH - value.length;

  return (
    <div className="flex flex-col gap-2 pt-0.5">
      <div className="flex h-1 gap-1" role="presentation">
        {SEGMENTS.map(i => (
          <span
            key={i}
            className={cn(
              'flex-1 rounded-full bg-border transition-colors',
              touched && (strength.score > i || i === 0) && (weak ? 'bg-danger-fg' : 'bg-text-secondary'),
            )}
          />
        ))}
      </div>

      <p aria-live="polite" className="text-2xs text-text-secondary">
        {!touched ? (
          `At least ${PASSWORD_MIN_LENGTH} characters`
        ) : !strength.meetsMinimum ? (
          <>
            At least {PASSWORD_MIN_LENGTH} characters · <span className="tabular">{missing}</span> to go
          </>
        ) : (
          <>
            <span className={cn('font-medium', weak ? 'text-danger-fg' : 'text-text')}>{strength.label}</span>
            {strength.tip ? ` · ${strength.tip}` : null}
          </>
        )}
      </p>
    </div>
  );
}
