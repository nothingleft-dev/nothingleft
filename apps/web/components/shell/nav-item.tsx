'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import type { ComponentType, ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { cn } from '@lib/utils';

interface NavItemProps<T extends string> {
  href: Route<T>;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  trailing?: ReactNode;
  collapsed?: boolean;
  exact?: boolean;
  /** Overrides the pathname match: a link whose identity lives in its query string. */
  active?: boolean;
  size?: 'default' | 'sub';
}

export const ACTIVE_BAR =
  'before:absolute before:left-0 before:top-[7px] before:bottom-[7px] before:w-0.5 before:rounded-[1px] before:bg-brand';

/** A sidebar row: one 16px icon slot, so every label starts on the same line. */
export const NAV_ROW =
  'relative flex h-control w-full items-center gap-2 rounded-sm px-2 text-text-secondary hover:bg-hover hover:text-text';

const UNREAD_CAP = 99;

/** One cap for every unread badge, so the top bar and the sidebar never disagree. */
export const unreadBadgeText = (count: number) => (count > UNREAD_CAP ? `${UNREAD_CAP}+` : String(count));

export function NavCount({ value, unread = false }: { value: number; unread?: boolean }) {
  if (value <= 0) return null;
  return (
    <span
      data-nav-count
      data-unread={unread || undefined}
      className={cn(
        'ml-auto text-2xs font-medium tabular text-text-muted',
        unread && 'min-w-[18px] rounded-full bg-brand px-[5px] text-center leading-4 text-on-brand',
      )}
    >
      {unread ? unreadBadgeText(value) : value}
    </span>
  );
}

export function NavItem<T extends string>({
  href,
  label,
  icon: Icon,
  trailing,
  collapsed = false,
  exact = false,
  active: activeOverride,
  size = 'default',
}: NavItemProps<T>) {
  const pathname = usePathname();
  const active = activeOverride ?? (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  const link = (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        NAV_ROW,
        size === 'sub' && 'h-7 text-xs max-md:h-control max-md:text-sm',
        active && 'bg-active font-medium text-text [&_[data-nav-count]:not([data-unread])]:text-text-secondary',
        active && size === 'default' && ACTIVE_BAR,
        collapsed && 'justify-center px-0',
      )}
    >
      {Icon ? <Icon className="size-icon flex-none" /> : null}
      {collapsed ? null : <span className="min-w-0 flex-1 truncate">{label}</span>}
      {collapsed ? null : trailing}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
