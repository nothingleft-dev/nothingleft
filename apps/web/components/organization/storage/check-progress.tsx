import { Check, Circle, LoaderCircle, Minus, X } from 'lucide-react';
import { cn } from '@lib/utils';

export const CHECK_STEPS = [
  { id: 'put', side: 'server', label: 'Writing a test file' },
  { id: 'get', side: 'server', label: 'Reading it back' },
  { id: 'delete', side: 'server', label: 'Deleting it' },
  { id: 'upload', side: 'browser', label: 'Uploading 8 KB from this browser' },
  { id: 'download', side: 'browser', label: 'Opening it again' },
  { id: 'verify', side: 'browser', label: 'Confirming it arrived intact' },
] as const;

export type CheckId = (typeof CHECK_STEPS)[number]['id'];
export type CheckState = 'waiting' | 'running' | 'done' | 'failed' | 'skipped';
export type CheckStates = Record<CheckId, CheckState>;

const allAs = (state: CheckState) => Object.fromEntries(CHECK_STEPS.map(s => [s.id, state])) as CheckStates;

export const checksWaiting = () => allAs('waiting');

export function checksFailedAt(failed: CheckId): CheckStates {
  const index = CHECK_STEPS.findIndex(s => s.id === failed);
  return Object.fromEntries(
    CHECK_STEPS.map((s, i) => [s.id, i < index ? 'done' : i === index ? 'failed' : 'skipped']),
  ) as CheckStates;
}

export function checksRunning(running: CheckId): CheckStates {
  const index = CHECK_STEPS.findIndex(s => s.id === running);
  return Object.fromEntries(
    CHECK_STEPS.map((s, i) => [s.id, i < index ? 'done' : i === index ? 'running' : 'waiting']),
  ) as CheckStates;
}

export const checksPassed = () => allAs('done');

const SIDES = [
  { side: 'server', title: 'From the server' },
  { side: 'browser', title: 'From this browser' },
] as const;

const ICONS = { waiting: Circle, running: LoaderCircle, done: Check, failed: X, skipped: Minus };
const STATE_LABELS = {
  waiting: 'waiting',
  running: 'in progress',
  done: 'passed',
  failed: 'failed',
  skipped: 'not run',
};

interface CheckProgressProps {
  states: CheckStates;
  /** Said under the step that failed. */
  failure?: string | null;
}

export function CheckProgress({ states, failure }: CheckProgressProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2" aria-live="polite">
      {SIDES.map(({ side, title }) => (
        <div key={side} className="flex flex-col gap-2">
          <p className="text-sm font-medium">{title}</p>
          <ol className="flex flex-col">
            {CHECK_STEPS.filter(s => s.side === side).map(step => {
              const state = states[step.id];
              const Icon = ICONS[state];
              return (
                <li key={step.id} className="flex flex-col gap-1 py-1.5">
                  <span className="flex items-center gap-2.5 text-sm">
                    <span
                      aria-hidden
                      className={cn(
                        'grid size-5 flex-none place-items-center rounded-full',
                        state === 'done' && 'bg-ink text-ink-fg',
                        state === 'failed' && 'bg-danger-fg text-surface',
                        state === 'running' && 'text-text',
                        (state === 'waiting' || state === 'skipped') && 'text-text-disabled',
                      )}
                    >
                      <Icon
                        className={cn('size-3.5', state === 'running' && 'animate-spin motion-reduce:animate-none')}
                        strokeWidth={state === 'done' || state === 'failed' ? 3 : 2}
                      />
                    </span>
                    <span
                      className={cn(
                        state === 'waiting' || state === 'skipped' ? 'text-text-secondary' : 'text-text',
                        state === 'failed' && 'font-medium text-danger-fg',
                      )}
                    >
                      {step.label}
                    </span>
                    <span className="sr-only">— {STATE_LABELS[state]}</span>
                  </span>
                  {state === 'failed' && failure ? (
                    <p className="ml-7.5 text-xs leading-5 text-danger-fg">{failure}</p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
