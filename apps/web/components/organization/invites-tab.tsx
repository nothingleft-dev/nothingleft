'use client';

import { toast } from 'sonner';
import type { Invitation, Organization } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { EmptyState } from '@components/empty-state';
import { TableSkeleton } from '@components/skeletons';
import { LoadError, errorDetail } from '@components/query-state';
import { RelativeTime } from '@components/relative-time';
import { SettingsSection } from '@components/settings/section';
import { InviteEmailsForm } from '@components/invitations/invite-emails-form';
import { ShareLinks } from '@components/invitations/share-links';
import { useInvitations, useRevokeInvitation } from '@hooks/use-invitations';
import { grantedRoleLabel } from '@lib/roles';
import { cn } from '@lib/utils';

const STATUS_LABEL: Record<Invitation['status'], string> = {
  active: 'Waiting',
  accepted: 'Accepted',
  expired: 'Expired',
  exhausted: 'Used up',
  revoked: 'Revoked',
};

const INVITE_COLUMNS = [{}, { className: 'w-28' }, { className: 'w-32 max-sm:hidden' }, { className: 'w-24' }] as const;

export function InvitesTab({ organization }: { organization: Organization }) {
  const scope = { kind: 'organization', slug: organization.slug } as const;
  const invitations = useInvitations(scope);
  const revoke = useRevokeInvitation(scope, organization.slug);

  const emails = (invitations.data ?? []).filter(i => i.kind === 'email');

  return (
    <div className="flex flex-col gap-5">
      <SettingsSection title="Invite by email" description="Each address gets its own invitation by email.">
        <InviteEmailsForm scope={scope} canGrantOrgAdmin seats={organization.seats} />
      </SettingsSection>

      <SettingsSection title="Email invitations" description="Everything sent, in every state.">
        {invitations.isPending ? (
          <TableSkeleton columns={INVITE_COLUMNS} rows={4} rowClassName="h-row-lg" />
        ) : !invitations.data ? (
          <LoadError onRetry={() => void invitations.refetch()} detail={errorDetail(invitations.error)}>
            The invitations could not be loaded.
          </LoadError>
        ) : emails.length === 0 ? (
          <EmptyState
            title="Nothing sent yet."
            description="Addresses you invite above appear here until they are used."
          />
        ) : (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-app text-left text-2xs text-text-secondary">
                <tr>
                  <th className="h-7 px-3 font-medium">Address</th>
                  <th className="w-28 px-3 font-medium">Status</th>
                  <th className="w-32 px-3 font-medium max-sm:hidden">Sent</th>
                  <th className="w-24" aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {emails.map(invitation => {
                  const live = invitation.status === 'active';
                  return (
                    <tr key={invitation.id} className="h-row-lg">
                      <td className="px-3">
                        <div className="flex min-w-0 flex-col leading-4">
                          <span
                            className={cn('truncate', !live && 'text-text-secondary')}
                            title={invitation.email ?? undefined}
                          >
                            {invitation.email}
                          </span>
                          <span className="truncate text-xs text-text-secondary">
                            {grantedRoleLabel(invitation.org_role, invitation.project_role)}
                            {invitation.project_key ? ` in ${invitation.project_key}` : ''}, invited by{' '}
                            {invitation.created_by.name}
                          </span>
                        </div>
                      </td>
                      <td className={cn('px-3 text-xs', live ? 'text-text' : 'text-text-secondary')}>
                        {STATUS_LABEL[invitation.status]}
                      </td>
                      <td className="px-3 max-sm:hidden">
                        <RelativeTime value={invitation.created_at} className="text-xs tabular" />
                      </td>
                      <td className="pr-2 text-right">
                        {live ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={revoke.isPending}
                            onClick={() =>
                              revoke.mutate(invitation.id, { onSuccess: () => toast.success('Invitation revoked.') })
                            }
                          >
                            Revoke
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title="Share links"
        description="Anyone with a link joins as a Member. Replacing a link makes the old one stop working."
      >
        <ShareLinks scope={scope} orgSlug={organization.slug} />
      </SettingsSection>
    </div>
  );
}
