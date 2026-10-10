import { cn } from '@lib/utils';

type Tone = 'idle' | 'waiting' | 'moving' | 'done' | 'failed' | 'gone';

const DOT: Record<Tone, string> = {
  idle: 'c-gray shadow-[inset_0_0_0_1.5px_var(--c-solid)]',
  waiting: 'c-gray bg-c-solid',
  moving: 'c-amber bg-c-solid',
  done: 'c-green bg-c-solid',
  failed: 'c-red bg-c-solid',
  gone: 'c-gray bg-[repeating-linear-gradient(135deg,var(--c-solid)_0_1.5px,transparent_1.5px_3.5px)]',
};

/** A background job's state as a dot and a word, the status pill's texture rules applied to imports and exports. */
export function JobStatus({ tone, label, className }: { tone: Tone; label: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm', tone === 'failed' && 'text-danger-fg', className)}>
      <i aria-hidden className={cn('inline-block size-2 flex-none rounded-full', DOT[tone])} />
      {label}
    </span>
  );
}

export type { Tone as JobTone };
