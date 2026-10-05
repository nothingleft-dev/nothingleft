'use client';

import { useState } from 'react';
import { MoreHorizontal, Search } from 'lucide-react';
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
import { RowsSkeleton } from '@components/skeletons';
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

export function MembersTab({ organization, isAdmin }: { organization: Organization; isAdmin: boolean }) {
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 250);
  const members = useMembers(organization.slug, q ? { q } : {});
  const [removing, setRemoving] = useState<Member | null>(null);

  const update = useUpdateMember(organization.slug);
  const error = useApiError(update.error);

  const rows = members.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      {error.summary ? <FormAlert title={error.summary} /> : null}

      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-icon-sm -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, username or email"
            aria-label="Search members"
            className="h-control w-full rounded-md border bg-surface pl-8 pr-3 text-sm text-text placeholder:text-text-muted hover:border-border-strong focus:border-border-strong"
          />
        </div>
        <span className="text-xs text-text-muted">
          {organization.seats.used} {organization.seats.used === 1 ? 'member' : 'members'}
        </span>
      </div>

      {members.isPending ? (
        <RowsSkeleton rows={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={q ? `Nobody matches “${q}”.` : 'No members yet.'}
          description={q ? 'Clear the search to see everyone.' : 'Invite people from the Invites tab.'}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle rounded-md border">
          {rows.map(member => (
            <li key={member.username} className="flex h-row-lg items-center gap-3 px-3">
              <MemberAvatar member={member} className="size-avatar" initialsClassName="text-[10px]" />

              <div className="flex min-w-0 flex-1 flex-col leading-4">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className={cn('truncate font-medium', deactivatedInk(member))}>{member.name}</span>
                  {member.deactivated ? <InactiveChip /> : null}
                </span>
                <span className="truncate font-mono text-xs text-text-muted">@{member.username}</span>
              </div>

              {member.email ? (
                <span className="truncate text-xs text-text-muted max-md:hidden">{member.email}</span>
              ) : null}

              <span className="w-28 text-xs text-text-secondary">{orgRoleLabel(member.org_role, member.is_owner)}</span>

              <RelativeTime value={member.joined_at} className="w-24 text-right text-xs max-sm:hidden" />

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
              ) : (
                <span className="size-8" />
              )}
            </li>
          ))}
        </ul>
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
        <Button variant="ghost" size="icon-sm" aria-label={`Manage ${member.name}`}>
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
