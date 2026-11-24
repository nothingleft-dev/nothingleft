'use client';

import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import type { Issue } from '@nothingleft/types';
import { TextButton } from '@components/text-button';
import { TitleInput } from '@components/title-input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { useUpdateIssue } from '@hooks/use-issues';
import { isApiError } from '@lib/api/errors';
import { cn } from '@lib/utils';

/** A long title steps down the scale, so it stays a heading and not a paragraph of display type. */
const titleSize = (title: string) =>
  cn('font-semibold tracking-tight', title.length > 70 ? 'text-xl' : 'text-2xl max-sm:text-xl');
const titleClass = 'min-w-0 flex-1 [overflow-wrap:anywhere]';
const CLAMP = 'line-clamp-6';
const LONG_LINES = 3;

/** A break chance after `_` and `/`, so an identifier wraps between its parts before it is cut mid-word. */
function Breakable({ text }: { text: string }) {
  return text.split(/(?<=[_/])/).map((part, i) => (
    <Fragment key={i}>
      {i > 0 ? <wbr /> : null}
      {part}
    </Fragment>
  ));
}

export function IssueTitle({ issue, canEdit }: { issue: Issue; canEdit: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const [lines, setLines] = useState(1);
  const text = useRef<HTMLElement>(null);
  const update = useUpdateIssue(issue.key);

  useLayoutEffect(() => {
    const element = text.current;
    if (!element || expanded) return;
    const measure = () => {
      setClamped(element.scrollHeight > element.clientHeight + 1);
      setLines(Math.round(element.scrollHeight / parseFloat(getComputedStyle(element).lineHeight)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [issue.title, expanded, draft]);

  if (draft === null) {
    const size = titleSize(issue.title);
    return (
      <div className={titleClass}>
        <h1 className={size}>
          {canEdit ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  ref={text as React.RefObject<HTMLButtonElement>}
                  type="button"
                  onClick={() => setDraft(issue.title)}
                  // The edit field's border is held here in transparent, so opening it moves no text.
                  className={cn(
                    '-mx-[5px] max-w-[calc(100%+10px)] cursor-text rounded-sm border border-transparent px-1 text-left hover:bg-hover',
                    // A rule under every line of a long title reads as noise, so one pencil stands in for it.
                    lines < LONG_LINES && 'edit-cue hover:decoration-text-secondary',
                    expanded ? 'block' : CLAMP,
                  )}
                >
                  <Breakable text={issue.title} />
                  {lines >= LONG_LINES ? (
                    <Pencil aria-hidden className="ml-2 inline size-3.5 align-baseline text-text-muted" />
                  ) : null}
                </button>
              </TooltipTrigger>
              <TooltipContent>Click to rename</TooltipContent>
            </Tooltip>
          ) : (
            <span ref={text} className={expanded ? 'block' : CLAMP}>
              <Breakable text={issue.title} />
            </span>
          )}
        </h1>
        {clamped || expanded ? (
          <TextButton className="mt-1 text-xs" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Show less' : 'Show full title'}
          </TextButton>
        ) : null}
      </div>
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
    <div className="min-w-0 flex-1">
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
          titleSize(issue.title),
        )}
      />
      {error ? <p className="mt-1 text-xs text-danger-fg">{error}</p> : null}
    </div>
  );
}
