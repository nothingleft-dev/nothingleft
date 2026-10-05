'use client';

import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { Organization } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { Skeleton } from '@components/ui/skeleton';
import { OrganizationMark } from '@components/organization/organization-mark';
import { useSwitchOrganization } from '@hooks/use-organizations';
import { cn } from '@lib/utils';

interface OrgSwitcherProps {
  collapsed: boolean;
  org: Organization | null;
  organizations: Organization[];
  isPending: boolean;
  onNavigate?: (() => void) | undefined;
}

export function OrgSwitcher({ collapsed, org, organizations, isPending, onNavigate }: OrgSwitcherProps) {
  const router = useRouter();
  const switchTo = useSwitchOrganization();

  const caption = org
    ? `Organisation · ${org.seats.used} ${org.seats.used === 1 ? 'member' : 'members'}`
    : 'Organisation';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            'h-11 w-full justify-start gap-2 rounded-md px-2 font-medium hover:bg-hover',
            collapsed && 'justify-center px-0',
          )}
          title={org ? `${org.name} — switch organisation` : 'Switch organisation'}
        >
          <OrganizationMark organization={org} />
          {collapsed ? null : (
            <>
              <span className="flex min-w-0 flex-1 flex-col items-start text-left leading-4">
                {isPending && !org ? (
                  <Skeleton className="h-3.5 w-28" />
                ) : (
                  <span className="w-full truncate">{org?.name ?? 'No organisation'}</span>
                )}
                <span className="text-2xs font-normal text-text-muted">{caption}</span>
              </span>
              <ChevronsUpDown className="size-icon-sm text-text-muted" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-2xs font-normal text-text-muted">Organisations</DropdownMenuLabel>
        {organizations.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-text-muted">You are not a member of any organisation.</p>
        ) : (
          organizations.map(item => (
            <DropdownMenuItem
              key={item.slug}
              disabled={switchTo.isPending}
              onSelect={() => {
                if (item.slug === org?.slug) return;
                switchTo.mutate(item.slug, {
                  onSuccess: () => {
                    router.push('/dashboard');
                    onNavigate?.();
                  },
                });
              }}
            >
              <OrganizationMark
                organization={item}
                className="size-5 rounded-xs [&_[data-slot=avatar-fallback]]:text-[9px]"
              />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {item.slug === org?.slug ? <Check className="size-icon-sm" /> : null}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            router.push('/welcome/organization');
            onNavigate?.();
          }}
        >
          <Plus className="size-icon-sm" /> Create an organisation
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
