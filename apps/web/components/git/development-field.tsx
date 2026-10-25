'use client';

import { Copy, Link2, MoreHorizontal, SquareTerminal } from 'lucide-react';
import { toast } from 'sonner';
import { slugify } from '@nothingleft/format';
import type { Issue } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { SidebarField } from '@components/issues/sidebar-field';
import { DevelopmentBadge, summaryCounts } from '@components/git/git-marks';
import { branchNameFor } from '@lib/git/words';

interface DevelopmentFieldProps {
  issue: Issue;
  onOpen?: () => void;
  onLink?: () => void;
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied.`);
  } catch {
    toast.error(`The ${what.toLowerCase()} could not be copied. Your browser blocked the clipboard.`);
  }
}

/** The sidebar's Development row: the badge, what it counts, and the developer's shortcuts. */
export function DevelopmentField({ issue, onOpen, onLink }: DevelopmentFieldProps) {
  const summary = issue.development;
  const branch = branchNameFor(issue.key, slugify(issue.title));
  const rollup = summary?.rollup ?? 'none';
  const counts = summary ? summaryCounts(summary) : '';

  return (
    <SidebarField
      label="Development"
      empty={rollup === 'none'}
      aside={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label="Development actions" className="text-text-muted">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem onSelect={() => void copy(branch, 'Branch name')}>
              <Copy /> Copy branch name
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void copy(`git checkout -b ${branch}`, 'Checkout command')}>
              <SquareTerminal /> Copy checkout command
            </DropdownMenuItem>
            {onLink ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onLink}>
                  <Link2 /> Link a pull request…
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      {rollup === 'none' ? (
        'Nothing linked'
      ) : (
        <>
          {onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              aria-label="Open the Development tab"
              className="rounded-sm hover:opacity-80"
            >
              <DevelopmentBadge rollup={rollup} />
            </button>
          ) : (
            <DevelopmentBadge rollup={rollup} />
          )}
          {counts ? <span className="w-full text-2xs text-text-secondary">{counts}</span> : null}
        </>
      )}
    </SidebarField>
  );
}
