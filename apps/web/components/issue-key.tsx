import { cn } from '@lib/utils';

interface IssueKeyProps {
  issueKey: string;
  resolved?: boolean;
  /** In a list or picker: keys take one width, so the titles after them line up. */
  column?: boolean;
  className?: string;
}

export function IssueKey({ issueKey, resolved = false, column = false, className }: IssueKeyProps) {
  return (
    <span
      className={cn(
        'shrink-0 font-mono text-2xs whitespace-nowrap tabular text-text-secondary',
        resolved && 'text-text-muted line-through',
        column && 'min-w-[8ch]',
        className,
      )}
    >
      {issueKey}
    </span>
  );
}
