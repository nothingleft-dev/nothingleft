import { cn } from '@lib/utils';

interface MeterProps {
  ratio: number;
  /** A quota meter turns amber at 80% and red at 95%; plain progress stays neutral. */
  quota?: boolean;
  className?: string;
  label: string;
}

/** DESIGN-SYSTEM § 7: 4px track on `--bg-inset`, fill in `--c-solid`. */
export function Meter({ ratio, quota = false, className, label }: MeterProps) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const tone = quota && clamped >= 0.95 ? 'c-red' : quota && clamped >= 0.8 ? 'c-amber' : quota ? 'c-blue' : null;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      className={cn('h-1 w-full overflow-hidden rounded-full bg-inset', tone, className)}
    >
      <i
        className={cn('block h-full rounded-full', tone ? 'bg-c-solid' : 'bg-text-secondary')}
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  );
}
