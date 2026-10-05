'use client';

import { ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { IssuePage } from '@components/issues/issue-page';

interface IssueModalProps {
  issueKey: string | null;
  onClose: () => void;
}

/** The issue page over whatever list opened it, so the board stays where it was. */
export function IssueModal({ issueKey, onClose }: IssueModalProps) {
  return (
    <Dialog open={issueKey !== null} onOpenChange={open => !open && onClose()}>
      <DialogContent
        onOpenAutoFocus={e => e.preventDefault()}
        className="max-h-[calc(100dvh-48px)] overflow-y-auto p-6 pt-8 sm:max-w-[min(1240px,calc(100%-48px))]"
      >
        <DialogTitle className="sr-only">{issueKey}</DialogTitle>
        <DialogDescription className="sr-only">The issue, editable in place.</DialogDescription>
        {issueKey ? (
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
            <IssuePage issueKey={issueKey} variant="modal" />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
