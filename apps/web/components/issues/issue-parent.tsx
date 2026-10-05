'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Issue } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@components/ui/command';
import { Popover, PopoverAnchor, PopoverContent } from '@components/ui/popover';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { IssueKey } from '@components/issue-key';
import { PickerSkeleton } from '@components/issues/pickers';
import { TypeBadge } from '@components/issues/value-marks';
import { useDebounced } from '@hooks/use-debounced';
import { useIssueRefs, useIssueRefSearch, useUpdateIssue } from '@hooks/use-issues';
import { cn } from '@lib/utils';

interface IssueParentProps {
  issue: Issue;
  canEdit: boolean;
  picking: boolean;
  onPickingChange: (picking: boolean) => void;
}

/** Rendered while a parent is being chosen, even when there is none yet. */
export function IssueParent({ issue, canEdit, picking, onPickingChange }: IssueParentProps) {
  const parentRefs = useIssueRefs(issue.parent ? [issue.parent] : []);
  const update = useUpdateIssue(issue.key);
  const parentRef = parentRefs.data?.find(r => r.key === issue.parent);

  if (!issue.parent && !picking) return null;

  const setParent = (parent: string | null) =>
    update.mutate(
      { body: { parent }, optimistic: i => ({ ...i, parent }) },
      { onError: error => toast.error(error.message) },
    );

  return (
    <Popover open={picking} onOpenChange={onPickingChange}>
      <PopoverAnchor asChild>
        <div className="group/parent mb-1 flex min-h-7 items-center gap-2 text-xs text-text-secondary">
          <span>Subtask of</span>
          {issue.parent ? (
            <Link
              href={`/issue/${issue.parent}` as Route}
              className="flex min-w-0 items-center gap-1.5 rounded-sm text-text hover:underline"
            >
              {parentRef ? <TypeBadge type={parentRef.type} /> : null}
              <IssueKey issueKey={issue.parent} resolved={parentRef?.resolved} />
              {parentRef ? <span className="truncate">{parentRef.title}</span> : <Skeleton className="h-3 w-40" />}
            </Link>
          ) : (
            <span className="text-text-muted">Choose a parent issue</span>
          )}
          {canEdit && issue.parent ? (
            <span className="flex opacity-0 group-hover/parent:opacity-100 focus-within:opacity-100">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Change parent"
                    onClick={() => onPickingChange(true)}
                    className="text-text-muted"
                  >
                    <Pencil />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Change parent</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Remove parent"
                    onClick={() => setParent(null)}
                    className="text-text-muted"
                  >
                    <X />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remove parent</TooltipContent>
              </Tooltip>
            </span>
          ) : null}
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-96 p-0">
        <ParentCommand
          issue={issue}
          onPick={key => {
            onPickingChange(false);
            if (key !== issue.parent) setParent(key);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function ParentCommand({ issue, onPick }: { issue: Issue; onPick: (key: string) => void }) {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim(), 200);
  const results = useIssueRefSearch(debounced, issue.project.key);
  // A parent is always in the same project; the picker offers nothing the API would refuse for that.
  const prefix = `${issue.project.key}-`;
  const options = (results.data ?? []).filter(i => i.key.startsWith(prefix) && i.key !== issue.key);

  return (
    <Command shouldFilter={false}>
      <CommandInput placeholder={`Find a parent in ${issue.project.name}`} value={search} onValueChange={setSearch} />
      <CommandList>
        {results.isPending ? (
          <PickerSkeleton rows={4} />
        ) : (
          <CommandEmpty>No issue in this project matches.</CommandEmpty>
        )}
        {options.map(option => (
          <CommandItem key={option.key} value={option.key} onSelect={() => onPick(option.key)}>
            <TypeBadge type={option.type} />
            <IssueKey issueKey={option.key} resolved={option.resolved} className="flex-none" />
            <span className={cn('min-w-0 flex-1 truncate', option.resolved && 'text-text-muted')}>{option.title}</span>
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}
