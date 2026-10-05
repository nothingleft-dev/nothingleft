'use client';

import { useState } from 'react';
import type { Issue } from '@nothingleft/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { useUpdateIssue } from '@hooks/use-issues';
import { isApiError } from '@lib/api/errors';

const titleClass = 'flex-1 text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]';

export function IssueTitle({ issue, canEdit }: { issue: Issue; canEdit: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateIssue(issue.key);

  if (draft === null) {
    return canEdit ? (
      <h1 className={titleClass}>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* The sidebar's standing cue for an editable value: a dotted rule, darker on hover (design § 8b). */}
            <button
              type="button"
              onClick={() => setDraft(issue.title)}
              className="-mx-1 cursor-text rounded-sm px-1 text-left underline decoration-border-strong decoration-dotted decoration-2 underline-offset-[6px] hover:bg-hover hover:decoration-text-secondary"
            >
              {issue.title}
            </button>
          </TooltipTrigger>
          <TooltipContent>Click to rename</TooltipContent>
        </Tooltip>
      </h1>
    ) : (
      <h1 className={titleClass}>{issue.title}</h1>
    );
  }

  const commit = () => {
    const next = draft.trim();
    if (next === '' || next === issue.title) {
      setDraft(null);
      setError(null);
      return;
    }
    update.mutate(
      { body: { title: next }, optimistic: i => ({ ...i, title: next }) },
      {
        onSuccess: () => {
          setDraft(null);
          setError(null);
        },
        onError: e => setError(isApiError(e) ? e.message : 'The title could not be saved.'),
      },
    );
  };

  return (
    <div className="flex-1">
      <label htmlFor="issue-title" className="sr-only">
        Title
      </label>
      <input
        id="issue-title"
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            setDraft(null);
            setError(null);
          }
        }}
        aria-invalid={Boolean(error)}
        className="-mx-1 w-full rounded-sm border border-border-strong bg-surface px-1 text-2xl font-semibold tracking-tight text-text"
      />
      {error ? <p className="mt-1 text-xs text-danger-fg">{error}</p> : null}
    </div>
  );
}
