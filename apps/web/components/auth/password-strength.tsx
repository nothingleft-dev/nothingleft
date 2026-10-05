'use client';

import { Check, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import { PASSWORD_MIN_LENGTH, passwordStrength, type PasswordContext } from '@nothingleft/types';
import { cn } from '@lib/utils';

const SEGMENTS = [0, 1, 2, 3];

/**
 * Four segments plus one requirement line. The bar is advisory and stays neutral —
 * the only rules the API refuses on are the minimum length and the breached-password
 * check, so a red bar for "no symbols" would be a lie about what happens on submit.
 */
export function PasswordStrength({ value, context }: { value: string; context?: PasswordContext }) {
  const strength = passwordStrength(value, context);
  const touched = value.length > 0;
  const weak = touched && strength.score <= 1;

  return (
    <div className="flex flex-col gap-2 pt-0.5">
      <div className="flex items-center gap-2">
        <div className="flex h-1 flex-1 gap-1" role="presentation">
          {SEGMENTS.map(i => (
            <span
              key={i}
              className={cn(
                'flex-1 rounded-full bg-inset transition-colors',
                touched && strength.score > i && (weak ? 'bg-danger-fg' : 'bg-text-secondary'),
              )}
            />
          ))}
        </div>
        <span
          aria-live="polite"
          className={cn('w-16 text-right text-2xs font-medium', weak ? 'text-danger-fg' : 'text-text-secondary')}
        >
          {touched ? strength.label : ''}
        </span>
      </div>

      <Requirement met={strength.meetsMinimum} touched={touched}>
        At least {PASSWORD_MIN_LENGTH} characters
      </Requirement>

      {touched && strength.tip ? <p className="text-2xs text-text-muted">{strength.tip}</p> : null}
    </div>
  );
}

function Requirement({ met, touched, children }: { met: boolean; touched: boolean; children: ReactNode }) {
  const Icon = met ? Check : Minus;
  return (
    <p
      className={cn(
        'flex items-center gap-1.5 text-2xs',
        !touched ? 'text-text-muted' : met ? 'text-text-secondary' : 'text-danger-fg',
      )}
    >
      <Icon className="size-3 flex-none" />
      {children}
    </p>
  );
}
