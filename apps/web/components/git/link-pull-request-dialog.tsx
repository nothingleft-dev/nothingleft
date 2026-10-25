'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { LinkPullRequestSchema } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Label } from '@components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog';
import { useLinkPullRequest } from '@hooks/use-git';

interface LinkPullRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issueKey: string;
}

export function LinkPullRequestDialog({ open, onOpenChange, issueKey }: LinkPullRequestDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open ? <LinkForm issueKey={issueKey} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function LinkForm({ issueKey, onDone }: { issueKey: string; onDone: () => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const link = useLinkPullRequest(issueKey);

  const submit = () => {
    const parsed = LinkPullRequestSchema.safeParse({ url: url.trim() });
    if (!parsed.success) {
      setError('Paste the full address of the pull request, starting with https://.');
      return;
    }
    link.mutate(parsed.data.url, {
      onSuccess: () => {
        toast.success(`Linked to ${issueKey}.`);
        onDone();
      },
      onError: e => setError(e.message),
    });
  };

  return (
    <form
      noValidate
      onSubmit={event => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>Link a pull request</DialogTitle>
        <DialogDescription>
          For a pull request that never names {issueKey}. It must belong to a repository this project can reference: one
          linked to it in project settings, or one set to match every project.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pull-request-url">Pull request address</Label>
        <Input
          id="pull-request-url"
          autoFocus
          value={url}
          placeholder="https://github.com/acme/web/pull/42"
          aria-invalid={error !== null}
          aria-describedby="pull-request-url-help"
          className="font-mono text-xs"
          onChange={event => {
            setUrl(event.target.value);
            if (error) setError(null);
          }}
        />
        <p id="pull-request-url-help" className={error ? 'text-xs text-danger-fg' : 'text-xs text-text-secondary'}>
          {error ?? 'A GitLab merge request works the same way.'}
        </p>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={link.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={link.isPending || url.trim() === ''}>
          {link.isPending ? 'Linking…' : 'Link pull request'}
        </Button>
      </DialogFooter>
    </form>
  );
}
