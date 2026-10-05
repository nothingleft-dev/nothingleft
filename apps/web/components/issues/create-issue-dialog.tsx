'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { Maximize2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { Kbd } from '@components/kbd';
import {
  DraftChips,
  DraftParentChip,
  DraftProjectPicker,
  DraftText,
  NoWritableProject,
} from '@components/issues/draft-fields';
import { parkDraft, useIssueDraft } from '@components/issues/use-issue-draft';
import { issuePath } from '@lib/issue-path';
import { cn } from '@lib/utils';

interface CreateIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routeProject: string | null;
  parent?: string | null;
}

export function CreateIssueDialog({ open, onOpenChange, routeProject, parent = null }: CreateIssueDialogProps) {
  const router = useRouter();
  const [createMore, setCreateMore] = useState(false);
  const draft = useIssueDraft({
    routeProject,
    parent,
    onCreated: issue => {
      toast.success(`Created ${issue.key}.`, {
        action: { label: 'Open', onClick: () => router.push(issuePath(issue)) },
      });
      if (!createMore) onOpenChange(false);
    },
  });

  const openFullPage = () => {
    parkDraft(draft.park());
    onOpenChange(false);
    const project = draft.project ? `?project=${draft.project.key}` : '';
    router.push(`/new-issue${project}` as Route);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-2xl" aria-describedby="create-issue-description">
        <DialogHeader className="flex-row items-center gap-2 border-b py-3 pr-12 pl-4 text-left">
          <DraftProjectPicker draft={draft} />
          <span className="text-text-muted">/</span>
          <DialogTitle className="text-sm font-medium">{draft.parent ? 'New subtask' : 'New issue'}</DialogTitle>
          {draft.parent ? <DraftParentChip draft={draft} /> : null}
          <DialogDescription id="create-issue-description" className="sr-only">
            Only a title is required. Everything else starts at the project&apos;s defaults.
          </DialogDescription>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="ml-auto text-text-secondary"
                aria-label="Open in full page"
                disabled={draft.uploader.busy}
                onClick={openFullPage}
              >
                <Maximize2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open in full page</TooltipContent>
          </Tooltip>
        </DialogHeader>

        {draft.noWritableProject ? (
          <div className="p-4">
            <NoWritableProject />
          </div>
        ) : (
          <form
            noValidate
            className="flex flex-col"
            onSubmit={event => {
              event.preventDefault();
              draft.submit();
            }}
            onKeyDown={event => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                draft.submit();
              }
            }}
          >
            <div className="px-4 pt-3">
              <DraftText draft={draft} />
            </div>
            {draft.project ? (
              <div className="px-4 pt-2 pb-4">
                <DraftChips draft={draft} project={draft.project} />
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
              <CreateMoreToggle on={createMore} onChange={setCreateMore} />
              <Button type="submit" className="ml-auto gap-2" disabled={!draft.canSubmit}>
                {draft.pending ? 'Creating…' : draft.uploader.busy ? 'Uploading…' : 'Create issue'}
                <Kbd className="h-4 border-transparent bg-ink-fg/15 text-ink-fg/80">⌘↵</Kbd>
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateMoreToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className="flex items-center gap-2 rounded-sm px-1 text-xs text-text-secondary hover:text-text"
    >
      <span aria-hidden className={cn('relative h-4 w-7 rounded-full bg-active transition-colors', on && 'bg-ink')}>
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-3 rounded-full bg-surface transition-transform',
            on && 'translate-x-3',
          )}
        />
      </span>
      Create more
    </button>
  );
}
