import { cn } from '@lib/utils';

interface IssueKeyProps {
  issueKey: string;
  resolved?: boolean;
  className?: string;
}

export function IssueKey({ issueKey, resolved = false, className }: IssueKeyProps) {
  return (
    <span
      className={cn(
        'font-mono text-2xs tabular text-text-secondary',
        resolved && 'text-text-muted line-through',
        className,
      )}
    >
      {issueKey}
    </span>
  );
}
