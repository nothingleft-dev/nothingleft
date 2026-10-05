'use client';

import { ChevronDown } from 'lucide-react';
import type { SavedView } from '@nothingleft/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { useIssueCount } from '@hooks/use-issue-search';
import { cn } from '@lib/utils';

export type ViewAction = 'update' | 'rename' | 'delete';

interface ViewTabsProps {
  views: readonly SavedView[];
  active: SavedView | null;
  /** A project list counts each view inside that project only. */
  project?: string;
  onSelect: (view: SavedView) => void;
  onAction: (view: SavedView, action: ViewAction) => void;
  /** The bar's query no longer matches the active view's. */
  modified: boolean;
}

const VISIBILITY_LABEL: Record<SavedView['visibility'], string> = {
  private: 'Only you',
  project: 'Everyone in the project',
  org: 'Everyone in the organisation',
};

export function ViewTabs({ views, active, project, onSelect, onAction, modified }: ViewTabsProps) {
  if (views.length === 0) return null;
  return (
    <div role="tablist" aria-label="Saved views" className="flex flex-wrap items-center gap-1">
      {views.map(view => (
        <ViewTab
          key={`${view.owner.username}/${view.name}`}
          view={view}
          project={project}
          active={active?.name === view.name && active.owner.username === view.owner.username}
          modified={modified}
          onSelect={() => onSelect(view)}
          onAction={action => onAction(view, action)}
        />
      ))}
    </div>
  );
}

function ViewTab({
  view,
  project,
  active,
  modified,
  onSelect,
  onAction,
}: {
  view: SavedView;
  project?: string;
  active: boolean;
  modified: boolean;
  onSelect: () => void;
  onAction: (action: ViewAction) => void;
}) {
  const scope = view.project?.key ?? project;
  const count = useIssueCount(view.query, scope);
  const owner = `${VISIBILITY_LABEL[view.visibility]}${view.project ? ` · ${view.project.name}` : ''} · by ${view.owner.name}`;

  const pill = (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={cn(
        'inline-flex h-control-sm items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium text-text-secondary hover:bg-hover hover:text-text',
        active && 'bg-active text-text',
        active && view.can_edit && 'rounded-r-none pr-1.5',
      )}
    >
      <span className="max-w-[24ch] truncate">{view.name}</span>
      {count.isError ? (
        <span className="text-text-muted" title="This view's query no longer runs">
          !
        </span>
      ) : count.data !== undefined ? (
        <span className="font-normal tabular text-text-muted">{count.data}</span>
      ) : null}
      {active && modified ? (
        <span className="text-text-muted" title="Query changed since the view was saved">
          •
        </span>
      ) : null}
    </button>
  );

  return (
    <span className="inline-flex items-center">
      <Tooltip>
        <TooltipTrigger asChild>{pill}</TooltipTrigger>
        <TooltipContent>
          <span className="font-mono">{view.query || '(everything)'}</span>
          <br />
          {owner}
        </TooltipContent>
      </Tooltip>
      {active && view.can_edit ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Manage view ${view.name}`}
              className="grid h-control-sm w-5 place-items-center rounded-r-sm bg-active text-text-muted hover:text-text max-md:min-h-11"
            >
              <ChevronDown className="size-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onSelect={() => onAction('update')} disabled={!modified}>
              Save current query to this view
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction('rename')}>Rename or share…</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => onAction('delete')}>
              Delete view…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </span>
  );
}
