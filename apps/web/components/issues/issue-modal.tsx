'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { IssuePage } from '@components/issues/issue-page';
import { useIssue } from '@hooks/use-issues';
import { isApiError } from '@lib/api/errors';
import { cn } from '@lib/utils';

interface IssueModalProps {
  issueKey: string | null;
  onClose: () => void;
}

/** The issue page over whatever list opened it, so the board stays where it was. */
export function IssueModal({ issueKey, onClose }: IssueModalProps) {
  // The last key stays drawn while the dialog animates out, so it never closes as an empty frame.
  const [shownKey, setShownKey] = useState(issueKey);
  if (issueKey !== null && issueKey !== shownKey) setShownKey(issueKey);

  return (
    <Dialog open={issueKey !== null} onOpenChange={open => !open && onClose()}>
      {shownKey ? <IssueModalContent issueKey={shownKey} onClose={onClose} onClosed={() => setShownKey(null)} /> : null}
    </Dialog>
  );
}

interface IssueModalContentProps {
  issueKey: string;
  onClose: () => void;
  onClosed: () => void;
}

function IssueModalContent({ issueKey, onClose, onClosed }: IssueModalContentProps) {
  const issue = useIssue(issueKey);
  const missing = issue.isError && isApiError(issue.error) && issue.error.isNotFound;

  return (
    <DialogContent
      onOpenAutoFocus={e => e.preventDefault()}
      onCloseAutoFocus={onClosed}
      className={cn(
        'overflow-y-auto p-6 pt-8 [--dialog-top:24px]',
        missing ? 'sm:max-w-md' : 'sm:max-w-[min(1240px,calc(100%-48px))]',
      )}
    >
      <DialogTitle className="sr-only">{issueKey}</DialogTitle>
      <DialogDescription className="sr-only">The issue, editable in place.</DialogDescription>
      {missing ? (
        <ModalNotFound issueKey={issueKey} onClose={onClose} />
      ) : (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={`/issue/${issueKey}`}
                target="_blank"
                rel="noopener"
                aria-label="Open in a new tab"
                className="absolute top-4 right-12 grid size-7 place-items-center rounded-sm text-text-muted hover:bg-hover hover:text-text"
              >
                <ExternalLink className="size-4" />
              </a>
            </TooltipTrigger>
            <TooltipContent>Open in a new tab</TooltipContent>
          </Tooltip>
          {/* A failure has no title row to sit beside the corner icons, so it starts below them. */}
          <div className={cn(issue.isError && 'pt-6')}>
            <IssuePage issueKey={issueKey} variant="modal" />
          </div>
        </>
      )}
    </DialogContent>
  );
}

function ModalNotFound({ issueKey, onClose }: { issueKey: string; onClose: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 pr-8">
      <p className="font-mono text-2xs text-text-muted">{issueKey}</p>
      <h2 className="text-lg font-semibold tracking-tight">This issue does not exist</h2>
      <p className="text-text-secondary">The key may be wrong, or the issue is in a project you cannot open.</p>
      <Button type="button" variant="outline" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}
