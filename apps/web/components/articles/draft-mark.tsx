import { cn } from '@lib/utils';

/** Drafts are marked, never coloured: being unpublished is a state, not a deviation. */
export function DraftMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-4 flex-none items-center rounded-xs border border-dashed border-border-strong px-1 text-[11px] leading-none font-medium text-text-secondary',
        className,
      )}
    >
      Draft
    </span>
  );
}
