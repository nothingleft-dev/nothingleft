'use client';

import { Check, type LucideIcon } from 'lucide-react';
import { cn } from '@lib/utils';

export interface FlowStep {
  id: string;
  title: string;
  body: string;
  icon: LucideIcon;
}

/** Keep setup instructions readable, including upcoming steps. */
export function StepRail({ steps, current }: { steps: readonly FlowStep[]; current: number }) {
  return (
    <ol className="flex flex-col">
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        const last = index === steps.length - 1;
        const Icon = done ? Check : step.icon;

        return (
          <li key={step.id} className="flex gap-4">
            <div className="flex flex-none flex-col items-center">
              <span
                aria-hidden
                className={cn(
                  'grid size-9 place-items-center rounded-full transition-colors',
                  done && 'bg-ink text-ink-fg',
                  active && 'bg-surface text-text ring-2 ring-ink',
                  !done && !active && 'bg-inset text-text-secondary',
                )}
              >
                <Icon className="size-icon" strokeWidth={done ? 3 : 1.75} />
              </span>
              {last ? null : (
                <span
                  className={cn(
                    'w-px flex-1 border-l',
                    done ? 'border-solid border-ink' : 'border-dashed border-border-strong',
                  )}
                />
              )}
            </div>

            <div className={cn('flex flex-col gap-1.5 pt-1.5', last ? 'pb-0' : 'pb-8')}>
              <p className={cn('font-semibold leading-5', active || done ? 'text-text' : 'text-text-secondary')}>
                {step.title}
                {done ? <span className="sr-only"> — done</span> : null}
                {active ? <span className="sr-only"> — current step</span> : null}
              </p>
              <p className="text-sm leading-[22px] text-text-secondary">{step.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
