'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, Ellipsis, TriangleAlert } from 'lucide-react';
import type { SavedView } from '@nothingleft/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
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

const GAP = 4;
// "12 more" with its chevron, and the active view's ⋯ button: room kept for them when tabs overflow.
const MORE_WIDTH = 84;
const MENU_WIDTH = 28;

const viewId = (view: SavedView) => `${view.owner.username}/${view.name}`;

/** Tabs that fit stay in the row; the rest go behind "N more", so a tab is never cut mid-word. */
export function ViewTabs({ views, active, project, onSelect, onAction, modified }: ViewTabsProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(views.length);
  const menu = active?.can_edit ? MENU_WIDTH + GAP : 0;

  useLayoutEffect(() => {
    const box = boxRef.current;
    const measure = measureRef.current;
    if (!box || !measure) return;
    const compute = () => {
      const widths = [...measure.children].map(child => (child as HTMLElement).offsetWidth);
      const room = box.clientWidth - menu;
      const all = widths.reduce((sum, w) => sum + w + GAP, -GAP);
      if (all <= room) {
        setFit(widths.length);
        return;
      }
      let used = -GAP;
      let count = 0;
      for (const w of widths) {
        if (used + GAP + w > room - MORE_WIDTH - GAP) break;
        used += GAP + w;
        count++;
      }
      setFit(Math.max(1, count));
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(box);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [views, menu]);

  if (views.length === 0) return null;

  const activeIndex = active ? views.findIndex(v => viewId(v) === viewId(active)) : -1;
  // The open view always shows: past the cut it takes the last visible place.
  const shown =
    activeIndex >= fit ? [...views.slice(0, Math.max(0, fit - 1)), views[activeIndex]!] : views.slice(0, fit);
  const hidden = views.filter(v => !shown.includes(v));
  const isActive = (view: SavedView) => activeIndex >= 0 && viewId(view) === viewId(views[activeIndex]!);

  return (
    <div ref={boxRef} className="relative flex min-w-0 items-center gap-1">
      <div ref={measureRef} aria-hidden inert className="invisible absolute top-0 left-0 flex w-max gap-1">
        {views.map(view => (
          <ViewTab key={viewId(view)} view={view} project={project} active={false} modified={false} />
        ))}
      </div>
      <div role="tablist" aria-label="Saved views" className="flex min-w-0 items-center gap-1 py-0.5">
        {shown.map(view => (
          <ViewTab
            key={viewId(view)}
            view={view}
            project={project}
            active={isActive(view)}
            modified={modified}
            onSelect={() => onSelect(view)}
          />
        ))}
      </div>
      {hidden.length > 0 ? <MoreViews views={hidden} project={project} onSelect={onSelect} /> : null}
      {active?.can_edit ? (
        <ViewMenu view={active} modified={modified} onAction={action => onAction(active, action)} />
      ) : null}
    </div>
  );
}

function MoreViews({
  views,
  project,
  onSelect,
}: {
  views: readonly SavedView[];
  project?: string;
  onSelect: (view: SavedView) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-control-sm flex-none items-center gap-1 rounded-sm px-2.5 text-xs font-medium whitespace-nowrap text-text-secondary hover:bg-hover hover:text-text data-[state=open]:bg-active data-[state=open]:text-text max-md:min-h-11"
        >
          {views.length} more
          <ChevronDown className="size-3 text-text-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[60vh] w-64 overflow-y-auto">
        {views.map(view => (
          <MoreViewItem key={viewId(view)} view={view} project={project} onSelect={() => onSelect(view)} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MoreViewItem({ view, project, onSelect }: { view: SavedView; project?: string; onSelect: () => void }) {
  const count = useIssueCount(view.query, view.project?.key ?? project);
  return (
    <DropdownMenuItem onSelect={onSelect}>
      <span className="min-w-0 flex-1 truncate">{view.name}</span>
      {count.isError ? (
        <TriangleAlert aria-label="Its query no longer runs" className="size-3.5 text-warning-fg" />
      ) : count.data !== undefined ? (
        <span className="text-xs tabular text-text-secondary">{count.data}</span>
      ) : null}
    </DropdownMenuItem>
  );
}

function ViewMenu({
  view,
  modified,
  onAction,
}: {
  view: SavedView;
  modified: boolean;
  onAction: (action: ViewAction) => void;
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Manage view ${view.name}`}
              className="grid h-control-sm w-7 flex-none place-items-center rounded-sm text-text-secondary hover:bg-hover hover:text-text data-[state=open]:bg-active data-[state=open]:text-text max-md:min-h-11"
            >
              <Ellipsis className="size-icon-sm" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Manage {view.name}</TooltipContent>
      </Tooltip>
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
  );
}

function ViewTab({
  view,
  project,
  active,
  modified,
  onSelect,
}: {
  view: SavedView;
  project?: string;
  active: boolean;
  modified: boolean;
  onSelect?: () => void;
}) {
  const scope = view.project?.key ?? project;
  const count = useIssueCount(view.query, scope);
  // The sidebar counts an unscoped view across every project; on a project's list both numbers show.
  const widerScope = !view.project && project !== undefined;
  const everywhere = useIssueCount(view.query, undefined, widerScope);
  const owner = `${VISIBILITY_LABEL[view.visibility]}${view.project ? ` · ${view.project.name}` : ''} · by ${view.owner.name}`;
  const wider = widerScope && everywhere.data !== undefined && everywhere.data !== count.data ? everywhere.data : null;

  const pill = (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={cn(
        'inline-flex h-control-sm items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium text-text-secondary hover:bg-hover hover:text-text',
        active && 'bg-active text-text hover:bg-active',
      )}
    >
      <span className="max-w-[24ch] truncate">{view.name}</span>
      {count.isError ? (
        <TriangleAlert aria-label="Its query no longer runs" className="size-3.5 text-warning-fg" />
      ) : count.data !== undefined ? (
        <span className="font-normal tabular text-text-secondary">
          {count.data}
          {wider !== null ? <span className="text-text-muted"> of {wider}</span> : null}
        </span>
      ) : null}
      {active && modified ? (
        <span className="text-text-secondary" title="Query changed since the view was saved">
          •
        </span>
      ) : null}
    </button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{pill}</TooltipTrigger>
      <TooltipContent side="bottom">
        <span className="font-mono [font-variant-ligatures:none]">{view.query || '(everything)'}</span>
        <br />
        {owner}
        {count.data !== undefined && !count.isError ? (
          <>
            <br />
            {scope ? `${count.data} in ${scope}` : `${count.data} across your projects`}
            {wider !== null ? ` · ${wider} across your projects` : ''}
          </>
        ) : null}
        {count.isError ? (
          <>
            <br />
            This view’s query no longer runs. Open it to see why.
          </>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
