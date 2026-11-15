'use client';

import { useState, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@components/ui/button';
import { PendingButton } from '@components/pending-button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { IssuePage } from '@components/issues/issue-page';
import { useIssue } from '@hooks/use-issues';
import { errorDetail } from '@components/query-state';
import { RateLimitReload } from '@components/rate-limit';
import { useRateLimit } from '@hooks/use-rate-limit';
import { isApiError } from '@lib/api/errors';

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
  // Nothing loaded: one centred message, at the width the skeleton had, so the frame does not jump.
  const failed = issue.isError && !missing && !issue.data;

  return (
    <DialogContent
      onOpenAutoFocus={e => e.preventDefault()}
      onCloseAutoFocus={onClosed}
      className="max-h-[calc(100dvh-48px)]! overflow-y-auto p-6 pt-8 [--dialog-top:24px] sm:max-w-[min(1240px,calc(100%-48px))]"
    >
      <DialogTitle className="sr-only">{issueKey}</DialogTitle>
      <DialogDescription className="sr-only">The issue, editable in place.</DialogDescription>
      {missing ? (
        <ModalNotFound issueKey={issueKey} onClose={onClose} />
      ) : failed ? (
        <ModalLoadError
          issueKey={issueKey}
          error={issue.error}
          retrying={issue.isFetching}
          onRetry={() => void issue.refetch()}
          onClose={onClose}
        />
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
          <IssuePage issueKey={issueKey} variant="modal" />
        </>
      )}
    </DialogContent>
  );
}

interface ModalMessageProps {
  issueKey: string;
  title: string;
  children: ReactNode;
  actions: ReactNode;
}

function ModalMessage({ issueKey, title, children, actions }: ModalMessageProps) {
  return (
    <div role="alert" className="mx-auto flex min-h-80 w-full max-w-md flex-col justify-center gap-3">
      <p className="font-mono text-2xs text-text-secondary">{issueKey}</p>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-text-secondary">{children}</p>
      <div className="flex justify-end gap-2 pt-2">{actions}</div>
    </div>
  );
}

function ModalNotFound({ issueKey, onClose }: { issueKey: string; onClose: () => void }) {
  return (
    <ModalMessage
      issueKey={issueKey}
      title="This issue does not exist"
      actions={
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      The key may be wrong, or the issue is in a project you cannot open.
    </ModalMessage>
  );
}

interface ModalLoadErrorProps {
  issueKey: string;
  error: unknown;
  retrying: boolean;
  onRetry: () => void;
  onClose: () => void;
}

function ModalLoadError({ issueKey, error, retrying, onRetry, onClose }: ModalLoadErrorProps) {
  const { secondsLeft } = useRateLimit();
  const limited = secondsLeft > 0;
  return (
    <ModalMessage
      issueKey={issueKey}
      title="This issue could not be loaded"
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          {limited ? null : (
            <PendingButton type="button" pending={retrying} pendingLabel="Loading…" onClick={onRetry}>
              Try again
            </PendingButton>
          )}
        </>
      }
    >
      {limited ? <RateLimitReload /> : (errorDetail(error) ?? 'Something went wrong on our side.')}
    </ModalMessage>
  );
}
