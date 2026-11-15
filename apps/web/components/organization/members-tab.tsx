'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { MoreHorizontal, Search, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { ORG_ROLES, type Member, type OrgRole, type Organization } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { EmptyState } from '@components/empty-state';
import { Skeleton } from '@components/ui/skeleton';
import { LoadError, errorDetail } from '@components/query-state';
import { RelativeTime } from '@components/relative-time';
import { FormAlert } from '@components/auth/form-alert';
import { RemoveMemberDialog } from '@components/organization/remove-member-dialog';
import { MemberAvatar } from '@components/issues/member-avatar';
import { InactiveChip, deactivatedInk } from '@components/former-member-chip';
import { useApiError } from '@hooks/use-api-error';
import { useMembers, useUpdateMember } from '@hooks/use-members';
import { useDebounced } from '@hooks/use-debounced';
import { cn } from '@lib/utils';
import { ORG_ROLE_LABELS, orgRoleLabel } from '@lib/roles';
import { formatCount, plural } from '@lib/numbers';

const NAME_COLUMN = 'md:w-[38%]';

export function MembersSkeleton() {
  return (
    <div className="overflow-hidden rounded-md border" aria-hidden>
      <table className="w-full table-fixed">
        <thead className="bg-app">
          <tr className="h-7">
            <th className={cn('px-3', NAME_COLUMN)}>
              <Skeleton className="h-2.5 w-10" />
            </th>
            <th className="px-3 max-md:hidden">
              <Skeleton className="h-2.5 w-10" />
            </th>
            <th className="w-32 px-3">
              <Skeleton className="h-2.5 w-8" />
            </th>
            <th className="w-32 px-3 max-sm:hidden">
              <Skeleton className="h-2.5 w-10" />
            </th>
            <th className="w-12" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {Array.from({ length: 6 }, (_, i) => (
            <tr key={i} className="h-row-lg">
              <td className="px-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-avatar shrink-0 rounded-full" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Skeleton className="h-3" style={{ width: `${40 + ((i * 17) % 35)}%` }} />
                    <Skeleton className="h-2 w-16" />
                  </div>
                </div>
              </td>
              <td className="px-3 max-md:hidden">
                <Skeleton className="h-3" style={{ width: `${45 + ((i * 13) % 30)}%` }} />
              </td>
              <td className="px-3">
                <Skeleton className="h-3 w-16" />
              </td>
              <td className="px-3 max-sm:hidden">
                <Skeleton className="h-3 w-20" />
              </td>
              <td />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MembersTab({ organization, isAdmin }: { organization: Organization; isAdmin: boolean }) {
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 250);
  const members = useMembers(organization.slug, q ? { q } : {});
  const [removing, setRemoving] = useState<Member | null>(null);

  const update = useUpdateMember(organization.slug);
  const error = useApiError(update.error, []);

  const rows = members.data ?? [];
  const total = organization.seats.used;

  return (
    <div className="flex flex-col gap-4">
      {error.summary ? <FormAlert title="The role was not changed.">{error.summary}</FormAlert> : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs min-w-48 flex-1 max-sm:max-w-none max-sm:basis-full">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-icon-sm -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, username or email"
            aria-label="Search members"
            className="h-control w-full rounded-md border bg-surface pl-8 pr-3 text-sm text-text placeholder:text-text-muted hover:border-border-strong focus:border-border-strong"
          />
        </div>
        {members.data ? (
          <span className="text-xs text-text-secondary tabular" role="status">
            {q ? `${formatCount(rows.length)} of ${plural(total, 'member')}` : plural(total, 'member')}
          </span>
        ) : members.isPending ? (
          <Skeleton className="h-3 w-16" />
        ) : null}
        {isAdmin ? (
          <Button asChild variant="outline" size="sm" className="ml-auto">
            <Link href={'/organization?tab=invites' as Route}>
              <UserPlus className="size-icon-sm" />
              Invite people
            </Link>
          </Button>
        ) : null}
      </div>

      {members.isPending ? (
        <MembersSkeleton />
      ) : members.isError && !members.data ? (
        <LoadError onRetry={() => void members.refetch()} detail={errorDetail(members.error)}>
          The members could not be loaded.
        </LoadError>
      ) : rows.length === 0 ? (
        <EmptyState
          title={q ? `Nobody matches “${q}”.` : 'No members yet.'}
          description={q ? 'Clear the search to see everyone.' : 'Invite people from the Invites tab.'}
          action={
            q ? (
              <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                Clear the search
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={'overflow-hidden rounded-md border'}>
          <table className="w-full table-fixed text-sm">
            <thead className="bg-app text-left text-2xs text-text-secondary">
              <tr>
                <th className={cn('h-7 px-3 font-medium', NAME_COLUMN)}>Name</th>
                <th className="px-3 font-medium max-md:hidden">Email</th>
                <th className="w-32 px-3 font-medium">Role</th>
                <th className="w-32 px-3 font-medium max-sm:hidden">Joined</th>
                <th className="w-12" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map(member => (
                <tr key={member.username} className="h-row-lg hover:bg-hover has-[[data-state=open]]:bg-hover">
                  <td className="px-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <MemberAvatar member={member} className="size-avatar" initialsClassName="text-[10px]" />
                      <div className="flex min-w-0 flex-col leading-4">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className={cn('truncate font-medium', deactivatedInk(member))} title={member.name}>
                            {member.name}
                          </span>
                          {member.deactivated ? <InactiveChip /> : null}
                        </span>
                        <span className="truncate font-mono text-2xs text-text-secondary">@{member.username}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 max-md:hidden">
                    <span
                      className={cn('block truncate text-xs text-text-secondary', deactivatedInk(member))}
                      title={member.email ?? undefined}
                    >
                      {member.email ?? '–'}
                    </span>
                  </td>
                  <td className={cn('px-3 text-xs text-text-secondary', deactivatedInk(member))}>
                    {orgRoleLabel(member.org_role, member.is_owner)}
                  </td>
                  <td className="px-3 max-sm:hidden">
                    <RelativeTime value={member.joined_at} className={cn('text-xs tabular', deactivatedInk(member))} />
                  </td>
                  <td className="pr-2 text-right">
                    {isAdmin && !member.is_owner ? (
                      <MemberMenu
                        member={member}
                        onRole={role =>
                          update.mutate(
                            { username: member.username, body: { org_role: role } },
                            { onSuccess: () => toast.success(`${member.name} is now ${ORG_ROLE_LABELS[role]}.`) },
                          )
                        }
                        onRemove={() => setRemoving(member)}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RemoveMemberDialog organization={organization} member={removing} onClose={() => setRemoving(null)} />
    </div>
  );
}

function MemberMenu({
  member,
  onRole,
  onRemove,
}: {
  member: Member;
  onRole: (role: OrgRole) => void;
  onRemove: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Manage ${member.name}`}
          className="data-[state=open]:bg-active"
        >
          <MoreHorizontal className="size-icon-sm" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {ORG_ROLES.filter(role => role !== member.org_role).map(role => (
          <DropdownMenuItem key={role} onSelect={() => onRole(role)}>
            Make {ORG_ROLE_LABELS[role]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onRemove}>
          Remove from organisation
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
