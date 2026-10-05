'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { ListTree, Plus, Star, X } from 'lucide-react';
import { toast } from 'sonner';
import type { IssueLinkGroup, IssueRef } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { IssueKey } from '@components/issue-key';
import { linkLabel } from '@components/issues/add-links-dialog';
import { StatusPill } from '@components/issues/status-pill';
import { TypeBadge } from '@components/issues/value-marks';
import { useIssueLinks, useRemoveIssueLink, useStarLinkedIssue } from '@hooks/use-issue-links';
import { cn } from '@lib/utils';

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
      <div className="flex min-h-control flex-wrap items-center gap-x-3 gap-y-1 border-b">
        <h2 className="text-sm font-semibold">Links</h2>
        {groups.length > 0 ? (
          <div role="tablist" aria-label="Link types" className="flex flex-wrap gap-1">
            {groups.map(g => (
              <button
                key={g.link}
                type="button"
                role="tab"
                aria-selected={g.link === active?.link}
                onClick={() => setChosen(g.link)}
                className={cn(
                  'inline-flex h-control-sm items-center gap-1.5 rounded-sm px-2 text-xs text-text-secondary hover:bg-hover hover:text-text',
                  g.link === active?.link && 'bg-active text-text',
                )}
              >
                {linkLabel(g.link)}
                <span className="tabular text-text-muted">{g.count}</span>
              </button>
            ))}
          </div>
        ) : null}
        {canEdit ? (
          <span className="ml-auto flex gap-1">
            <Button variant="ghost" size="xs" onClick={onCreateSubtask} className="text-text-secondary">
              <ListTree /> Create subtask
            </Button>
            <Button variant="ghost" size="xs" onClick={onAddLinks} className="text-text-secondary">
              <Plus /> Add links
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
          No linked issues.{' '}
          <button type="button" onClick={onAddLinks} className="text-text underline underline-offset-2">
            Add links
          </button>{' '}
          to show what this depends on, duplicates or relates to.
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
            star.mutate({ target: issue.key, on: !issue.starred }, { onError: error => toast.error(error.message) })
          }
          onRemove={
            canEdit
              ? () =>
                  remove.mutate(
                    { link: group.link, target: issue.key },
                    { onError: error => toast.error(error.message) },
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
        <IssueKey issueKey={issue.key} resolved={issue.resolved} className="flex-none" />
        <span className={cn('truncate text-sm', issue.resolved && 'text-text-muted line-through')}>{issue.title}</span>
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
              className="flex-none text-text-muted opacity-0 group-hover/link:opacity-100 focus-visible:opacity-100"
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

function LinksSkeleton() {
  return (
    <div className="flex flex-col" aria-hidden>
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="flex h-row items-center gap-2 border-b border-border-subtle px-2">
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="size-4.5 rounded-xs" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3" style={{ width: `${30 + i * 18}%` }} />
        </div>
      ))}
    </div>
  );
}
