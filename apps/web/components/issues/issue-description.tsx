'use client';

import { useState } from 'react';
import { checkMarkdownSize } from '@nothingleft/markdown';
import type { Issue } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Kbd } from '@components/kbd';
import { MarkdownEditor } from '@components/editor/markdown-editor';
import { Markdown } from '@components/markdown/markdown';
import { MarkdownSizeNote } from '@components/issues/markdown-size-note';
import { useUploader } from '@hooks/use-attachments';
import { useToggleIssueTask, useUpdateIssue } from '@hooks/use-issues';
import { isApiError } from '@lib/api/errors';
import { toast } from 'sonner';

interface IssueDescriptionProps {
  issue: Issue;
  canEdit: boolean;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
}

export function IssueDescription({ issue, canEdit, editing, onEditingChange }: IssueDescriptionProps) {
  const source = issue.description_md ?? '';
  const toggle = useToggleIssueTask(issue.key);

  if (editing) {
    return <DescriptionEditor issue={issue} onDone={() => onEditingChange(false)} />;
  }

  if (!source.trim()) {
    return canEdit ? (
      <button
        type="button"
        onClick={() => onEditingChange(true)}
        className="mt-4 w-full max-w-[72ch] rounded-md border border-dashed px-3 py-4 text-left text-sm text-text-secondary hover:border-border-strong hover:text-text"
      >
        Add a description <Kbd className="ml-1">e</Kbd>
      </button>
    ) : null;
  }

  return (
    <Markdown
      source={source}
      className="mt-4"
      onToggleTask={
        canEdit
          ? (index, checked) => toggle.mutate({ index, checked }, { onError: error => toast.error(error.message) })
          : undefined
      }
    />
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
        onError: e => setError(isApiError(e) ? e.message : 'The description could not be saved.'),
      },
    );
  };

  return (
    <div className="mt-4 flex flex-col gap-2">
      <MarkdownEditor
        value={text}
        onChange={setText}
        projectKey={issue.project.key}
        label="Description"
        placeholder="Describe the issue. Type @ to mention someone, # to link an issue."
        variant="description"
        autoFocus
        invalid={Boolean(error) || size.level === 'too_large'}
        onSubmit={submit}
        onCancel={onDone}
        uploader={uploader}
        footer={
          <>
            <Button size="sm" onClick={submit} disabled={update.isPending || blocked}>
              {uploader.busy ? 'Uploading…' : 'Save'}{' '}
              <Kbd className="h-4 border-transparent bg-ink-fg/15 text-ink-fg/80">⌘↵</Kbd>
            </Button>
            <Button size="sm" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          </>
        }
      />
      <MarkdownSizeNote size={size} />
      {error ? <p className="text-xs text-danger-fg">{error}</p> : null}
    </div>
  );
}
