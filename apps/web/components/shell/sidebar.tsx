'use client';

import {
  BookOpen,
  Building2,
  CalendarDays,
  ChartBarBig,
  ChevronsLeft,
  ChevronsRight,
  Home,
  Inbox,
  LogOut,
  Plus,
  Settings,
  Star,
  UserCheck,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Route } from 'next';
import type { Me } from '@nothingleft/types';
import { Avatar, AvatarFallback, AvatarImage } from '@components/ui/avatar';
import { Button } from '@components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { ScrollArea } from '@components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { Kbd } from '@components/kbd';
import { Brand } from '@components/shell/brand';
import { NavCount, NavItem } from '@components/shell/nav-item';
import { OrgSwitcher } from '@components/shell/org-switcher';
import { ProjectNavItem } from '@components/shell/project-nav';
import { SavedViewNavItem } from '@components/shell/saved-view-nav';
import type { ShellData } from '@hooks/use-shell-data';
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

function SectionHead({ children, action, collapsed }: { children: string; action?: ReactNode; collapsed: boolean }) {
  if (collapsed) return <div className="my-2 border-t" />;
  return (
    <div className="mt-3 flex h-control items-center px-2 text-xs font-medium text-text-muted">
      <span className="flex-1">{children}</span>
      {action}
    </div>
  );
}

function Hint({ children }: { children: string }) {
  return <p className="px-2 py-1 text-xs text-text-muted">{children}</p>;
}

export function Sidebar({ collapsed, onToggle, user, data, mobile, onNavigate }: SidebarProps) {
  const CollapseIcon = collapsed ? ChevronsRight : ChevronsLeft;

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

      <ScrollArea className="min-h-0 flex-1 overflow-visible">
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
        {!collapsed && data.projects.length === 0 ? (
          <Hint>{data.isPending ? 'Loading projects…' : 'No projects yet.'}</Hint>
        ) : null}

        {collapsed ? null : (
          <>
            <SectionHead collapsed={collapsed}>Saved views</SectionHead>
            <nav aria-label="Saved views" className="flex flex-col gap-px">
              {data.savedViews.map(v => (
                <SavedViewNavItem key={`${v.owner.username}/${v.name}`} view={v} />
              ))}
            </nav>
            {data.savedViews.length === 0 ? <Hint>Save a search to pin it here.</Hint> : null}
          </>
        )}
      </ScrollArea>

      <nav aria-label="Account" className="flex flex-col gap-px border-t pt-2">
        <NavItem href="/organization" label="Organisation" icon={Building2} collapsed={collapsed} />
        <NavItem href="/settings" label="Settings" icon={Settings} collapsed={collapsed} />
        <NavItem
          href="/shortcuts"
          label="Shortcuts"
          collapsed={collapsed}
          trailing={<Kbd className="ml-auto">?</Kbd>}
          icon={({ className }) => (
            <span className={cn('grid place-items-center text-xs font-semibold', className)}>?</span>
          )}
        />
        <AccountMenu user={user} collapsed={collapsed} />
        {mobile ? null : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                onClick={onToggle}
                className={cn(
                  'h-control w-full justify-start gap-2 px-2 font-normal text-text-secondary hover:bg-hover',
                  collapsed && 'justify-center px-0',
                )}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                <CollapseIcon className="size-icon" />
                {collapsed ? null : <span className="flex-1 text-left">Collapse</span>}
                {collapsed ? null : <Kbd>[</Kbd>}
              </Button>
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
        <Button
          variant="ghost"
          className={cn(
            'h-control w-full justify-start gap-2 px-2 font-normal text-text-secondary hover:bg-hover',
            collapsed && 'justify-center px-0',
          )}
          aria-label="Account"
        >
          <Avatar className="size-avatar-sm">
            {user?.avatar_url ? <AvatarImage src={user.avatar_url} alt="" /> : null}
            <AvatarFallback className="bg-inset text-[10px] font-semibold text-text-secondary">
              {user ? initialsOf(user.name) : '?'}
            </AvatarFallback>
          </Avatar>
          {collapsed ? null : <span className="min-w-0 flex-1 truncate text-left">{user?.name ?? 'Account'}</span>}
        </Button>
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
