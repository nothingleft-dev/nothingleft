import { fileBadge } from '@lib/files';
import { cn } from '@lib/utils';

/** The neutral type square of a download tile: `PDF`, `CSV`. */
export function FileBadge({ filename, mime, className }: { filename: string; mime: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-grid min-w-6 place-items-center rounded-sm bg-inset px-1 text-2xs leading-none font-semibold text-text-secondary',
        className,
      )}
    >
      {fileBadge(filename, mime)}
    </span>
  );
}
