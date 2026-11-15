'use client';

import {
  BookOpen,
  Building2,
  CalendarDays,
  ChartBarBig,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Home,
  Inbox,
  Keyboard,
  LogOut,
  Plus,
  Settings,
  Star,
  UserCheck,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Route } from 'next';
import type { Me } from '@nothingleft/types';
import { Avatar, AvatarFallback } from '@components/ui/avatar';
import { AvatarImage } from '@components/avatar-image';
import { Button } from '@components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { ScrollArea } from '@components/ui/scroll-area';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { Kbd } from '@components/kbd';
import { RetryButton } from '@components/query-state';
import { Brand } from '@components/shell/brand';
import { NAV_ROW, NavCount, NavItem } from '@components/shell/nav-item';
import { OrgSwitcher } from '@components/shell/org-switcher';
import { ProjectNavItem } from '@components/shell/project-nav';
import { SavedViewNavItem } from '@components/shell/saved-view-nav';
import type { ShellData, ShellListState } from '@hooks/use-shell-data';
import { useSignOut } from '@hooks/use-sign-out';
import { initialsOf } from '@lib/initials';
import { cn } from '@lib/utils';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  user: Me | null;
  data: ShellData;
  mobile?: boolean;
  onNavigate?: () => void;
}

// Set from script, not a scroll-driven animation: Firefox has none, and screenshots freeze one at its end.
const EDGE_FADE =
  '[&>[data-slot=scroll-area-viewport]]:[mask-image:linear-gradient(to_bottom,transparent,#000_var(--fade-top,0px),#000_calc(100%_-_var(--fade-bottom,0px)),transparent)]';

/** Fades the list's edges while there is more past them. */
function useEdgeFade(root: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = root.current;
    const viewport = el?.querySelector<HTMLElement>('[data-slot=scroll-area-viewport]');
    if (!el || !viewport) return;
    const measure = () => {
      const above = viewport.scrollTop > 0;
      const below = viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 1;
      el.style.setProperty('--fade-top', above ? '1rem' : '0px');
      el.style.setProperty('--fade-bottom', below ? '2rem' : '0px');
    };
    measure();
    viewport.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    return () => {
      viewport.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [root]);
}

function SectionHead({ children, action, collapsed }: { children: string; action?: ReactNode; collapsed: boolean }) {
  if (collapsed) return <div className="my-2 border-t" />;
  return (
    <div className="mt-3 flex h-control items-center px-2 text-xs font-medium text-text-muted">
      <span className="flex-1">{children}</span>
      {action}
    </div>
  );
}

function Hint({ children, danger }: { children: ReactNode; danger?: boolean }) {
  return <p className={cn('px-2 py-1 text-xs', danger ? 'text-danger-fg' : 'text-text-secondary')}>{children}</p>;
}

/** `project` rows keep the chevron's gutter and the mark's size, so loaded rows land where the skeleton was. */
function NavSkeleton({ rows, collapsed, project }: { rows: number; collapsed: boolean; project?: boolean }) {
  return (
    <div className="flex flex-col gap-px" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-control items-center gap-2 px-2">
          {project && !collapsed ? <span className="size-3 flex-none" /> : null}
          <Skeleton className={cn('flex-none', project ? 'size-avatar-sm rounded-sm' : 'size-icon rounded-xs')} />
          {collapsed ? null : <Skeleton className="h-3" style={{ width: `${50 + ((i * 19) % 30)}%` }} />}
        </div>
      ))}
    </div>
  );
}

/** A list that loads after the page holds as many rows as it had last time, so what sits below it stays put. */
function useRememberedRows(name: string, state: ShellListState, count: number, fallback: number) {
  const key = `nl.sidebar.rows.${name}`;
  const [rows] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === null ? fallback : Math.min(Math.max(Number(stored) || 0, 1), 12);
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    if (state !== 'ready') return;
    try {
      window.localStorage.setItem(key, String(count));
    } catch {
      // Blocked storage: the next load guesses again.
    }
  }, [key, state, count]);
  return rows;
}

export function Sidebar({ collapsed, onToggle, user, data, mobile, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const CollapseIcon = collapsed ? ChevronsRight : ChevronsLeft;
  const noOrg = data.noOrganization;
  const projectRows = useRememberedRows('projects', data.projectsState, data.projects.length, 3);
  const viewRows = useRememberedRows('views', data.savedViewsState, data.savedViews.length, 3);

  const scroller = useRef<HTMLDivElement>(null);
  useEdgeFade(scroller);
  useEffect(() => {
    scroller.current
      ?.querySelector('[data-slot=scroll-area-viewport] [aria-current=page]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [pathname, collapsed, data.projects.length]);

  return (
    <aside
      data-collapsed={collapsed || undefined}
      onClick={event => {
        if (event.target instanceof Element && event.target.closest('a[href]')) onNavigate?.();
      }}
      className={cn(
        'flex h-full flex-col gap-1 border-r bg-app p-2',
        mobile ? 'w-full border-r-0' : collapsed ? 'w-sidebar-collapsed' : 'w-sidebar',
      )}
    >
      <Brand collapsed={collapsed} />
      <OrgSwitcher
        collapsed={collapsed}
        org={data.org}
        organizations={data.organizations}
        isPending={data.isPending}
        onNavigate={onNavigate}
      />

      <ScrollArea
        ref={scroller}
        className={cn('min-h-0 flex-1 overflow-visible [&_[aria-current=page]]:scroll-my-10', EDGE_FADE)}
      >
        {noOrg ? (
          <nav aria-label="Personal" className="flex flex-col gap-px">
            <NavItem href="/" label="Home" icon={Home} collapsed={collapsed} exact />
            <NavItem
              href="/inbox"
              label="Inbox"
              icon={Inbox}
              collapsed={collapsed}
              trailing={<NavCount value={data.counts.inboxUnread} unread />}
            />
            {collapsed ? null : (
              <Hint>
                {data.organizations.length > 0
                  ? 'Choose an organisation to see its projects and issues.'
                  : 'Join or create an organisation to see projects and issues.'}
              </Hint>
            )}
          </nav>
        ) : (
          <>
            <nav aria-label="Personal" className="flex flex-col gap-px">
              <NavItem href="/dashboard" label="Home" icon={Home} collapsed={collapsed} />
              <NavItem
                href="/inbox"
                label="Inbox"
                icon={Inbox}
                collapsed={collapsed}
                trailing={<NavCount value={data.counts.inboxUnread} unread />}
              />
              <NavItem
                href="/my-issues"
                label="My issues"
                icon={UserCheck}
                collapsed={collapsed}
                trailing={<NavCount value={data.counts.myIssues} />}
              />
              <NavItem href="/starred" label="Starred" icon={Star} collapsed={collapsed} />
              <NavItem href={'/articles' as Route} label="Knowledge base" icon={BookOpen} collapsed={collapsed} />
              <NavItem href={'/reports' as Route} label="Reports" icon={ChartBarBig} collapsed={collapsed} />
              <NavItem href={'/timesheets' as Route} label="Timesheets" icon={CalendarDays} collapsed={collapsed} />
            </nav>

            <SectionHead
              collapsed={collapsed}
              action={
                data.canCreateProject ? (
                  <Button
                    asChild
                    variant="ghost"
                    size="icon-xs"
                    aria-label="New project"
                    className="size-5 text-text-muted"
                  >
                    <Link href={'/projects?new=1' as Route}>
                      <Plus className="size-icon-sm" />
                    </Link>
                  </Button>
                ) : undefined
              }
            >
              Projects
            </SectionHead>
            <nav aria-label="Projects" className="flex flex-col gap-px">
              {data.projects.map(p => (
                <ProjectNavItem key={p.key} project={p} collapsed={collapsed} />
              ))}
            </nav>
            {data.projectsState === 'loading' ? (
              <NavSkeleton rows={projectRows} collapsed={collapsed} project />
            ) : collapsed ? null : data.projectsState === 'failed' ? (
              <div className="flex items-center gap-2 px-2 py-1">
                <p className="min-w-0 flex-1 text-xs text-danger-fg">Projects did not load.</p>
                <RetryButton onRetry={data.retryProjects} size="xs" />
              </div>
            ) : data.projects.length === 0 ? (
              <Hint>No projects yet.</Hint>
            ) : null}

            {collapsed ? null : (
              <>
                <SectionHead collapsed={collapsed}>Saved views</SectionHead>
                <nav aria-label="Saved views" className="flex flex-col gap-px">
                  {data.savedViews.map(v => (
                    <SavedViewNavItem key={`${v.owner.username}/${v.name}`} view={v} />
                  ))}
                </nav>
                {data.savedViewsState === 'loading' ? (
                  <NavSkeleton rows={viewRows} collapsed={collapsed} />
                ) : data.savedViewsState === 'failed' ? (
                  <Hint danger>Saved views did not load.</Hint>
                ) : data.savedViews.length === 0 ? (
                  <Hint>Save a search to pin it here.</Hint>
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollArea>

      <nav aria-label="Account" className="flex flex-col gap-px border-t pt-2">
        {noOrg ? null : (
          <NavItem
            href="/organization"
            label="Organisation"
            icon={Building2}
            collapsed={collapsed}
            active={pathname === '/organization' || pathname.startsWith('/git/')}
          />
        )}
        <NavItem href="/settings" label="Settings" icon={Settings} collapsed={collapsed} />
        <NavItem
          href="/shortcuts"
          label="Shortcuts"
          icon={Keyboard}
          collapsed={collapsed}
          trailing={<Kbd className="ml-auto max-md:hidden">?</Kbd>}
        />
        <AccountMenu user={user} collapsed={collapsed} />
        {mobile ? null : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onToggle}
                className={cn(NAV_ROW, collapsed && 'justify-center px-0')}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                <CollapseIcon className="size-icon flex-none" />
                {collapsed ? null : <span className="flex-1 text-left">Collapse</span>}
                {collapsed ? null : <Kbd>[</Kbd>}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{collapsed ? 'Expand' : 'Collapse'} sidebar · [</TooltipContent>
          </Tooltip>
        )}
      </nav>
    </aside>
  );
}

function AccountMenu({ user, collapsed }: { user: Me | null; collapsed: boolean }) {
  const signOut = useSignOut();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(NAV_ROW, 'data-[state=open]:bg-hover', collapsed && 'justify-center px-0')}
          aria-label="Account"
        >
          {/* The 22px avatar centred on the 16px icon column, so the name starts where every label does. */}
          <Avatar className="-mx-[3px] size-avatar-sm flex-none">
            {user?.avatar_url ? <AvatarImage src={user.avatar_url} alt="" /> : null}
            <AvatarFallback className="bg-inset text-[10px] font-semibold text-text-secondary">
              {user ? initialsOf(user.name) : null}
            </AvatarFallback>
          </Avatar>
          {collapsed ? null : (
            <>
              <span className="min-w-0 flex-1 truncate text-left">{user?.name ?? 'Account'}</span>
              <ChevronsUpDown className="size-icon-sm flex-none text-text-muted" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        {user ? (
          <>
            <div className="px-2 py-1.5">
              <p className="truncate font-medium text-text">{user.name}</p>
              <p className="truncate text-xs text-text-muted">{user.email}</p>
            </div>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href={'/settings?tab=profile' as Route}>
            <Settings className="size-icon-sm" /> Account settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={signOut.isPending} onSelect={() => signOut.mutate()}>
          <LogOut className="size-icon-sm" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
