'use client';

import type { Route } from 'next';
import { useSearchParams } from 'next/navigation';
import type { SavedView } from '@nothingleft/types';
import { NavCount, NavItem } from '@components/shell/nav-item';
import { useIssueCount } from '@hooks/use-issue-search';
import { writeListState } from '@lib/issue-list/url-state';
import { cn } from '@lib/utils';

/** A project view opens inside its project; anything else on the cross-project list. */
export function savedViewHref(view: SavedView): Route {
  const base = view.project ? `/projects/${view.project.key}/issues` : '/issues';
  const sort = view.sort.map(s => `${s.attribute} ${s.direction}`).join(', ');
  return `${base}${writeListState({ q: view.query, view: view.name, group: 'status', sort })}` as Route;
}

export function SavedViewNavItem({ view }: { view: SavedView }) {
  const count = useIssueCount(view.query, view.project?.key);
  const active = useSearchParams().get('view')?.toLowerCase() === view.name.toLowerCase();
  return (
    <NavItem
      href={savedViewHref(view)}
      label={view.name}
      active={active}
      icon={({ className }) => (
        <span className={cn('grid place-items-center', className)}>
          <span className="size-1.5 rounded-full bg-text-muted" />
        </span>
      )}
      trailing={count.data !== undefined ? <NavCount value={count.data} /> : null}
    />
  );
}
