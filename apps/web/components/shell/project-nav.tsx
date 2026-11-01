'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { Check, ChevronRight } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { NavItem } from '@components/shell/nav-item';
import { ProjectMark } from '@components/projects/project-mark';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
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
  // Entering a project opens its group once; after that the chevron is the person's to toggle.
  const [wasWithin, setWasWithin] = useState(within);
  if (within !== wasWithin) {
    setWasWithin(within);
    if (within) setOpen(true);
  }

  const keyMark = <ProjectMark project={project} className="size-avatar-sm rounded-sm text-[10px]" />;

  if (collapsed) return <CollapsedProject project={project} base={base} within={within} mark={keyMark} />;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex h-control w-full items-center gap-2 rounded-sm px-2 text-left text-text-secondary hover:bg-hover hover:text-text"
      >
        <ChevronRight
          className={cn(
            'size-3 flex-none text-text-muted transition-transform duration-(--dur-fast)',
            open && 'rotate-90',
          )}
        />
        {keyMark}
        <span className="min-w-0 flex-1 truncate">{project.name}</span>
        <span className="font-mono text-2xs text-text-muted">{project.key}</span>
      </button>
      {open ? (
        <ul className="ml-[22px] border-l pl-1.5">
          {sectionsOf(project, base).map(({ label, href }) => (
            <li key={href}>
              <NavItem href={href as Route} label={label} size="sub" />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const sectionsOf = (project: ProjectNav, base: string) => [
  ...SECTIONS.map(([label, slug]) => ({ label, href: `${base}/${slug}` })),
  ...(project.canAdmin ? [{ label: 'Settings', href: `${base}/settings` }] : []),
];

// The collapsed rail has no room for the sections, so the mark opens them: on hover, click or keyboard.
function CollapsedProject({
  project,
  base,
  within,
  mark,
}: {
  project: ProjectNav;
  base: string;
  within: boolean;
  mark: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const closing = useRef<number | null>(null);
  const hold = () => {
    if (closing.current !== null) window.clearTimeout(closing.current);
    closing.current = null;
  };
  const show = () => {
    hold();
    setOpen(true);
  };
  const hide = () => {
    hold();
    closing.current = window.setTimeout(() => setOpen(false), 150);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${project.name} sections`}
          aria-current={within ? 'page' : undefined}
          onPointerEnter={event => event.pointerType === 'mouse' && show()}
          onPointerLeave={event => event.pointerType === 'mouse' && hide()}
          className={cn(
            'flex h-control w-full items-center justify-center rounded-sm hover:bg-hover data-[state=open]:bg-hover',
            within && 'bg-active',
          )}
        >
          {mark}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={6}
        className="min-w-48"
        onPointerEnter={hold}
        onPointerLeave={hide}
        onCloseAutoFocus={event => event.preventDefault()}
      >
        <DropdownMenuLabel className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate">{project.name}</span>
          <span className="font-mono text-2xs font-normal text-text-muted">{project.key}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {sectionsOf(project, base).map(({ label, href }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <DropdownMenuItem key={href} asChild>
              <Link href={href as Route} aria-current={active ? 'page' : undefined}>
                <span className="flex-1">{label}</span>
                {active ? <Check className="size-icon-sm text-text-muted" /> : null}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
