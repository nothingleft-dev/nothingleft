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
import { plural } from '@lib/numbers';
import { orgRoleLabel } from '@lib/roles';

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
  const loading = isPending && !org;
  const switchingTo = switchTo.isPending ? switchTo.variables : null;

  const caption = org
    ? `Organisation · ${plural(org.seats.used, 'member')}`
    : organizations.length > 0
      ? 'Choose an organisation'
      : 'Join or create one';

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
          {loading ? (
            <Skeleton className="size-avatar flex-none rounded-sm" />
          ) : (
            <OrganizationMark organization={org} />
          )}
          {collapsed ? null : (
            <>
              <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left leading-4">
                {loading ? (
                  <>
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </>
                ) : (
                  <>
                    <span className="w-full truncate">{org?.name ?? 'No organisation'}</span>
                    <span className="text-2xs font-normal text-text-secondary">{caption}</span>
                  </>
                )}
              </span>
              <ChevronsUpDown className="size-icon-sm flex-none text-text-muted" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className={collapsed ? 'w-64' : 'w-(--radix-dropdown-menu-trigger-width)'}>
        <DropdownMenuLabel className="text-2xs font-normal text-text-muted">Organisations</DropdownMenuLabel>
        {organizations.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-text-secondary">You are not a member of any organisation.</p>
        ) : (
          organizations.map(item => {
            const current = item.slug === org?.slug;
            const target = item.slug === switchingTo;
            return (
              <DropdownMenuItem
                key={item.slug}
                disabled={switchingTo !== null && !target}
                aria-busy={target || undefined}
                onSelect={event => {
                  if (current || switchingTo !== null) {
                    if (target) event.preventDefault();
                    return;
                  }
                  switchTo.mutate(item.slug, {
                    onSuccess: () => {
                      router.push('/dashboard');
                      onNavigate?.();
                    },
                  });
                }}
                className="items-start gap-2 py-1.5"
              >
                <OrganizationMark
                  organization={item}
                  className="mt-0.5 size-5 rounded-xs [&_[data-slot=avatar-fallback]]:text-[9px]"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{item.name}</span>
                  <span className="truncate text-2xs text-text-secondary">
                    {target
                      ? 'Switching…'
                      : `${plural(item.seats.used, 'member')} · ${orgRoleLabel(item.membership.org_role, item.membership.is_owner)}`}
                  </span>
                </span>
                {current && switchingTo === null ? <Check className="mt-0.5 size-icon-sm flex-none" /> : null}
              </DropdownMenuItem>
            );
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={switchingTo !== null}
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
