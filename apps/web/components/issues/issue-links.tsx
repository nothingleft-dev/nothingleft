'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { ListTree, Plus, Star, X } from 'lucide-react';
import type { IssueLinkGroup, IssueRef } from '@nothingleft/types';
import { Tabs } from '@components/tabs';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { IssueKey } from '@components/issue-key';
import { linkLabel } from '@components/issues/add-links-dialog';
import { StatusPill } from '@components/issues/status-pill';
import { TypeBadge } from '@components/issues/value-marks';
import { useIssueLinks, useRemoveIssueLink, useStarLinkedIssue } from '@hooks/use-issue-links';
import { cn } from '@lib/utils';
import { toastError } from '@components/toast-error';
import { TextButton } from '@components/text-button';

interface IssueLinksProps {
  issueKey: string;
  canEdit: boolean;
  onAddLinks: () => void;
  onCreateSubtask: () => void;
}

export function IssueLinks({ issueKey, canEdit, onAddLinks, onCreateSubtask }: IssueLinksProps) {
  const links = useIssueLinks(issueKey);
  const groups = links.data ?? [];
  const [chosen, setChosen] = useState<string | null>(null);
  const active = groups.find(g => g.link === chosen) ?? groups[0];

  if (links.isSuccess && groups.length === 0 && !canEdit) return null;

  return (
    <section className="mt-8" aria-label="Links">
      <div className="flex h-control items-center gap-3 border-b">
        <h2 className="flex-none text-sm font-semibold">Links</h2>
        {groups.length > 0 && active ? (
          <Tabs
            size="section"
            ariaLabel="Link types"
            value={active.link}
            onChange={setChosen}
            options={groups.map(g => ({ value: g.link, label: linkLabel(g.link), count: g.count }))}
          />
        ) : null}
        {canEdit ? (
          <span className="ml-auto flex flex-none gap-1">
            <Button variant="ghost" size="xs" onClick={onCreateSubtask} className="text-text-secondary">
              <ListTree /> <span className="max-sm:sr-only">Create subtask</span>
            </Button>
            <Button variant="ghost" size="xs" onClick={onAddLinks} className="text-text-secondary">
              <Plus /> <span className="max-sm:sr-only">Add links</span>
            </Button>
          </span>
        ) : null}
      </div>

      {links.isPending ? (
        <LinksSkeleton />
      ) : links.isError ? (
        <p className="py-3 text-xs text-danger-fg">The links could not be loaded. {links.error.message}</p>
      ) : active ? (
        <LinkRows issueKey={issueKey} group={active} canEdit={canEdit} />
      ) : (
        <p className="py-3 text-xs text-text-secondary">
          No linked issues. <TextButton onClick={onAddLinks}>Add links</TextButton> to show what this depends on,
          duplicates or relates to.
        </p>
      )}
    </section>
  );
}

function LinkRows({ issueKey, group, canEdit }: { issueKey: string; group: IssueLinkGroup; canEdit: boolean }) {
  const remove = useRemoveIssueLink(issueKey);
  const star = useStarLinkedIssue(issueKey);

  return (
    <ul role="tabpanel" aria-label={linkLabel(group.link)} className="flex flex-col">
      {group.issues.map(issue => (
        <LinkRow
          key={issue.key}
          issue={issue}
          onStar={() =>
            star.mutate(
              { target: issue.key, on: !issue.starred },
              {
                onError: error =>
                  toastError(issue.starred ? `Could not unstar ${issue.key}` : `Could not star ${issue.key}`, error),
              },
            )
          }
          onRemove={
            canEdit
              ? () =>
                  remove.mutate(
                    { link: group.link, target: issue.key },
                    { onError: error => toastError(`Could not remove the link to ${issue.key}`, error) },
                  )
              : undefined
          }
          removeLabel={`Remove “${group.link} ${issue.key}”`}
        />
      ))}
    </ul>
  );
}

interface LinkRowProps {
  issue: IssueRef;
  onStar: () => void;
  onRemove?: () => void;
  removeLabel: string;
}

function LinkRow({ issue, onStar, onRemove, removeLabel }: LinkRowProps) {
  return (
    <li className="group/link flex h-row items-center gap-2 border-b border-border-subtle pr-1 pl-1 hover:bg-hover">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={issue.starred ? `Unstar ${issue.key}` : `Star ${issue.key}`}
            aria-pressed={issue.starred}
            onClick={onStar}
            className={cn(
              'inline-flex size-6 flex-none items-center justify-center rounded-sm text-text-muted hover:text-text',
              issue.starred && 'text-brand-text hover:text-brand-text',
            )}
          >
            <Star className={cn('size-3.5', issue.starred && 'fill-current')} />
          </button>
        </TooltipTrigger>
        <TooltipContent>{issue.starred ? 'Starred' : 'Star'}</TooltipContent>
      </Tooltip>
      <TypeBadge type={issue.type} className={cn(issue.resolved && 'opacity-55')} />
      <Link
        href={`/issue/${issue.key}` as Route}
        className="flex min-w-0 flex-1 items-center gap-2 self-stretch hover:underline"
      >
        <IssueKey issueKey={issue.key} resolved={issue.resolved} column />
        <span className={cn('truncate text-sm', issue.resolved && 'text-text-muted')}>{issue.title}</span>
      </Link>
      <StatusPill status={issue.status} className="flex-none max-sm:hidden" />
      {onRemove ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={removeLabel}
              onClick={onRemove}
              className="flex-none text-text-muted reveal group-hover/link:opacity-100"
            >
              <X />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove link</TooltipContent>
        </Tooltip>
      ) : null}
    </li>
  );
}

// One line, the height of the empty state most issues end on, so Activity below does not move when it settles.
function LinksSkeleton() {
  return (
    <div className="py-3" aria-hidden>
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}
