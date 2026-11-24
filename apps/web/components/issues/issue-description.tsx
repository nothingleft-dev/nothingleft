'use client';

import { useState } from 'react';
import { checkMarkdownSize } from '@nothingleft/markdown';
import type { Issue } from '@nothingleft/types';
import { Pencil } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { Kbd } from '@components/kbd';
import { MarkdownEditor } from '@components/editor/markdown-editor';
import { Markdown } from '@components/markdown/markdown';
import { MarkdownSizeNote } from '@components/issues/markdown-size-note';
import { useUploader } from '@hooks/use-attachments';
import { useToggleIssueTask, useUpdateIssue } from '@hooks/use-issues';
import { isApiError } from '@lib/api/errors';
import { toastError } from '@components/toast-error';
import { PendingButton, PendingLabel } from '@components/pending-button';
import { cn } from '@lib/utils';
import { FormAlert } from '@components/auth/form-alert';

interface IssueDescriptionProps {
  issue: Issue;
  canEdit: boolean;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
}

export function IssueDescription({ issue, canEdit, editing, onEditingChange }: IssueDescriptionProps) {
  const source = issue.description_md ?? '';
  const toggle = useToggleIssueTask(issue.key);

  if (!editing && !source.trim()) {
    return canEdit ? (
      <button
        type="button"
        onClick={() => onEditingChange(true)}
        className="mt-5 w-full rounded-md border border-dashed px-3 py-4 text-left text-sm text-text-secondary hover:border-border-strong hover:text-text"
      >
        Add a description <Kbd className="ml-1">e</Kbd>
      </button>
    ) : null;
  }

  return (
    <section className="mt-5" aria-labelledby="issue-description">
      <div className="flex h-7 items-center justify-between gap-3">
        <h2 id="issue-description" className="text-sm font-semibold">
          Description
        </h2>
        {canEdit && !editing ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="xs"
                aria-label="Edit description"
                className="text-text-secondary"
                onClick={() => onEditingChange(true)}
              >
                <Pencil /> Edit
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Edit description <span className="ml-2 opacity-70">e</span>
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {editing ? (
        <DescriptionEditor issue={issue} onDone={() => onEditingChange(false)} />
      ) : (
        <Markdown
          source={source}
          className="md-wide mt-1"
          onToggleTask={
            canEdit
              ? (index, checked) =>
                  toggle.mutate(
                    { index, checked },
                    { onError: error => toastError('Could not update the task', error) },
                  )
              : undefined
          }
        />
      )}
    </section>
  );
}

function DescriptionEditor({ issue, onDone }: { issue: Issue; onDone: () => void }) {
  const [text, setText] = useState(issue.description_md ?? '');
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateIssue(issue.key);
  const uploader = useUploader({ issue: issue.key });
  const size = checkMarkdownSize(text);
  const blocked = size.level === 'too_large' || uploader.busy;

  const submit = () => {
    if (blocked || update.isPending) return;
    const next = text.trim() === '' ? null : text;
    if (next === issue.description_md) return onDone();
    update.mutate(
      { body: { description_md: next }, optimistic: i => ({ ...i, description_md: next }) },
      {
        onSuccess: () => {
          uploader.finish(text);
          onDone();
        },
        onError: e => setError(isApiError(e) ? e.message : ''),
      },
    );
  };

  return (
    <div className="mt-1 flex flex-col gap-2">
      <MarkdownEditor
        // Bleeds by its padding and border, so the text keeps the x it has when read.
        className="sm:-mx-[13px]"
        value={text}
        onChange={setText}
        projectKey={issue.project.key}
        label="Description"
        placeholder="Describe the issue. Type @ to mention someone, # to link an issue."
        variant="description"
        autoFocus
        invalid={error !== null || size.level === 'too_large'}
        onSubmit={submit}
        onCancel={onDone}
        uploader={uploader}
        footer={
          <>
            <PendingButton
              size="sm"
              onClick={submit}
              disabled={blocked}
              pending={update.isPending}
              pendingLabel="Saving…"
              after={
                <Kbd
                  className={cn(
                    'h-4 border-transparent bg-ink-fg/15 text-ink-fg/80',
                    (uploader.busy || update.isPending) && 'invisible',
                  )}
                >
                  ⌘↵
                </Kbd>
              }
            >
              {/* Waiting for files is not saving: the button is unavailable until they land. */}
              <PendingLabel pending={uploader.busy} pendingLabel="Uploading…">
                Save
              </PendingLabel>
            </PendingButton>
            <Button size="sm" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          </>
        }
      />
      <MarkdownSizeNote size={size} />
      {error !== null ? (
        <FormAlert title="The description was not saved.">
          {error} Your text is still here, so you can save it again.
        </FormAlert>
      ) : null}
    </div>
  );
}
