'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { NavItem } from '@components/shell/nav-item';
import { ProjectMark } from '@components/projects/project-mark';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import type { ProjectNav } from '@hooks/use-shell-data';
import { cn } from '@lib/utils';

// Slugs come from frontend-guide.md § Routes; the pages land in their own sub-phases.
const SECTIONS = [
  ['Issues', 'issues'],
  ['Board', 'board'],
  ['Backlog', 'backlog'],
  ['Reports', 'reports'],
  ['Knowledge base', 'articles'],
] as const;

export function ProjectNavItem({ project, collapsed }: { project: ProjectNav; collapsed: boolean }) {
  const pathname = usePathname();
  const base = `/projects/${project.key}` as const;
  const within = pathname.startsWith(`${base}/`);
  const [open, setOpen] = useState(within);
  const expanded = open || within;

  const keyMark = <ProjectMark project={project} className="size-avatar-sm rounded-sm text-[10px]" />;

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={`${base}/issues` as Route}
            aria-current={within ? 'page' : undefined}
            className={cn(
              'flex h-control items-center justify-center rounded-sm hover:bg-hover',
              within && 'bg-active',
            )}
          >
            {keyMark}
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{project.name}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={expanded}
        className="flex h-control w-full items-center gap-2 rounded-sm px-2 text-left text-text-secondary hover:bg-hover hover:text-text"
      >
        <ChevronRight
          className={cn(
            'size-3 flex-none text-text-muted transition-transform duration-(--dur-fast)',
            expanded && 'rotate-90',
          )}
        />
        {keyMark}
        <span className="min-w-0 flex-1 truncate">{project.name}</span>
        <span className="font-mono text-2xs text-text-muted">{project.key}</span>
      </button>
      {expanded ? (
        <ul className="ml-[22px] border-l pl-1.5">
          {SECTIONS.map(([label, slug]) => (
            <li key={slug}>
              {/* Non-issue sections remain scaffold links until their routes land. */}
              <NavItem href={`${base}/${slug}` as Route} label={label} size="sub" />
            </li>
          ))}
          {project.canAdmin ? (
            <li>
              <NavItem href={`${base}/settings` as Route} label="Settings" size="sub" />
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
