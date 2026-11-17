'use client';

import { useState } from 'react';
import type { Issue } from '@nothingleft/types';
import { TitleInput } from '@components/title-input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { useUpdateIssue } from '@hooks/use-issues';
import { isApiError } from '@lib/api/errors';
import { cn } from '@lib/utils';

const titleSize = 'text-2xl font-semibold tracking-tight max-sm:text-xl';
const titleClass = cn('flex-1 [overflow-wrap:anywhere]', titleSize);

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
              // The edit field's border is held here in transparent, so opening it moves no text.
              className="-mx-[5px] block max-w-[calc(100%+10px)] cursor-text rounded-sm border border-transparent px-1 text-left underline decoration-border-strong decoration-dotted decoration-1 underline-offset-[6px] hover:bg-hover hover:decoration-text-secondary"
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
      <TitleInput
        id="issue-title"
        autoFocus
        value={draft}
        onValueChange={setDraft}
        onBlur={commit}
        onEnter={commit}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            setDraft(null);
            setError(null);
          }
        }}
        data-slot="input"
        aria-invalid={Boolean(error)}
        className={cn(
          '-mx-[5px] block w-[calc(100%+10px)] rounded-sm border border-border-strong bg-surface px-1 text-text [overflow-wrap:anywhere]',
          titleSize,
        )}
      />
      {error ? <p className="mt-1 text-xs text-danger-fg">{error}</p> : null}
    </div>
  );
}
