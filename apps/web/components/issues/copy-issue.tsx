'use client';

import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@lib/utils';

/** Copies `PP-123 Title`, the form people paste into chat and commit messages. */
export function copyIssueText(issueKey: string, title?: string | null) {
  const text = title ? `${issueKey} ${title}` : issueKey;
  void navigator.clipboard.writeText(text);
  toast.success(`Copied ${text.length > 60 ? `${text.slice(0, 59)}…` : text}`);
}

export function CopyIssueButton({
  issueKey,
  title,
  className,
}: {
  issueKey: string;
  /** A function is read at click time, for callers that render before the issue has loaded. */
  title?: string | null | (() => string | undefined);
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={`Copy ${issueKey} and its title`}
      title="Copy key and title"
      onClick={() => copyIssueText(issueKey, typeof title === 'function' ? title() : title)}
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-sm text-text-muted hover:bg-hover hover:text-text',
        className,
      )}
    >
      <Copy className="size-3.5" />
    </button>
  );
}
